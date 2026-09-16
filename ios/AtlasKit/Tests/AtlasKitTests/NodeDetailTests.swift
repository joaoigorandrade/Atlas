import Foundation
import Testing
@testable import AtlasKit

/// What the drawer's one button says and where it goes. Both are silent when
/// wrong — a mastered node used to read "Começar · Retained" and open the
/// Crucible, and a gap node used to read "Bloqueado" with no way out of it.

/// `done` is the node's phase ledger — the record mastery is *derived* from. A
/// state with no ledger behind it is not a state any real node reaches, so the
/// drawer is built from both.
@MainActor private func drawer(
    _ state: NodeState, reviewed: Bool = false, done: [Phase] = []
) -> NodeDetailViewModel {
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
    if !done.isEmpty { store.phasesDone["cadeia"] = done }
    let id = state == .gap ? "lacuna" : "cadeia"
    return NodeDetailViewModel(node: store.graph.nodes.first { $0.id == id }!, store: store)
}

@MainActor
@Test func aFinishedNodeIsSentToTheReviewNotTheCrucible() {
    let full = planGates(phasePlans[.concept]!)
    for reviewed in [false, true] {
        let model = drawer(.mastered, reviewed: reviewed, done: full)
        // The action is what the CTA opens: Retido routes to the Review tab,
        // and nothing may clamp it back onto the Crucible.
        #expect(model.action == .retain)
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
    // A node made Shaky by Connect: everything up to and including Connect is in
    // its ledger, and the Crucible is what it is owed. The rail draws the node's
    // own plan — `concept`'s here, which is not the six every node used to run.
    let upToConnect: [Phase] = [.consume, .discriminate, .socratic, .feynman, .connect]
    let rows = drawer(.shaky, done: upToConnect).rows
    #expect(rows.map(\.phase) == phasePlans[.concept]!)
    #expect(rows.filter(\.done).map(\.phase) == upToConnect)
    #expect(rows.first(where: \.isCurrent)?.phase == .crucible)
    #expect(rows.filter(\.isAhead).map(\.phase) == [.recall, .retain])
}

/// Two kinds, two rails. The drawer drew the same six rungs for every node on
/// every map, which is the thing the catalogue exists to undo.
@MainActor
@Test func theRailIsTheNodesOwnPlan() {
    let store = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [
            ConceptNode(id: "p", label: "Titulação", state: .unknown, kind: .procedure),
            ConceptNode(id: "f", label: "Massa molar", state: .unknown, kind: .fact),
        ]),
        states: ["p": .learning, "f": .learning],
        subject: "Química"
    )
    func rail(_ id: String) -> [Phase] {
        NodeDetailViewModel(node: store.graph.nodes.first { $0.id == id }!, store: store)
            .rows.map(\.phase)
    }
    #expect(rail("p") == phasePlans[.procedure]!)
    #expect(rail("f") == phasePlans[.fact]!)
    // A procedure is executed, not argued with; a fact has nothing to reason
    // from. Neither runs the other's rungs.
    #expect(!rail("p").contains(.socratic))
    #expect(!rail("f").contains(.crucible))
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

/// The rail reads the ledger, not the position. Ticking "everything before the
/// current rung" was the same claim while the ladder was walked strictly in
/// order — it is not now, because the drawer lets a learner open any rung. A
/// phase closed out of order showed as still owed, which is the one thing the
/// record exists to settle.
@MainActor
@Test func theRailTicksWhatWasFinishedEvenOutOfOrder() {
    // Discriminate closed by skipping ahead; Consume never opened.
    let model = drawer(.learning, done: [.discriminate])
    let rows = model.rows
    #expect(rows.filter(\.done).map(\.phase) == [.discriminate])
    // Consume is still what the node is owed, and the CTA still says so.
    #expect(rows.first(where: \.isCurrent)?.phase == .consume)
    #expect(model.action == .consume)
    // A closed rung sitting after the current one is a redo, not a skip — the
    // nudge must not ask whether to skip something already finished.
    #expect(!rows.first { $0.phase == .discriminate }!.isAhead)
    #expect(rows.first { $0.phase == .socratic }!.isAhead)
}
