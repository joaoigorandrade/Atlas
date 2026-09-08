import Foundation
import Testing
@testable import AtlasKit

/// The layout's own arithmetic, and it is silent when wrong: a bad depth draws
/// a plausible-looking map with concepts on levels their prerequisites have not
/// reached yet, and a dropped edge simply isn't there.
@Test func levelsAreTheLongestPathAndHoldEverythingAtThatDepthSideBySide() {
    let graph = ConceptGraph(
        nodes: [
            ConceptNode(id: "a", label: "A", x: 10),
            ConceptNode(id: "b", label: "B", x: 90),
            ConceptNode(id: "c", label: "C", x: 40),
            ConceptNode(id: "d", label: "D", x: 60),
        ],
        // `d` waits on `a` (a root) and on `c` (two levels down), so the
        // longest path — not the shortest, and not the first one found — is
        // what puts it below both.
        edges: [ConceptEdge("a", "c"), ConceptEdge("c", "d"), ConceptEdge("a", "d"),
                ConceptEdge("b", "d", dashed: true)]
    )
    let map = TrailMap(graph, width: 390)

    // `a` and `b` are both roots and share the top level, left to right by x.
    #expect(map.levels.map { $0.map(\.id) } == [["a", "b"], ["c"], ["d"]])
    #expect(map.levels[0][0].at.x < map.levels[0][1].at.x)
    #expect(map.levels[0][0].at.y < map.levels[1][0].at.y)
    // A dashed edge hangs a gap off its parent and unlocks nothing, so it never
    // pushes `d` below `b`; it is still drawn.
    #expect(map.links.count == 4)
    #expect(map.links.filter(\.dashed).map(\.into) == ["d"])
}

/// A map that closes a loop must not hang the tab.
@Test func aCycleStopsInsteadOfRecurringForever() {
    let graph = ConceptGraph(
        nodes: [ConceptNode(id: "a", label: "A"), ConceptNode(id: "b", label: "B")],
        edges: [ConceptEdge("a", "b"), ConceptEdge("b", "a")]
    )
    #expect(TrailMap(graph, width: 390).placed.count == 2)
}

/// A level wider than the phone widens the map rather than crushing the names
/// into it — that is what the horizontal scroll is for.
@Test func aWideLevelMakesTheMapWiderThanTheScreen() {
    let graph = ConceptGraph(nodes: (0..<6).map { ConceptNode(id: "n\($0)", label: "N", x: Double($0)) })
    let map = TrailMap(graph, width: 390)
    #expect(map.levels.count == 1)
    #expect(map.size.width == TrailMap.slot * 6)
    #expect(map.placed.allSatisfy { $0.at.x > 0 && $0.at.x < map.size.width })
}

@MainActor
@Test func theModelRebuildsTheLayoutOnlyWhenTheGraphOrTheWidthChanges() {
    let model = MapViewModel()
    let graph = ConceptGraph(nodes: [ConceptNode(id: "a", label: "A")])
    let first = model.trail(graph, width: 390)
    #expect(model.trail(graph, width: 390) == first)
    // A node landing mid-stream is a different graph and must not be cached over.
    var grown = graph
    grown.nodes.append(ConceptNode(id: "b", label: "B"))
    #expect(model.trail(grown, width: 390).placed.map(\.id) == ["a", "b"])
}

/// `fitting` still draws the map assembling behind onboarding.
@Test func fittingCentresTheWholeGraph() {
    let graph = ConceptGraph(nodes: [
        ConceptNode(id: "a", label: "A", x: 60, y: 60),
        ConceptNode(id: "b", label: "B", x: 260, y: 360),
    ])
    let size = CGSize(width: 390, height: 500)
    let fit = MapTransform.fitting(graph, in: size)
    let a = fit.place(graph.nodes[0]), b = fit.place(graph.nodes[1])
    for point in [a, b] {
        #expect(point.x > 0 && point.x < size.width)
        #expect(point.y > 0 && point.y < size.height)
    }
    // Centred: the margins on both sides match.
    #expect(abs(a.x - (size.width - b.x)) < 0.5)
    #expect(abs(a.y - (size.height - b.y)) < 0.5)
}

/// The fixture run is what phase 3 is looked at through — if its states stop
/// deriving a frontier, the map opens with nothing lit and no error.
@Test func fixtureRunHasALiveFrontier() {
    let shown = displayStates(Fixtures.states, Fixtures.graph)
    #expect(shown["cadeia"] == .frontier)
    #expect(shown["epsilon"] == .gap)
    #expect(shown["seq"] == .unknown)
    #expect(phaseIndex(.frontier) == 0)
    #expect(phaseIndex(.mastered) == 5)
    #expect(phaseIndex(.mastered, reviewed: true) == 6)
    #expect(phaseIndex(.unknown) == -1)
}

/// The edge index moved out of the renderer, so the drop-a-dangling-edge rule
/// moved with it — and it is silent when wrong: an edge to a node that isn't
/// there would draw from the origin, or trap.
@Test func preparingResolvesEdgesOnceAndDropsDanglingOnes() {
    let graph = ConceptGraph(
        nodes: [ConceptNode(id: "a", label: "A"), ConceptNode(id: "b", label: "B")],
        edges: [ConceptEdge("a", "b"), ConceptEdge("a", "ghost"), ConceptEdge("b", "a", dashed: true)]
    )
    let prepared = PreparedGraph(graph)
    #expect(prepared.links.count == 2)
    #expect(prepared.links.map(\.into) == ["b", "a"])
    #expect(prepared.links.map(\.dashed) == [false, true])
}


