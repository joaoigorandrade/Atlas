import Observation
import SwiftUI

/// The canvas's own state: where the map is, how far it is zoomed, and which
/// node is highlighted. It owns no navigation — tapping a node answers *which*
/// node, and the view asks the navigator to open it.
@Observable
@MainActor
final class MapViewModel {
    /// Where the map is. A gesture folds its delta straight in, so there is
    /// never a second live transform for the drawing and the hit-test to
    /// disagree over.
    private(set) var transform = MapTransform()
    private(set) var selection: ConceptNode?
    /// The viewport, kept so the frontier jump and the initial fit do their
    /// arithmetic outside the layout pass.
    private(set) var canvas: CGSize = .zero
    /// Whether the learner has put the map somewhere themselves — and so also
    /// whether there is anything for the re-fit control to undo.
    private(set) var moved = false

    /// The scale `fit` chose. The pinch band is relative to it: 1.7× a fit that
    /// already had to shrink a 400-node map is a very different number.
    @ObservationIgnored private var fitScale: CGFloat = 1

    /// Each sub-gesture's own cumulative value, kept so every frame contributes
    /// a *delta*. `.simultaneously` ends its two halves separately, and a
    /// cumulative translation re-applied after the other half ended is how the
    /// map used to jump when one of two fingers lifted.
    @ObservationIgnored private var panBase: CGSize?
    @ObservationIgnored private var zoomBase: CGFloat?

    func fit(_ graph: ConceptGraph, in size: CGSize) {
        canvas = size
        if moved { moved = false }
        transform = .fitting(graph, in: size)
        fitScale = transform.scale
    }

    /// A size arriving after the first layout — or a map swapped in underneath
    /// — re-fits, but only while the map is still where `fit` put it: once the
    /// learner has moved it, where the map sits is their answer, not ours.
    func resize(_ graph: ConceptGraph, in size: CGSize) {
        canvas = size
        guard !moved else { return }
        fit(graph, in: size)
    }

    /// Back to the whole map. The one control that can undo any pan or pinch,
    /// including the ones that left nothing on screen.
    func reframe(_ graph: ConceptGraph) {
        withAnimation(Motion.enter) { fit(graph, in: canvas) }
    }

    // MARK: - Gestures

    func pan(_ translation: CGSize) {
        let base = panBase ?? .zero
        panBase = translation
        if !moved { moved = true }
        var next = transform
        next.offset.width += translation.width - base.width
        next.offset.height += translation.height - base.height
        transform = held(next)
    }

    func magnify(_ magnification: CGFloat, around anchor: CGPoint) {
        let base = zoomBase ?? 1
        zoomBase = magnification
        guard base > 0 else { return }
        if !moved { moved = true }
        transform = held(transform.scaled(magnification / base, about: anchor, within: fitScale))
    }

    /// Ending drops only that sub-gesture's baseline, so the other half keeps
    /// measuring from where it started. Called twice is the same as once.
    func endPan() { panBase = nil }
    func endZoom() { zoomBase = nil }

    private func held(_ transform: MapTransform) -> MapTransform {
        transform.bounded(cache?.bounds ?? .null, in: canvas)
    }

    // MARK: - Graph

    /// The graph's transform-independent half, kept across pan frames — the
    /// renderer closure would otherwise rebuild it sixty times a second.
    @ObservationIgnored private var cache: PreparedGraph?

    func prepared(_ graph: ConceptGraph) -> PreparedGraph {
        if let cache, cache.graph == graph { return cache }
        let made = PreparedGraph(graph)
        cache = made
        return made
    }

    func node(_ graph: ConceptGraph, at point: CGPoint) -> ConceptNode? {
        nodeHit(graph, transform, at: point)
    }

    func select(_ node: ConceptNode?) { selection = node }

    /// Centre the frontier without changing the zoom — "onde eu vou agora",
    /// answered in place.
    func jump(to node: ConceptNode) {
        if !moved { moved = true }
        withAnimation(Motion.enter) { transform = held(transform.centred(on: node, in: canvas)) }
    }
}
