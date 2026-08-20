import Foundation
import Testing
@testable import AtlasKit

/// The placement is the only thing in the app that writes mastery the learner
/// never sees happen — a wrong write here means a map that lies from day one,
/// silently. These are the two rules that decide it.
@Test func aCorrectAnswerPrunesTheWholePrerequisiteChain() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "der", label: "Derivada"),
            ConceptNode(id: "lat", label: "Limites laterais"),
            ConceptNode(id: "cadeia", label: "Regra da cadeia"),
        ],
        edges: [ConceptEdge("der", "lat"), ConceptEdge("lat", "cadeia")]
    )

    let known = applyDiagnosticEffect([:], .mastered, nodeId: "cadeia", edges: graph.edges)
    #expect(known["cadeia"] == .mastered)
    #expect(known["lat"] == .mastered)
    #expect(known["der"] == .mastered)

    // A genuine miss touches only the concept: the chain below it is where the
    // reason is hiding, and pruning it would hide that for good.
    let missed = applyDiagnosticEffect([:], .shaky, nodeId: "cadeia", edges: graph.edges)
    #expect(missed["cadeia"] == .shaky)
    #expect(missed["lat"] == nil)
}

@Test func theLadderStepsAndDiscountsALuckyMiss() {
    #expect(stepDifficulty(.medium, correct: true) == .hard)
    #expect(stepDifficulty(.hard, correct: true) == .hard)
    #expect(stepDifficulty(.easy, correct: false) == .easy)

    // No evidence yet, or evidence at the same level: a miss is a miss.
    #expect(diagnosticEffect(.easy, correct: false, maxCorrect: nil) == .shaky)
    #expect(diagnosticEffect(.medium, correct: false, maxCorrect: .medium) == .shaky)
    // Strictly easier than what they have already proven: a slip, not a gap.
    #expect(diagnosticEffect(.easy, correct: false, maxCorrect: .hard) == .mastered)
    #expect(diagnosticEffect(.hard, correct: true, maxCorrect: nil) == .mastered)
}

/// The map arrives as a flat list carrying its own prerequisites, and the
/// canvas paints it before the last concept lands — so the derivation has to
/// hold over a *partial* list, with forward references dropped rather than
/// believed.
@Test func aPartialMapIsStillARealGraph() throws {
    let json = """
    [{"id":"der","label":"Derivada","state":"unknown","g":1,"week":0,"x":80,"y":60,"prereqs":[]},
     {"id":"lat","label":"Limites laterais","g":2,"week":0,"x":160,"y":90,"prereqs":["der","cadeia"]}]
    """
    let nodes = try JSONDecoder().decode([MapNode].self, from: Data(json.utf8))
    let graph = graphFromMapNodes(nodes)

    #expect(graph.nodes.count == 2)
    // "cadeia" hasn't been written yet: the edge to it is dropped, not invented.
    #expect(graph.edges.count == 1)
    #expect(graph.edges.first == ConceptEdge("der", "lat"))
    // A concept with no sentence still lands on the map.
    #expect(graph.nodes[1].summary == nil)
    #expect(initialStates(graph)["lat"] == .unknown)
    // Everything unlocked so far is the frontier — that is what the learner sees
    // assembling.
    #expect(displayStates(initialStates(graph), graph)["der"] == .frontier)
}

/// A hesitant answer splits its sub-concept out under the parent. Twice must
/// not make two.
@Test func aMissedQuestionHangsOneGapUnderItsConcept() {
    let graph = ConceptGraph(nodes: [ConceptNode(id: "cadeia", label: "Regra da cadeia", g: 3, x: 100, y: 100)])
    let spec = GapSpec(id: "cadeia-interna", label: "Função interna", reason: "Você parou na função de dentro.", dx: 40, dy: 50)

    let once = spawnGap(graph, parentId: "cadeia", spec)
    #expect(once.nodes.count == 2)
    #expect(once.nodes[1].state == .gap)
    #expect(once.nodes[1].x == 140)
    #expect(once.edges.first?.dashed == true)
    // Idempotent, and a no-op when the parent isn't on this map.
    #expect(spawnGap(once, parentId: "cadeia", spec).nodes.count == 2)
    #expect(spawnGap(graph, parentId: "sumiu", spec).nodes.count == 1)
}
