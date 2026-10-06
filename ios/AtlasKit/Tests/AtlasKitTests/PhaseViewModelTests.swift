import Foundation
import Testing
@testable import AtlasKit

/// The eight phase screens that had no test of their own. Each drives its view
/// model over content seeded the way the server's rows arrive, and pins the
/// behaviour a review found broken or unguarded — the gates themselves live in
/// `PhaseGateTests`.

private let learned = ConceptNode(id: "m", label: "Derivada", phasePlan: [.consume, .retain])

/// One node on the phase under test, its content already in the warm cache.
/// The plan is just that phase: nothing is owed after it, so no warm goes out
/// to a server this suite doesn't have.
@MainActor
private func pass(_ phase: Phase, _ payload: String, withLearned: Bool = false) throws -> (AtlasStore, SessionViewModel) {
    let node = ConceptNode(id: "n", label: "Limite", phasePlan: [phase, .retain])
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: withLearned ? [node, learned] : [node], edges: []),
        states: withLearned ? ["n": .learning, "m": .mastered] : ["n": .learning],
        subject: "Cálculo I"
    )
    if withLearned { store.phasesDone["m"] = [.consume] }
    let raw = try JSONDecoder().decode(JSONValue.self, from: Data(payload.utf8))
    store.seedWarm([RunStore.ContentItem(nodeId: "n", kind: phase.rawValue, variant: "", payload: raw)])
    // The phase the node is owed, not asked for by name: a named Crucible is a
    // redo, and a redo addresses a fresh problem rather than the seeded one.
    return (store, SessionViewModel(node: node, store: store))
}

// MARK: - Provenance

@MainActor
@Test func aProvenanceRunThatClearsItsGateClosesTheRung() async throws {
    let (store, session) = try pass(.provenance, #"""
    {"nodeId":"n","nodeLabel":"Limite","source":{"title":"t","attribution":"a","date":"d","excerpt":"e"},
     "claims":[{"id":"c1","claim":"x","ruling":"asserts","because":"b"},
               {"id":"c2","claim":"y","ruling":"proves","because":"b"},
               {"id":"c3","claim":"z","ruling":"neither","because":"b"}],"silence":"s"}
    """#)
    let model = ProvenanceViewModel(session: session)
    await model.load()
    for ruling in [ProvenanceRuling.asserts, .proves, .neither] {
        model.rule(ruling)
        #expect(model.mark(ruling) == .right)
        model.next()
    }
    #expect(model.reported && model.passed)
    model.advance()
    #expect(store.phasesDone["n"]?.contains(.provenance) == true)
}

// MARK: - Drill

@MainActor
@Test func aDrillRunCountsOnlyRepsThatCanBeWon() async throws {
    let (_, session) = try pass(.drill, #"""
    {"nodeId":"n","nodeLabel":"Limite","reps":[
     {"id":"1","prompt":"p","answers":["a","b"],"answerIndex":0,"rule":"r"},
     {"id":"2","prompt":"p","answers":["a","b"],"answerIndex":7,"rule":"r"},
     {"id":"3","prompt":"p","answers":["a","b"],"answerIndex":1,"rule":"r"}]}
    """#)
    let model = DrillViewModel(session: session)
    await model.load()
    #expect(model.total == 2)
    model.answer(0)
    model.next()
    model.answer(1)
    model.next()
    model.leave()
    #expect(model.reported)
    #expect(model.score == 2)
}

// MARK: - Steelman

private let dispute = #"""
{"nodeId":"n","nodeLabel":"Limite","question":"q","positions":[
 {"id":"a","label":"A","heldBy":"x","mustCover":[]},
 {"id":"b","label":"B","heldBy":"y","mustCover":[]}]}
"""#

/// Swiping the sheet away is how it closes, and it used to drop the case.
@MainActor
@Test func aSteelmanCaseSurvivesTheSheetBeingSwipedAway() async throws {
    let (_, session) = try pass(.steelman, dispute)
    let model = SteelmanViewModel(session: session, api: session.store.api)
    await model.load()
    model.open("a")
    model.draft = "O melhor argumento a favor de A é que ele explica os dados."
    // What the sheet binding's setter now does on a swipe.
    model.commit()
    #expect(model.session.cases["a"] == "O melhor argumento a favor de A é que ele explica os dados.")
    #expect(model.editing == nil)
    // Reopening starts from what was kept.
    model.open("a")
    #expect(model.draft.hasPrefix("O melhor argumento"))
    #expect(!model.ready)
}

@MainActor
@Test func steelmanWaitsForARealDisconfirmer() async throws {
    let (_, session) = try pass(.steelman, dispute)
    let model = SteelmanViewModel(session: session, api: session.store.api)
    await model.load()
    for side in ["a", "b"] {
        model.open(side)
        model.draft = String(repeating: "argumento ", count: 5)
        model.commit()
    }
    model.hold("a")
    model.disconfirmer = "nada"
    #expect(!model.canSubmit)
    model.disconfirmer = "um documento que mostre o contrário"
    #expect(model.canSubmit)
}

// MARK: - Produce

@MainActor
@Test func produceNeedsWordsAndAVerdictBeforeItMovesOn() async throws {
    let (_, session) = try pass(.produce, #"""
    {"nodeId":"n","nodeLabel":"Limite","scene":"s","turns":[
     {"id":"t1","cue":"c","targetForms":["f"],"seconds":20},
     {"id":"t2","cue":"c","targetForms":["f"],"seconds":20}]}
    """#)
    let model = ProduceViewModel(session: session, api: session.store.api)
    await model.load()
    #expect(!model.canSend)
    model.said = "eu fui"
    #expect(model.canSend)
    // No verdict yet: a turn can't be skipped past.
    model.next()
    #expect(model.current?.id == "t1")
}

// MARK: - Recall and Perform

@MainActor
@Test func recallSpendsItsCueOnRequestAndSaysSo() async throws {
    let (_, session) = try pass(.recall, #"""
    {"nodeId":"n","nodeLabel":"Limite","brief":"b","scaffold":"s",
     "rubric":[{"id":"r1","point":"p","mustRetrieve":["x"]}]}
    """#)
    let model = RecallViewModel(session: session, api: session.store.api)
    await model.load()
    #expect(!model.canSubmit)
    model.written = "o limite é…"
    #expect(model.canSubmit)
    #expect(!model.cued)
    model.cue()
    #expect(model.cued)
}

@MainActor
@Test func performRerunsTheSameCaseFromABlankPage() async throws {
    let (_, session) = try pass(.perform, #"""
    {"nodeId":"n","nodeLabel":"Limite","task":"t","scaffold":"s",
     "steps":[{"id":"s1","step":"p","mustShow":["x"],"loadBearing":true}]}
    """#)
    let model = PerformViewModel(session: session, api: session.store.api)
    await model.load()
    model.work = "primeiro passo…"
    model.nudge()
    #expect(model.nudged)
    model.rerun()
    #expect(model.work.isEmpty)
    #expect(model.steps.count == 1)
}

// MARK: - Connect

private let web = #"""
{"centerId":"n","centerLabel":"Limite","detectNote":"d","center":{"x":280,"y":220},
 "cands":[{"id":"m","label":"Derivada","x":100,"y":100,"rel":"a derivada é um limite"},
          {"id":"k","label":"Continuidade","x":400,"y":100,"rel":"contínua se o limite existe"}]}
"""#

@MainActor
@Test func connectAsksForTwoLinksIntoTheWebOnScreen() async throws {
    let (_, session) = try pass(.connect, web, withLearned: true)
    let model = ConnectViewModel(session: session, api: session.store.api)
    await model.load()
    let candidates = try #require(model.content?.cands)
    #expect(model.required == 2)
    // The map's own sentence pasted back is not the learner's link (W1.5),
    // and neither is anything under six words.
    model.draft(candidates[0]).wrappedValue = candidates[0].rel
    #expect(!model.canConfirm(candidates[0]))
    model.draft(candidates[0]).wrappedValue = "a derivada é o limite da razão incremental"
    await model.confirm(candidates[0])
    #expect(!model.ready)
    model.draft(candidates[1]).wrappedValue = "sem o limite existir não há como falar em continuidade"
    await model.confirm(candidates[1])
    #expect(model.ready)
}

/// Nothing learned elsewhere is nothing to wire into: the rung still closes,
/// and the parked pass is cleared rather than left in the row.
@MainActor
@Test func connectWithNothingToWireClosesTheRung() async throws {
    let (store, session) = try pass(.connect, web)
    let model = ConnectViewModel(session: session, api: session.store.api)
    await model.load()
    #expect(model.nothingToWire)
    model.skip()
    #expect(store.phasesDone["n"]?.contains(.connect) == true)
    #expect(store.connectProgress["n"] == nil)
}

// MARK: - Crucible

@MainActor
@Test func aCrucibleOpensOnItsFirstRungWithTheLadderInHand() async throws {
    let (_, session) = try pass(.crucible, #"""
    {"centerId":"n","centerLabel":"Limite",
     "gap":{"id":"g","label":"G","reason":"r","dx":0,"dy":0},
     "problems":[{"tag":"t","q":"q1","hint":"h","placeholder":"p"},
                 {"tag":"t","q":"q2","hint":"h","placeholder":"p"}],
     "reExplain":"x"}
    """#)
    let model = CrucibleViewModel(session: session, api: session.store.api)
    await model.load()
    #expect(model.rungs == 2)
    #expect(model.problem?.q == "q1")
    #expect(!model.isSettled)
    #expect(!model.canSubmit)
    model.work = "minha tentativa"
    #expect(model.canSubmit)
}

// MARK: - Explain

@MainActor
@Test func anExplainPassFoundOnTheSecondTryClosesTheRung() async throws {
    let (store, session) = try pass(.explain, #"""
    {"nodeId":"n","nodeLabel":"Limite","problem":"p","analogy":{"text":"a","breaks":"b"},
     "order":["1","2","3"],"misconception":{"belief":"m","tempting":"t"},
     "checkBack":{"question":"q","rightAnswer":"r"},
     "listener":{"says":"s","replies":[
       {"label":"x","correct":false,"why":"w"},{"label":"y","correct":true,"why":"w"}]}}
    """#)
    let model = ExplainViewModel(session: session)
    await model.load()
    #expect(model.cards.count == 1 && !model.checking)
    for _ in 1..<ExplainCard.allCases.count { model.reveal() }
    #expect(model.checking)
    model.pick(0)
    #expect(model.picked?.correct == false)
    #expect(model.open.map(\.index) == [1])
    model.pick(1)
    #expect(model.session.done)
    model.advance()
    #expect(store.phasesDone["n"]?.contains(.explain) == true)
}
