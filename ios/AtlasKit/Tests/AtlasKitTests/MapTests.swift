import Foundation
import Testing
@testable import AtlasKit

/// The map's two pieces of arithmetic. Both are silent when wrong: a bad fit
/// draws an empty canvas, and a bad hit-test opens the wrong node's sheet —
/// neither crashes, so neither shows up without a check.
@Test func tappingPicksTheNearestNodeAndNothingFarAway() {
    let graph = ConceptGraph(nodes: [
        ConceptNode(id: "a", label: "A", x: 100, y: 100),
        ConceptNode(id: "b", label: "B", x: 140, y: 100),
    ])
    let view = MapTransform(offset: CGSize(width: 10, height: 20), scale: 1)

    // Between the two, leaning towards b: b wins, not whichever comes first.
    #expect(nodeHit(graph, view, at: CGPoint(x: 138, y: 120))?.id == "b")
    #expect(nodeHit(graph, view, at: CGPoint(x: 110, y: 120))?.id == "a")
    // Empty canvas stays empty — a tap to pan must not select.
    #expect(nodeHit(graph, view, at: CGPoint(x: 300, y: 300)) == nil)
    // The reach is the tap target, not the drawn 13pt circle.
    #expect(nodeHit(graph, view, at: CGPoint(x: 110, y: 140))?.id == "a")
}

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

@MainActor
@Test func theModelRebuildsThePreparedGraphOnlyWhenTheGraphChanges() {
    let model = MapViewModel()
    let graph = ConceptGraph(nodes: [ConceptNode(id: "a", label: "A")])
    let first = model.prepared(graph)
    #expect(model.prepared(graph) === first)
    // A node landing mid-stream is a different graph and must not be cached over.
    var grown = graph
    grown.nodes.append(ConceptNode(id: "b", label: "B"))
    #expect(model.prepared(grown) !== first)
}

/// The gesture arithmetic. All three of these fail silently: a bad anchor moves
/// the node out from under the fingers, an unclamped scale leaves blank paper
/// with no way back, and a re-applied cumulative delta jumps the map by
/// however far the other finger travelled.
@MainActor
@Test func pinchingHoldsTheFingersAndStaysInTheBand() {
    let graph = ConceptGraph(nodes: [
        ConceptNode(id: "a", label: "A", x: 0, y: 0),
        ConceptNode(id: "b", label: "B", x: 200, y: 200),
    ])
    let model = MapViewModel()
    _ = model.prepared(graph)
    model.fit(graph, in: CGSize(width: 390, height: 600))
    let fitScale = model.transform.scale

    // Whatever is under the pinch centroid stays under it.
    let anchor = CGPoint(x: 120, y: 200)
    let before = model.transform
    let point = CGPoint(x: (anchor.x - before.offset.width) / before.scale,
                        y: (anchor.y - before.offset.height) / before.scale)
    model.magnify(1.4, around: anchor)
    let after = model.transform
    #expect(abs(point.x * after.scale + after.offset.width - anchor.x) < 0.5)
    #expect(abs(point.y * after.scale + after.offset.height - anchor.y) < 0.5)

    // Repeated pinches cannot walk out of the band in either direction.
    for _ in 0..<3 { model.endZoom(); model.magnify(4, around: anchor) }
    #expect(model.transform.scale <= fitScale * 1.7 + 0.001)
    for _ in 0..<3 { model.endZoom(); model.magnify(0.05, around: anchor) }
    #expect(model.transform.scale >= fitScale * 0.4 - 0.001)
}

@MainActor
@Test func oneHalfOfTheGestureEndingDoesNotReapplyTheOther() {
    let graph = ConceptGraph(nodes: [ConceptNode(id: "a", label: "A", x: 100, y: 100)])
    let model = MapViewModel()
    _ = model.prepared(graph)
    model.fit(graph, in: CGSize(width: 390, height: 600))
    let start = model.transform.offset.width

    model.pan(CGSize(width: 30, height: 0))
    // The magnify half ends while the drag is still live — lifting one of two
    // fingers. The drag's next frame is still cumulative from its own start.
    model.endZoom()
    model.pan(CGSize(width: 40, height: 0))
    #expect(abs(model.transform.offset.width - (start + 40)) < 0.001)

    // A re-fit undoes it all, however far the map was thrown.
    model.pan(CGSize(width: 9000, height: 9000))
    model.reframe(graph)
    #expect(model.transform == .fitting(graph, in: model.canvas))
    #expect(model.moved == false)
}
