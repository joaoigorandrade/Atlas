import SwiftUI

/// Where graph space lands on the canvas — the whole map, fitted.
struct MapTransform: Equatable {
    var offset: CGSize = .zero
    var scale: CGFloat = 1

    func place(_ node: ConceptNode) -> CGPoint {
        CGPoint(x: node.x * scale + offset.width, y: node.y * scale + offset.height)
    }

    /// The whole map, centred in `size`.
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
}

/// The widest disc the map draws — a frontier node and its halo.
enum NodeDisc {
    static let radius: CGFloat = 15
    static let halo: CGFloat = 1.7
}

/// Everything a redraw needs that the transform never changes: the edges
/// resolved to their endpoint nodes, and the closest pair. The renderer re-runs
/// on every frame the map animates in, so anything O(n) that only depends on
/// the graph is built here instead — once per graph.
struct PreparedGraph {
    struct Link {
        let a: ConceptNode
        let b: ConceptNode
        /// The destination id, kept so the frontier test doesn't re-read `b`.
        let into: String
        let dashed: Bool
    }

    let graph: ConceptGraph
    /// Edges naming a node the graph doesn't have are dropped here rather than
    /// looked up and skipped sixty times a second.
    let links: [Link]
    /// The closest two node centres, in graph space. Discs are drawn in screen
    /// space, so this is what says whether the current scale still has room for
    /// them — see `drawGraph`.
    /// ponytail: O(n²) over a map of tens of nodes, once per graph; sort by x
    /// if maps ever get big enough to feel it.
    let minSpacing: CGFloat

    init(_ graph: ConceptGraph) {
        self.graph = graph
        let byId = Dictionary(graph.nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        links = graph.edges.compactMap { edge in
            guard let a = byId[edge.from], let b = byId[edge.to] else { return nil }
            return Link(a: a, b: b, into: edge.to, dashed: edge.dashed)
        }
        var closest = CGFloat.greatestFiniteMagnitude
        for (i, a) in graph.nodes.enumerated() {
            for b in graph.nodes.dropFirst(i + 1) {
                closest = min(closest, hypot(a.x - b.x, a.y - b.y))
            }
        }
        minSpacing = closest == .greatestFiniteMagnitude ? 60 : max(closest, 1)
    }
}

/// The map itself, drawn, unlabelled — the territory onboarding paints behind
/// screens 6 and 7. A map nobody can tap yet is a picture, and labelling every
/// node turns it into a wall of type. Edges first, then nodes on top.
func drawGraph(
    _ context: inout GraphicsContext,
    _ prepared: PreparedGraph,
    _ shown: [String: NodeState],
    _ view: MapTransform,
    viewport: CGSize
) {
    // Off-screen still costs a Path and a stroke. The slack covers the widest
    // halo on a disc that sits just outside the frame.
    let visible = CGRect(origin: .zero, size: viewport).insetBy(dx: -48, dy: -48)

    for link in prepared.links {
        let from = view.place(link.a), to = view.place(link.b)
        // Padded because an axis-aligned edge has a zero-width bounding box,
        // and an empty rect intersects nothing.
        let bounds = CGRect(x: min(from.x, to.x), y: min(from.y, to.y),
                            width: abs(to.x - from.x), height: abs(to.y - from.y))
            .insetBy(dx: -2, dy: -2)
        guard visible.intersects(bounds) else { continue }
        var path = Path()
        path.move(to: from)
        path.addLine(to: to)
        // The last step into a frontier node is the one the learner is about to
        // take: it gets the state colour, everything else stays hairline.
        let intoFrontier = shown[link.into] == .frontier
        context.stroke(
            path,
            with: .color(intoFrontier
                ? NodeState.frontier.color.opacity(0.45)
                : Palette.ink.opacity(link.dashed ? 0.08 : 0.13)),
            style: StrokeStyle(lineWidth: intoFrontier ? 1.6 : 1.1, lineCap: .round,
                               dash: link.dashed ? [4, 5] : [])
        )
    }

    for node in prepared.graph.nodes {
        let point = view.place(node)
        guard visible.contains(point) else { continue }
        let state = shown[node.id] ?? .unknown
        let isLit = state != .unknown
        // Deliberately screen space, unlike the web, where the node layer sits
        // inside the scaled transform (`MapCanvas.tsx`) and discs grow with the
        // zoom. On touch a disc is a tap target, so pinching spreads the map
        // apart at a constant 44pt reach instead of shrinking what can be hit.
        // …up to the point where the transform packs the map tighter than a
        // disc is wide. The post-build preview and the placement result fit a
        // whole map into a card, the centres land under 30pt apart, and
        // constant-size discs merge into a blob. Cap by the closest pair rather
        // than by a "this is a preview" flag: the full-screen map at a real
        // zoom is already above the cap and is left exactly as it was.
        let room = prepared.minSpacing * view.scale
        let wanted: CGFloat = state == .frontier ? NodeDisc.radius : (node.gap == true ? 11 : isLit ? 13 : 10)
        let radius = min(wanted, max(5, room * 0.42))
        // The frontier's halo is the design's only glow — it is what makes
        // "where do I go next" readable at a glance. One soft disc and a ring,
        // not two stacked discs: two adjacent frontiers used to merge into one
        // amber cloud with no nodes visible inside it.
        let outer = state == .frontier ? min(radius * NodeDisc.halo, max(6, room * 0.5)) : radius
        if state == .frontier {
            context.fill(circle(point, outer), with: .color(state.color.opacity(0.14)))
            context.stroke(circle(point, outer), with: .color(state.color.opacity(0.30)), lineWidth: 1.5)
        }
        // A paper ring and a paper fill first: nodes that sit close together
        // still read as two, and the edges running under a pale node stop
        // showing through it.
        context.stroke(circle(point, radius), with: .color(Palette.paper), lineWidth: 2.5)
        context.fill(circle(point, radius), with: .color(Palette.paper))
        context.fill(circle(point, radius), with: .color(state.color.opacity(isLit ? 1 : 0.55)))
        context.stroke(circle(point, radius), with: .color(Palette.ink.opacity(isLit ? 0.10 : 0.06)), lineWidth: 1)
    }
}

private func circle(_ point: CGPoint, _ radius: CGFloat) -> Path {
    Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
}
