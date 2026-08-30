import Foundation
import Testing
@testable import AtlasKit

/// What the drawer's one button says and where it goes. Both are silent when
/// wrong — a mastered node used to read "Começar · Retained" and open the
/// Crucible, and a gap node used to read "Bloqueado" with no way out of it.

@MainActor private func drawer(_ state: NodeState, reviewed: Bool = false) -> NodeDetailViewModel {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(
            nodes: [
                ConceptNode(id: "lat", label: "Limites laterais", state: .mastered),
                ConceptNode(id: "cadeia", label: "Regra da cadeia"),
                ConceptNode(id: "lacuna", label: "Fatoração", summary: "Não fechou.", state: .gap, gap: true),
            ],
            edges: [ConceptEdge("lat", "cadeia"), ConceptEdge("cadeia", "lacuna", dashed: true)]
        ),
        // An unmet prerequisite is the only thing that leaves a node locked —
        // with "lat" mastered the display derives Fronteira instead.
        states: ["lat": state == .unknown ? .unknown : .mastered, "cadeia": state, "lacuna": .gap],
        subject: "Cálculo I"
    )
    if reviewed { store.reviewed.insert("cadeia") }
    let id = state == .gap ? "lacuna" : "cadeia"
    return NodeDetailViewModel(node: store.graph.nodes.first { $0.id == id }!, store: store)
}

@MainActor
@Test func aFinishedNodeIsSentToTheReviewNotTheCrucible() {
    for reviewed in [false, true] {
        let model = drawer(.mastered, reviewed: reviewed)
        // The action is what the CTA opens: Retido routes to the Review tab,
        // and nothing may clamp it back onto the Crucible.
        #expect(model.action == .retained)
        #expect(!model.isLocked)
    }
}

@MainActor
@Test func aGapHasItsOwnWayIn() {
    let model = drawer(.gap)
    #expect(model.isGap)
    // No phase index, but not locked: one Socratic repair pass closes it.
    #expect(model.current < 0)
    #expect(!model.isLocked)
    #expect(model.action == .socratic)
    // And it names the node it was split out of.
    #expect(model.spawnedFrom.map(\.0) == ["Regra da cadeia"])
}

@MainActor
@Test func onlyAnUnknownNodeIsLocked() {
    #expect(drawer(.unknown).isLocked)
    for state: NodeState in [.frontier, .learning, .shaky, .mastered, .gap] {
        #expect(!drawer(state).isLocked)
    }
}

@MainActor
@Test func theSpiralMarksWhatIsDoneAndWhatIsAhead() {
    let rows = drawer(.shaky).rows
    // Shaky sits on the Crucible: four behind it, one ahead.
    #expect(rows.filter(\.done).map(\.phase) == [.consume, .socratic, .feynman, .connect])
    #expect(rows.first(where: \.isCurrent)?.phase == .crucible)
    #expect(rows.filter(\.isAhead).map(\.phase) == [.retained])
}

@MainActor
@Test func theNudgeIsDroppedWhenTheStateMovesUnderIt() {
    let model = drawer(.frontier)
    model.pendingSkip = .crucible
    #expect(model.pendingSkip == .crucible)
    model.skip()
    // The node is Mastered now — a question about skipping the Crisol is a
    // question about nothing.
    #expect(model.pendingSkip == nil)
}
