import SwiftUI

/// Pan and zoom, in one place so the drawing and the tap hit-test can never
/// disagree about where a node is.
struct MapTransform: Equatable {
    var offset: CGSize = .zero
    var scale: CGFloat = 1

    func place(_ node: ConceptNode) -> CGPoint {
        CGPoint(x: node.x * scale + offset.width, y: node.y * scale + offset.height)
    }

    /// The whole map, centred in `size` with room for the labels under a node.
    static func fitting(_ graph: ConceptGraph, in size: CGSize, inset: CGFloat = 46) -> MapTransform {
        let xs = graph.nodes.map(\.x), ys = graph.nodes.map(\.y)
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max(),
              size.width > inset * 2, size.height > inset * 2 else { return .init() }
        let scale = min(
            (size.width - inset * 2) / max(maxX - minX, 1),
            (size.height - inset * 2) / max(maxY - minY, 1),
            1.6
        )
        return MapTransform(
            offset: CGSize(
                width: (size.width - (maxX - minX) * scale) / 2 - minX * scale,
                height: (size.height - (maxY - minY) * scale) / 2 - minY * scale
            ),
            scale: scale
        )
    }

    /// Puts one node in the middle of the viewport, keeping the current zoom.
    func centred(on node: ConceptNode, in size: CGSize) -> MapTransform {
        MapTransform(
            offset: CGSize(width: size.width / 2 - node.x * scale, height: size.height / 2 - node.y * scale),
            scale: scale
        )
    }
}

/// The nearest node under a tap, or nil for empty canvas. The reach is a tap
/// target, not the drawn radius — the design's 13pt circles are far under 44pt.
///
/// One pass, no intermediate arrays: this runs on every tap over a graph that
/// can be hundreds of nodes long.
func nodeHit(_ graph: ConceptGraph, _ transform: MapTransform, at point: CGPoint,
             reach: CGFloat = Metrics.tap / 2) -> ConceptNode? {
    var best: (node: ConceptNode, distance: CGFloat)?
    for node in graph.nodes {
        let at = transform.place(node)
        let distance = hypot(at.x - point.x, at.y - point.y)
        guard distance <= reach, best.map({ distance < $0.distance }) ?? true else { continue }
        best = (node, distance)
    }
    return best?.node
}

/// The map itself, drawn. A free function because onboarding paints the same
/// territory behind screens 6 and 7 — the map assembling is the same map.
///
/// `labels` is off there: a map nobody can tap yet is a picture, and labelling
/// every node turns it into a wall of type. On the real canvas only the nodes
/// that carry a decision are labelled; the rest answer to a tap.
func drawGraph(
    _ context: inout GraphicsContext,
    _ graph: ConceptGraph,
    _ shown: [String: NodeState],
    _ view: MapTransform,
    selected: String? = nil,
    labels: Bool = true
) {
    // Edges name their endpoints by id; a linear scan per edge is O(n·e) on a
    // canvas that redraws on every pan frame, so the index is built once.
    let byId = Dictionary(graph.nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    for edge in graph.edges {
        guard let a = byId[edge.from], let b = byId[edge.to] else { continue }
        var path = Path()
        path.move(to: view.place(a))
        path.addLine(to: view.place(b))
        context.stroke(
            path,
            with: .color(Palette.ink.opacity(edge.dashed ? 0.10 : 0.16)),
            style: StrokeStyle(lineWidth: 1.2, dash: edge.dashed ? [4, 5] : [])
        )
    }
    for node in graph.nodes {
        let state = shown[node.id] ?? .unknown
        let point = view.place(node)
        let radius: CGFloat = state == .frontier || node.id == selected ? 15 : (node.gap == true ? 11 : 13)
        // The frontier's two haloes are the design's only glow — they are what
        // makes "where do I go next" readable at a glance.
        if state == .frontier {
            for (r, alpha) in [(radius * 2, 0.12), (radius * 1.4, 0.22)] {
                context.fill(Path(ellipseIn: CGRect(x: point.x - r, y: point.y - r, width: r * 2, height: r * 2)),
                             with: .color(state.color.opacity(alpha)))
            }
        }
        context.fill(
            Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)),
            with: .color(state.color)
        )
        guard labels, state == .frontier || state == .shaky || node.id == selected else { continue }
        context.draw(
            Text(node.label).font(.atlas(.serif, state == .frontier ? 14 : 12.5))
                .foregroundStyle(state == .frontier ? Palette.ink : Palette.inkMuted),
            at: CGPoint(x: point.x, y: point.y + radius + 16)
        )
    }
}
