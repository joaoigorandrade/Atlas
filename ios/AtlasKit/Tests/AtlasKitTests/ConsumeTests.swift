import Foundation
import Testing
@testable import AtlasKit

/// Leaving a reading pass, and coming back to it.
///
/// Until the run held a `ConsumeProgress`, arriving on the reading marked the
/// node Learning — which the spiral reads as *Feynman owed* — so backing out of
/// the first section ticked Consume **and** Socratic off a node nobody had
/// read, and reopening it landed three phases past the prose. What is pinned
/// here is the pair that fixes it: the pass is written to the run on every
/// change, and the record gets the last word on which phase is current.

@MainActor private func store() -> AtlasStore {
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
        // The prerequisite is owned, so "cadeia" derives as the frontier.
        states: ["lat": .mastered],
        subject: "Cálculo I"
    )
}

/// Three sections, each closed by a check whose first option is the right one.
private func chunks() -> [ConsumeChunk] {
    (1...3).map { section in
        ConsumeChunk(
            id: "c\(section)",
            kicker: "\(section) · Seção",
            body: ["Corpo \(section)"],
            example: nil,
            takeaway: "Resumo \(section)",
            cite: nil,
            diagram: nil,
            figure: nil,
            check: ConsumePrediction(
                q: "Pergunta \(section)",
                opts: [.init(label: "certa", correct: true), .init(label: "errada", correct: false)],
                right: "isso",
                wrong: "não"
            )
        )
    }
}

/// A reading screen over a pass that is already warm. `load()` runs the real
/// path and costs nothing: a key the cache already holds is answered from
/// memory rather than generated.
@MainActor private func reading(_ store: AtlasStore) async -> ConsumeViewModel {
    let node = store.graph.nodes[1]
    await store.warm.fill(store.key("consume", node), once: { chunks() })
    let model = ConsumeViewModel(session: SessionViewModel(node: node, store: store), api: store.api)
    await model.load()
    return model
}

/// The screen the learner would get by opening the node again from the map.
@MainActor private func reopened(_ store: AtlasStore) -> (SessionViewModel, ConsumeViewModel) {
    let session = SessionViewModel(node: store.graph.nodes[1], store: store)
    return (session, ConsumeViewModel(session: session, api: store.api))
}

@MainActor
@Test func openingTheReadingAndLeavingItLeavesTheNodeOnTheFrontier() async {
    let store = store()
    _ = await reading(store)

    // Nothing was read past the first section: arriving is not work, and the
    // drawer must not tick Consume — let alone Socratic — off for it.
    #expect(store.states["cadeia"] == nil)
    #expect(store.display["cadeia"] == .frontier)
    #expect(store.consumeProgress["cadeia"]?.idx == 0)
    #expect(readingPhaseIndex(.frontier, progress: store.consumeProgress["cadeia"]) == 0)
}

@MainActor
@Test func aPassLeftPartWayThroughComesBackWhereItStopped() async {
    let store = store()
    let model = await reading(store)
    // One section answered and turned, then out to the map.
    model.pick(0)
    model.advance()

    #expect(store.consumeProgress["cadeia"]?.idx == 1)
    #expect(store.consumeProgress["cadeia"]?.total == 3)
    #expect(store.consumeProgress["cadeia"]?.finished == false)
    #expect(store.consumeProgress["cadeia"]?.checks["c1"] == ConsumeProgress.Check(oi: 0, correct: true))
    // Reading past the first section is real progress and the map says so.
    #expect(store.states["cadeia"] == .learning)
    // But only about the reading: the state alone would say Feynman.
    #expect(phaseIndex(.learning) == 2)
    #expect(readingPhaseIndex(.learning, progress: store.consumeProgress["cadeia"]) == 0)

    let (session, resumed) = reopened(store)
    #expect(session.phase == .consume)
    #expect(resumed.index == 1)
    #expect(resumed.chunk?.id == "c2")
}

@MainActor
@Test func aCheckAlreadyPassedStaysPassed() async {
    let store = store()
    let model = await reading(store)
    model.pick(0)
    #expect(model.passed)

    // Coming back must not re-gate a section the learner demonstrably read.
    let (_, resumed) = reopened(store)
    #expect(resumed.index == 0)
    #expect(resumed.picked == 0)
    #expect(resumed.passed)
}

@MainActor
@Test func onlyTheHandOffMovesTheSpiralPastTheReading() async {
    let store = store()
    let model = await reading(store)
    for _ in 0..<2 {
        model.pick(0)
        model.advance()
    }
    model.pick(0)
    #expect(store.consumeProgress["cadeia"]?.finished == false)
    // The last section reached is not the reading handed on: walking back to
    // the map here leaves a pass that is read but still owed a Socratic.
    #expect(readingPhaseIndex(.learning, progress: store.consumeProgress["cadeia"]) == 0)

    model.finish()
    #expect(store.consumeProgress["cadeia"]?.finished == true)
    #expect(store.consumeProgress["cadeia"]?.handedOff == true)
    #expect(store.states["cadeia"] == .learning)
    #expect(readingPhaseIndex(.learning, progress: store.consumeProgress["cadeia"]) == 2)
}

@Test func theReadingRecordOnlyOverridesAnUnfinishedLearningNode() {
    var progress = ConsumeProgress()
    progress.idx = 4
    progress.total = 5

    // Still reading → Consume. Read, never went on → Socratic. Went on → the
    // state has the word again.
    #expect(readingPhaseIndex(.learning, progress: progress) == 0)
    progress.finished = true
    #expect(readingPhaseIndex(.learning, progress: progress) == 1)
    progress.handedOff = true
    #expect(readingPhaseIndex(.learning, progress: progress) == 2)

    // Every other state is left exactly where `phaseIndex` puts it.
    for state in [NodeState.unknown, .frontier, .shaky, .mastered, .gap] {
        #expect(readingPhaseIndex(state, progress: progress) == phaseIndex(state))
    }
    // And a node with no reading record behind it is answered by the state.
    #expect(readingPhaseIndex(.learning, progress: nil) == 2)
}

@Test func theReadingCountNeverClaimsPastWhatExists() {
    var progress = ConsumeProgress()
    progress.total = 5
    #expect(progress.reading.read == 1)
    #expect(progress.reading.total == 5)

    // A pass still streaming when the learner left has a smaller total than it
    // will end up with — the count follows what was actually reached.
    progress.idx = 2
    progress.total = 0
    #expect(progress.reading.read == 3)
    #expect(progress.reading.total == 3)

    progress.idx = 4
    progress.total = 5
    progress.finished = true
    #expect(progress.reading.read == 5)
    // A finished pass is fully read, and no longer worth a "3 de 5" on the map.
    #expect(progress.unfinished == false)
}

@Test func aRecordFromTheBrowserKeepsTheHalvesOnlyTheBrowserDraws() throws {
    let written: JSONValue = .object([
        "idx": .number(2),
        "collapsed": .object(["c1": .bool(true)]),
        "variant": .object(["c1": .string("analogy")]),
    ])
    var progress = try written.decode(ConsumeProgress.self)
    #expect(progress.idx == 2)
    progress.idx = 3

    let saved = try #require(try JSONValue(encoding: progress).fields)
    #expect(saved["idx"] == .number(3))
    #expect(saved["collapsed"] == .object(["c1": .bool(true)]))
    #expect(saved["variant"] == .object(["c1": .string("analogy")]))
    // The three the web indexes without a guard of its own are always written.
    #expect(saved["termsSeen"] == .array([]))
    #expect(saved["checks"] == .object([:]))
    #expect(saved["handedOff"] == .bool(false))
}
