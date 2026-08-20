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
