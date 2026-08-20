import Foundation
import Testing
@testable import AtlasKit

/// The spiral's two rules that a screen must never own: what a phase writes to
/// the map, and what order the phases run in. Everything else on screens 14-18
/// is layout — this is the part that lies to the learner if it drifts.

@MainActor private func store(_ states: StateMap = [:]) -> AtlasStore {
    AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(baseURL: URL(string: "https://supabase.test")!, apiKey: "anon"),
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
@Test func openingAPassMarksTheNodeLearningAndNothingElse() {
    let owned = store(["cadeia": .mastered])
    _ = SessionViewModel(node: owned.graph.nodes[1], store: owned)
    // A node already past Learning is left where it is — arriving is evidence
    // of work, not a reason to walk mastery backwards.
    #expect(owned.states["cadeia"] == .mastered)

    let fresh = store(["lat": .mastered])
    _ = SessionViewModel(node: fresh.graph.nodes[1], store: fresh)
    #expect(fresh.states["cadeia"] == .learning)
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
