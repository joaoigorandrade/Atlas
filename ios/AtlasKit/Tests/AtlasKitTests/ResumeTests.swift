import Foundation
import Testing
@testable import AtlasKit

/// The two promises a launch makes: the number the dashboard says out loud, and
/// the screen the learner left the app on.

@MainActor private func store(cards: Int, target: Int = 20) -> AtlasStore {
    let owner = AtlasStore(
        api: AtlasAPI(baseURL: URL(string: "https://atlas.test")!),
        auth: AtlasAuth(),
        graph: ConceptGraph(nodes: [
            ConceptNode(id: "lat", label: "Limites laterais"),
            ConceptNode(id: "der", label: "Derivada"),
        ]),
        states: ["lat": .learning],
        subject: "Cálculo I"
    )
    owner.dailyTarget = target
    // No scheduler state at all: `dueCount` reads those as due now, which is
    // the shape a freshly drafted card arrives in.
    owner.cards = (0..<cards).map {
        StoredCard(id: "c\($0)", nodeId: "lat", type: .recall, source: "de Connect", back: "…")
    }
    return owner
}

@MainActor
@Test func theDashboardCountsTheSessionAndNotTheDebt() {
    // Twenty minutes a day → a ten-minute deck → six cards at 1.5 min each,
    // which is what `retainContentFromStore` slices on the server. Ten cards
    // are owed; six are being offered, and six is the number to say.
    let owner = store(cards: 10)
    #expect(owner.dueCount == 10)
    #expect(owner.reviewBudgetMin == 10)
    #expect(owner.dueToday == 6)

    // Under the budget the two agree — nothing is trimmed and nothing is
    // rounded away.
    #expect(store(cards: 3).dueToday == 3)
    // An empty queue stays empty: "Fila limpa" is read off this.
    #expect(store(cards: 0).dueToday == 0)
}

@MainActor
@Test func aPassSurvivesTheAppBeingKilledInTheMiddleOfIt() {
    let owner = store(cards: 0)
    owner.topicId = "t1"
    SessionViewModel.forget()
    #expect(SessionViewModel.resumable(in: owner) == nil)

    // Opening a pass marks where the learner is; advancing moves the mark.
    let session = SessionViewModel(node: owner.graph.nodes[0], store: owner, phase: .socratic)
    #expect(SessionViewModel.resumable(in: owner)?.1 == .socratic)
    session.advance()
    #expect(SessionViewModel.resumable(in: owner)?.0.id == "lat")
    #expect(SessionViewModel.resumable(in: owner)?.1 == .feynman)

    // A marker from another map is not this map's pass.
    owner.topicId = "t2"
    #expect(SessionViewModel.resumable(in: owner) == nil)
    owner.topicId = "t1"

    // A node that left the map — a gap the learner closed — takes its mark
    // with it rather than reopening a session on nothing.
    owner.graph.nodes.removeAll { $0.id == "lat" }
    #expect(SessionViewModel.resumable(in: owner) == nil)

    SessionViewModel.forget()
}
