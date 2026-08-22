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

/// The correction the spiral cannot be drawn without. A node goes Learning the
/// moment a reading pass is left part-way through, and the state alone maps
/// that to phase 2 — ticking Consume *and* Socratic off on the strength of two
/// sections read. Mirrors `readingPhaseIndex` in `lib/curriculum/calibration.ts`.
@Test func theReadingRecordGetsTheLastWordOnWhichPhaseIsCurrent() {
    var progress = ConsumeProgress()
    progress.idx = 1
    progress.total = 5
    // Still reading: Consume is current, nothing behind it is done.
    #expect(readingPhaseIndex(.learning, progress: progress) == 0)

    progress.finished = true
    // Read to the end and left for the map: a finished reading, and no more.
    #expect(readingPhaseIndex(.learning, progress: progress) == 1)

    progress.handedOff = true
    // Socratic was actually opened — now the state-derived answer is honest.
    #expect(readingPhaseIndex(.learning, progress: progress) == 2)

    // No record, and every state but Learning: the state has the only word.
    #expect(readingPhaseIndex(.learning, progress: nil) == 2)
    #expect(readingPhaseIndex(.frontier, progress: progress) == 0)
    #expect(readingPhaseIndex(.shaky, progress: progress) == 4)
    #expect(readingPhaseIndex(.mastered, reviewed: true, progress: progress) == 6)
}
