import Testing
@testable import AtlasKit

/// Frontier derivation is the one rule every surface reads through, so it is the
/// one thing worth a test: an unknown node unlocks only when every solid
/// prerequisite is learned, gap nodes never unlock, and dashed edges never lock.
@Test func frontierIsDerivedFromPrerequisites() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "a", label: "Derivada"),
            ConceptNode(id: "b", label: "Composição"),
            ConceptNode(id: "c", label: "Regra da cadeia"),
            ConceptNode(id: "g", label: "Lacuna", gap: true),
        ],
        edges: [ConceptEdge("a", "c"), ConceptEdge("b", "c"), ConceptEdge("c", "g", dashed: true)]
    )

    // One prerequisite short: c stays locked, a and b are the frontier.
    var shown = displayStates(["a": .mastered], graph)
    #expect(shown["c"] == .unknown)
    #expect(shown["b"] == .frontier)

    // Both met: c lights up. The gap node never does, dashed edge or not.
    shown = displayStates(["a": .mastered, "b": .shaky], graph)
    #expect(shown["c"] == .frontier)
    #expect(shown["g"] == .unknown)

    // Stored progress always wins over derivation.
    shown = displayStates(["a": .mastered, "b": .mastered, "c": .learning], graph)
    #expect(shown["c"] == .learning)
}

/// A gap node keeps its own colour once its parent is learned — the dashed edge
/// never unlocks it, and `.gap` is stored, so derivation must leave it alone.
@Test func gapNodesKeepTheirState() {
    let graph = ConceptGraph(
        nodes: [ConceptNode(id: "a", label: "Derivada"), ConceptNode(id: "g", label: "Lacuna", gap: true)],
        edges: [ConceptEdge("a", "g", dashed: true)]
    )
    #expect(displayStates(["a": .mastered, "g": .gap], graph)["g"] == .gap)
}

/// The plan's order, not the generator's: leverage first for a deadline goal,
/// foundations first for mastery.
@Test func frontierIsOrderedToTheGoal() {
    // `deep` unlocks two concepts; `wide` unlocks none but is drawn first.
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "wide", label: "Solta", x: 0),
            ConceptNode(id: "deep", label: "Profunda", x: 10),
            ConceptNode(id: "c1", label: "Um", x: 20),
            ConceptNode(id: "c2", label: "Dois", x: 30),
        ],
        edges: [ConceptEdge("deep", "c1"), ConceptEdge("c1", "c2")]
    )
    let shown = displayStates([:], graph)
    #expect(orderedFrontier(shown, graph, .exam).map(\.id) == ["deep", "wide"])
    #expect(orderedFrontier(shown, graph, .mastery).map(\.id) == ["wide", "deep"])
}

/// Opening a session marks a node Learning, which alone reads as Feynman. The
/// reading record is what keeps the spiral honest about that.
@Test func readingRecordCorrectsThePhase() {
    #expect(readingPhaseIndex(.learning, nil) == 2)
    #expect(readingPhaseIndex(.learning, ReadingProgress(finished: false, handedOff: false)) == 0)
    #expect(readingPhaseIndex(.learning, ReadingProgress(finished: true, handedOff: false)) == 1)
    #expect(readingPhaseIndex(.learning, ReadingProgress(finished: true, handedOff: true)) == 2)
    // Every other state is the state's answer, reading or not.
    #expect(readingPhaseIndex(.shaky, ReadingProgress(finished: false, handedOff: false)) == 4)
}

/// The teaching boundary: every ancestor is prior, everything else on the map
/// is somebody else's pass. `tests/conceptBoundary.test.ts` pins the same shape
/// on the web — a direct-prereqs-only answer re-teaches two columns back and
/// wanders into the next concept.
@Test func theBoundaryIsEveryAncestorAgainstEverythingElse() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "a", label: "A"), ConceptNode(id: "b", label: "B"),
            ConceptNode(id: "c", label: "C"), ConceptNode(id: "d", label: "D"),
            ConceptNode(id: "g", label: "G", gap: true),
        ],
        edges: [ConceptEdge("a", "b"), ConceptEdge("b", "c"), ConceptEdge("c", "g", dashed: true)]
    )
    let boundary = graph.boundary(of: "c")
    // "a" is two hops back and still prior — the direct-prereq answer missed it.
    #expect(boundary.prior == ["A", "B"])
    // "d" is on nobody's path to "c" and belongs to its own pass; the gap node
    // is in neither list, or two learners on this topic stop sharing a cache row.
    #expect(boundary.later == ["D"])
    #expect(graph.boundary(of: "a").prior.isEmpty)
    #expect(graph.boundary(of: "a").later == ["B", "C", "D"])
}
