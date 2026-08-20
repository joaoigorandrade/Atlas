import Observation
import SwiftUI

/// The canvas's own state: where the map is, how far it is zoomed, and which
/// node is highlighted. It owns no navigation — tapping a node answers *which*
/// node, and the view asks the navigator to open it.
@Observable
@MainActor
final class MapViewModel {
    private(set) var transform = MapTransform()
    /// The live gesture deltas, applied on top of `transform` until it settles.
    var pan: CGSize = .zero
    var zoom: CGFloat = 1
    private(set) var selection: ConceptNode?
    /// The viewport, kept so the frontier jump and the initial fit do their
    /// arithmetic outside the layout pass.
    private(set) var canvas: CGSize = .zero

    /// What is actually drawn: the settled transform plus whatever the finger
    /// is doing right now.
    var live: MapTransform {
        MapTransform(
            offset: CGSize(width: transform.offset.width + pan.width,
                           height: transform.offset.height + pan.height),
            scale: transform.scale * zoom
        )
    }

    func fit(_ graph: ConceptGraph, in size: CGSize) {
        canvas = size
        transform = .fitting(graph, in: size)
    }

    func resize(_ size: CGSize) { canvas = size }

    /// A gesture ends by folding its delta into the settled transform — never
    /// by leaving two sources of truth for where the map is.
    func settle() {
        transform = live
        pan = .zero
        zoom = 1
    }

    func node(_ graph: ConceptGraph, at point: CGPoint) -> ConceptNode? {
        nodeHit(graph, live, at: point)
    }

    func select(_ node: ConceptNode?) { selection = node }

    /// Centre the frontier without changing the zoom — "onde eu vou agora",
    /// answered in place.
    func jump(to node: ConceptNode) {
        withAnimation(Motion.enter) { transform = live.centred(on: node, in: canvas) }
        pan = .zero
        zoom = 1
    }
}
