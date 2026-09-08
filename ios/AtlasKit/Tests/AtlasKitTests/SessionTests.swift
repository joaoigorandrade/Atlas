import Foundation
import Testing
@testable import AtlasKit

/// The spiral's two rules that a screen must never own: what a phase writes to
/// the map, and what order the phases run in. Everything else on screens 14-18
/// is layout — this is the part that lies to the learner if it drifts.

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

/// A pass on "Regra da cadeia", plus the store it writes to — the writes are
/// the whole point of these tests, so both come back.
@MainActor private func session(_ states: StateMap = [:]) -> (SessionViewModel, AtlasStore) {
    let store = store(states)
    return (SessionViewModel(node: store.graph.nodes[1], store: store), store)
}

@MainActor
@Test func openingAPassMarksNothingUntilTheLearnerDoesSomething() {
    let owned = store(["cadeia": .mastered])
    _ = SessionViewModel(node: owned.graph.nodes[1], store: owned)
    // A node already past Learning is left where it is — nothing on this screen
    // is a reason to walk mastery backwards.
    #expect(owned.states["cadeia"] == .mastered)

    // Opening the screen and backing out is not learning the concept. It used
    // to write Learning here, and `isLearned` counts Learning as a satisfied
    // prerequisite — so a tap and a back swipe unlocked everything downstream.
    let fresh = store(["lat": .mastered])
    let pass = SessionViewModel(node: fresh.graph.nodes[1], store: fresh)
    #expect(fresh.states["cadeia"] == nil)

    // The first thing the learner actually does is what marks it.
    pass.markWorked()
    #expect(fresh.states["cadeia"] == .learning)
}

/// The reason the rule above matters: Learning satisfies a prerequisite, so
/// writing it on arrival lit the next concept up for free.
@MainActor
@Test func aTapAndABackSwipeDoesNotUnlockTheNextConcept() {
    let fresh = store(["lat": .mastered])
    let locked = fresh.graph.nodes.first { fresh.display[$0.id] == .unknown }
    _ = SessionViewModel(node: fresh.graph.nodes[1], store: fresh)
    if let locked { #expect(fresh.display[locked.id] == .unknown) }
}

@MainActor
@Test func theSpiralRunsInOrderAndEndsAfterTheCrucible() {
    let (pass, _) = session()
    #expect(pass.phase == .consume)
    for expected in [Phase.socratic, .feynman, .connect, .crucible] {
        pass.advance()
        #expect(pass.phase == expected)
    }
    // Retained is not a session phase: past the Crucible the map takes over.
    pass.advance()
    #expect(pass.finished)
    #expect(pass.phase == .crucible)
}

@MainActor
@Test func connectLeavesTheNodeShakyRatherThanGreen() {
    let (pass, store) = session(["lat": .mastered])
    pass.finishConnect()
    // Understood and wired, but nothing has proven it transfers yet.
    #expect(store.states["cadeia"] == .shaky)
}

@MainActor
@Test func onlyAConfirmedTransferTurnsTheNodeGreen() {
    let gap = GapSpec(id: "cadeia-gap", label: "Taxa de dentro", reason: "não atravessou", dx: 40, dy: 60)

    let (failed, failedStore) = session(["lat": .mastered])
    failed.settleCrucible(
        CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "A taxa interna",
                          gapReason: "ficou de fora", reExplain: nil),
        gap: gap
    )
    #expect(failedStore.states["cadeia"] == .shaky)
    #expect(failedStore.states[gap.id] == .gap)
    // The judge's own words name the gap — the content's draft is the fallback.
    #expect(failedStore.graph.nodes.first { $0.id == gap.id }?.label == "A taxa interna")
    // A gap hangs on a dashed edge: it must never lock anything below it.
    #expect(failedStore.graph.edges.contains { $0.to == gap.id && $0.dashed })

    let (passed, passedStore) = session(["lat": .mastered])
    passed.settleCrucible(
        CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: nil, gapReason: nil, reExplain: nil),
        gap: gap
    )
    passed.settleCrucible(
        CrucibleJudgement(outcome: "pass", transfer: [], gapLabel: nil, gapReason: nil, reExplain: nil),
        gap: gap
    )
    // Transfer confirmed: green, and the first attempt's gap leaves the map.
    #expect(passedStore.states["cadeia"] == .mastered)
    #expect(passedStore.states[gap.id] == nil)
    #expect(passedStore.graph.nodes.contains { $0.id == gap.id } == false)
    #expect(passedStore.graph.edges.contains { $0.to == gap.id } == false)
}

@Test func aFigureWithACycleStillLaysOutFlatInsteadOfHanging() {
    let figure = ConsumeFigure(
        nodes: [.init(id: "a", label: "A"), .init(id: "b", label: "B"), .init(id: "c", label: "C")],
        edges: [.init(from: "a", to: "b"), .init(from: "b", to: "c"), .init(from: "c", to: "a")]
    )
    // The point is that it comes back at all — the relaxation is capped at the
    // node count, so a loop costs three passes rather than forever, and every
    // node still gets a row to draw in.
    let layers = figureLayers(figure)
    #expect(layers.count == 3)
    // A loop's layers keep climbing while the passes last; what matters for the
    // drawing is that they can't produce more rows than there are nodes.
    #expect(Set(layers.values).count <= figure.nodes.count)

    let chain = ConsumeFigure(
        nodes: [.init(id: "a", label: "A"), .init(id: "b", label: "B")],
        edges: [.init(from: "a", to: "b")]
    )
    #expect(figureLayers(chain) == ["a": 0, "b": 1])
}

@MainActor
@Test func aRedoOpensTheRequestedPhaseAndRunsForwardFromThere() {
    let owned = store(["cadeia": .mastered])
    let redo = SessionViewModel(node: owned.graph.nodes[1], store: owned, phase: .feynman)
    #expect(redo.phase == .feynman)
    redo.advance()
    #expect(redo.phase == .connect)
    // Redoing an earlier phase doesn't walk the node's mastery backwards.
    #expect(owned.states["cadeia"] == .mastered)
}

@MainActor
private func beat(_ index: Int) -> FeynmanBeat {
    let raw = """
    {"id":"b\(index)","subPoint":"Ponto \(index)","mustConvey":["x"],
     "gap":{"id":"cadeia-g\(index)","label":"Lacuna \(index)","reason":"não explicou","dx":40,"dy":60}}
    """
    return try! JSONDecoder().decode(FeynmanBeat.self, from: Data(raw.utf8))
}

@MainActor
private func report(_ rows: [(Int, String, String?)]) -> FeynmanJudgement {
    let verdicts = rows.map { row in
        let quote = row.2.map { "\"quote\":\"\($0)\"," } ?? ""
        return "{\"i\":\(row.0),\(quote)\"verdict\":\"\(row.1)\"}"
    }
    let raw = "{\"verdicts\":[\(verdicts.joined(separator: ","))],\"response\":\"ok\"}"
    return try! JSONDecoder().decode(FeynmanJudgement.self, from: Data(raw.utf8))
}

@MainActor
@Test func aRubricRowTheJudgeNeverRuledOnIsASkipRatherThanAPass() {
    let (pass, store) = session(["lat": .mastered])
    let beats = [beat(0), beat(1), beat(2)]
    // Row 1 is missing from the payload entirely. Silence about a sub-point the
    // learner never mentioned is the finding this phase exists for — grading it
    // good is the one thing the write must never do.
    pass.writeFeynmanGaps(report([(0, "good", "eu disse isso"), (2, "confused", "taxa de fora")]), beats: beats)

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
@Test func aRepeatCrucibleFailureRenamesTheGapInsteadOfKeepingTheFirstWording() {
    let gap = GapSpec(id: "cadeia-gap", label: "Rascunho", reason: "rascunho", dx: 40, dy: 60)
    let (pass, store) = session(["lat": .mastered])
    pass.settleCrucible(CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "Primeira",
                                          gapReason: "primeira", reExplain: nil), gap: gap)
    pass.settleCrucible(CrucibleJudgement(outcome: "partial", transfer: [], gapLabel: "Segunda",
                                          gapReason: "segunda", reExplain: nil), gap: gap)
    // `spawnGap` is idempotent by id, which is right — but the second judgement
    // named the missing sub-concept again, and the map kept the first wording.
    #expect(store.graph.nodes.filter { $0.id == gap.id }.count == 1)
    #expect(store.graph.nodes.first { $0.id == gap.id }?.label == "Segunda")
    #expect(store.graph.nodes.first { $0.id == gap.id }?.summary == "segunda")
}

@MainActor
@Test func theConnectPoolIsWhatTheLearnerOwns_neverAGapAndNeverUnbounded() {
    let store = store(["lat": .mastered])
    // A gap the learner opened a pass on is `.learning`, and offering it back
    // as "a concept you already know" is the bug elaboration exists to avoid.
    store.graph.nodes.append(ConceptNode(id: "g", label: "Lacuna", gap: true))
    store.states["g"] = .learning
    for index in 0..<12 {
        store.graph.nodes.append(ConceptNode(id: "n\(index)", label: "N\(index)"))
        store.states["n\(index)"] = .learning
    }
    let pool = store.learned(besides: store.graph.nodes[1])
    #expect(pool.contains { $0.id == "g" } == false)
    #expect(pool.contains { $0.id == "cadeia" } == false)
    // Capped at 8 — the pool is in the prompt *and* in the cache key.
    #expect(pool.count == 8)
    // Most-owned first.
    #expect(pool.first?.id == "lat")
}
