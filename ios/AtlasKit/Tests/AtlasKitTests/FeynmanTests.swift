import Foundation
import Testing
@testable import AtlasKit

/// The teach-back is the phase that writes to the map, and it had no coverage
/// at all. Everything here is the pure half — how the judge's rows are read
/// against a rubric, what that means for the map, and what the row the learner
/// left behind has to hold.

@MainActor private func store(_ states: StateMap = [:]) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(
            nodes: [
                ConceptNode(id: "lat", label: "Limites laterais"),
                ConceptNode(id: "cadeia", label: "Regra da cadeia"),
            ],
            edges: [ConceptEdge("lat", "cadeia")]
        ),
        states: states,
        subject: "Cálculo I"
    )
}

@MainActor private func session(_ states: StateMap = [:]) -> (SessionViewModel, AtlasStore) {
    let store = store(states)
    return (SessionViewModel(node: store.graph.nodes[1], store: store), store)
}

/// A beat as the server writes one, `fix` included — every generation pays for
/// that block whether a client draws it or not.
@MainActor private func beat(_ index: Int) -> FeynmanBeat {
    let raw = """
    {"id":"b\(index)","subPoint":"Ponto \(index)","mustConvey":["x"],
     "fix":{"probe":"E se…?","replies":[
       {"label":"certa","correct":true,"response":"isso"},
       {"label":"errada","correct":false,"response":"não"}]},
     "gap":{"id":"cadeia-g\(index)","label":"Lacuna \(index)","reason":"não explicou","dx":40,"dy":60}}
    """
    return try! JSONDecoder().decode(FeynmanBeat.self, from: Data(raw.utf8))
}

/// A beat written before `fix` existed. It must still decode, or one old row
/// blanks the whole rubric.
@MainActor private func beatWithoutFix() -> FeynmanBeat {
    let raw = """
    {"id":"old","subPoint":"Ponto velho","mustConvey":["x"],
     "gap":{"id":"cadeia-old","label":"Lacuna","reason":"não explicou","dx":0,"dy":0}}
    """
    return try! JSONDecoder().decode(FeynmanBeat.self, from: Data(raw.utf8))
}

@MainActor private func report(_ rows: [(Int, String, String?)]) -> FeynmanJudgement {
    let verdicts = rows.map { row in
        let quote = row.2.map { "\"quote\":\"\($0)\"," } ?? ""
        return "{\"i\":\(row.0),\(quote)\"verdict\":\"\(row.1)\"}"
    }
    let raw = "{\"verdicts\":[\(verdicts.joined(separator: ","))],\"response\":\"ok\"}"
    return try! JSONDecoder().decode(FeynmanJudgement.self, from: Data(raw.utf8))
}

@MainActor
@Test func aRubricRowTheJudgeNeverRuledOnIsASkipRatherThanAPass() {
    let beats = [beat(0), beat(1), beat(2)]
    // Row 1 is missing from the payload entirely. Silence about a sub-point the
    // learner never mentioned is the finding this phase exists for — grading it
    // good is the one thing the read must never do.
    let read = feynmanVerdicts(report([(0, "good", "eu disse isso"), (2, "confused", "taxa de fora")]), beats)
    #expect(read.verdicts["b0"] == .good)
    #expect(read.verdicts["b1"] == .skipped)
    #expect(read.verdicts["b2"] == .confused)
    #expect(read.quotes["b2"] == "taxa de fora")
    #expect(read.quotes["b1"] == nil)
    #expect(feynmanGapCount(read.verdicts, beats) == 2)
    #expect(!feynmanClean(read.verdicts, beats))
}

@MainActor
@Test func anEmptyRubricIsNeverACleanPass() {
    // Nothing to prove is not proof. A stream that landed nothing must not
    // congratulate the learner on covering every part of it.
    #expect(!feynmanClean([:], []))
}

@MainActor
@Test func unresolvedRowsBecomeGapsQuotingTheLearner() {
    let (pass, store) = session(["lat": .mastered])
    let beats = [beat(0), beat(1), beat(2)]
    let read = feynmanVerdicts(report([(0, "good", "eu disse isso"), (2, "confused", "taxa de fora")]), beats)
    pass.settleFeynman(read.verdicts, beats: beats, quotes: read.quotes)

    #expect(store.states["cadeia-g0"] == nil)
    #expect(store.states["cadeia-g1"] == .gap)
    #expect(store.states["cadeia-g2"] == .gap)
    // The learner's own words are the whole context a later pass on the gap
    // opens with; without the quote it carries the reason written before they
    // said anything.
    #expect(store.graph.nodes.first { $0.id == "cadeia-g2" }?.summary?.contains("taxa de fora") == true)
    #expect(store.graph.nodes.first { $0.id == "cadeia-g1" }?.summary == "não explicou")
    // Every gap hangs on a dashed edge — a gap can never lock anything.
    #expect(store.graph.edges.filter(\.dashed).count == 2)
}

@MainActor
@Test func aRowExplainedOnTheSecondPassTakesItsGapBackOffTheMap() {
    let (pass, store) = session(["lat": .mastered])
    let beats = [beat(0), beat(1)]
    // First pass: both owed.
    pass.settleFeynman(["b0": .confused, "b1": .skipped], beats: beats, quotes: ["b0": "primeira tentativa"])
    #expect(store.states["cadeia-g0"] == .gap)
    #expect(store.states["cadeia-g1"] == .gap)

    // Second pass: row 0 explained. Nothing used to remove a gap, so the red
    // node hung under the concept for ever — and the learner had done the work.
    pass.settleFeynman(["b0": .good, "b1": .confused], beats: beats, quotes: ["b1": "segunda tentativa"])
    #expect(store.states["cadeia-g0"] == nil)
    #expect(store.graph.nodes.contains { $0.id == "cadeia-g0" } == false)
    #expect(store.graph.edges.contains { $0.to == "cadeia-g0" } == false)
    #expect(store.states["cadeia-g1"] == .gap)
    // Still owed, re-judged: the map must carry this pass's words, not the
    // first attempt's.
    #expect(store.graph.nodes.first { $0.id == "cadeia-g1" }?.summary?.contains("segunda tentativa") == true)
}

@MainActor
@Test func settlingClosesThePassSoItDoesNotReopenOnTheNextEntry() {
    let (pass, store) = session(["lat": .mastered])
    store.note(teachBack: FeynmanSnapshot(nodeId: "cadeia", explanation: "eu expliquei assim"))
    #expect(store.savedTeachBack("cadeia")?.explanation == "eu expliquei assim")
    pass.settleFeynman(["b0": .good], beats: [beat(0)], quotes: [:])
    // The gaps are on the map now; there is nothing left to come back to.
    #expect(store.savedTeachBack("cadeia") == nil)
}

@MainActor
@Test func aParkedTeachBackSurvivesTheRoundTripThroughTheRow() {
    let store = store(["lat": .mastered])
    let parked = FeynmanSnapshot(
        nodeId: "cadeia", scaffolded: true, explanation: "a derivada da composta…",
        response: "espera, por quê?", verdicts: ["b0": .good, "b1": .confused],
        quotes: ["b1": "taxa de fora"], jargon: ["taxa"], previous: ["b0": .skipped],
        reported: true, fixing: "b1", fixRuledOut: ["errada"], fixReaction: "não"
    )
    store.note(teachBack: parked)
    let back = store.savedTeachBack("cadeia")
    #expect(back?.explanation == "a derivada da composta…")
    #expect(back?.reported == true)
    #expect(back?.scaffolded == true)
    #expect(back?.verdicts["b1"] == .confused)
    #expect(back?.previous?["b0"] == .skipped)
    // The three keys this client never draws still have to make the round trip,
    // or a mid-fix pass reopens broken in the browser.
    #expect(back?.fixing == "b1")
    #expect(back?.fixRuledOut == ["errada"])
    #expect(back?.fixReaction == "não")
}

@MainActor
@Test func theSecondPassDeltaCountsAgainstTheFirst() {
    let beats = [beat(0), beat(1), beat(2)]
    let first: [String: TeachVerdict] = ["b0": .confused, "b1": .skipped, "b2": .good]
    let second: [String: TeachVerdict] = ["b0": .good, "b1": .good, "b2": .good]
    #expect(feynmanGapCount(first, beats) == 2)
    #expect(feynmanGapCount(second, beats) == 0)
    #expect(feynmanClean(second, beats))
}

@MainActor
@Test func aBeatCarriesItsFixAndOneWrittenBeforeItStillDecodes() {
    // Every generation is billed for the fix block; a client that cannot read
    // it is buying the phase's only remediation loop and throwing it away.
    let fix = beat(0).fix
    #expect(fix?.probe == "E se…?")
    #expect(fix?.replies.filter(\.correct).count == 1)
    #expect(fix?.replies.filter { !$0.correct }.count == 1)
    // And a row from before the field existed must not blank the whole rubric.
    #expect(beatWithoutFix().fix == nil)
}

@MainActor
@Test func theRubricFloorIsTheServersOwn() {
    // A stream that died after one beat used to be filed as a complete rubric:
    // "1 / 1", one sub-point taught, and the rows the model never wrote could
    // never become gaps.
    #expect(FeynmanBeatBounds.min == 2)
    #expect(FeynmanBeatBounds.max == 4)
}

@MainActor
@Test func leavingAfterAdvancingDoesNotResurrectTheSettledPass() {
    let (pass, store) = session(["lat": .mastered])
    let model = FeynmanViewModel(session: pass, api: store.api)
    model.explanation = "eu expliquei assim"
    #expect(store.savedTeachBack("cadeia") != nil)

    model.advance()
    // `onDisappear` fires *after* the advance, and one last save there put the
    // whole Gap Report back — the next entry reopened a pass whose gaps were
    // already on the map.
    model.leave()
    #expect(store.savedTeachBack("cadeia") == nil)
}
