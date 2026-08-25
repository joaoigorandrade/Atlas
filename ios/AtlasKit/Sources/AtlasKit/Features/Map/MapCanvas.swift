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
///
/// Three passes — edges, nodes, then labels — so type always lands on top of
/// the graph instead of under the next node along.
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
        // The last step into a frontier node is the one the learner is about to
        // take: it gets the state colour, everything else stays hairline.
        let intoFrontier = shown[edge.to] == .frontier
        context.stroke(
            path,
            with: .color(intoFrontier
                ? NodeState.frontier.color.opacity(0.45)
                : Palette.ink.opacity(edge.dashed ? 0.08 : 0.13)),
            style: StrokeStyle(lineWidth: intoFrontier ? 1.6 : 1.1, lineCap: .round,
                               dash: edge.dashed ? [4, 5] : [])
        )
    }

    var pending: [(node: ConceptNode, point: CGPoint, radius: CGFloat, state: NodeState)] = []
    for node in graph.nodes {
        let state = shown[node.id] ?? .unknown
        let point = view.place(node)
        let isLit = state != .unknown
        let radius: CGFloat = state == .frontier || node.id == selected ? 15 : (node.gap == true ? 11 : isLit ? 13 : 10)
        // The frontier's halo is the design's only glow — it is what makes
        // "where do I go next" readable at a glance. One soft disc and a ring,
        // not two stacked discs: two adjacent frontiers used to merge into one
        // amber cloud with no nodes visible inside it.
        if state == .frontier {
            let glow = radius * 1.7
            context.fill(circle(point, glow), with: .color(state.color.opacity(0.14)))
            context.stroke(circle(point, glow), with: .color(state.color.opacity(0.30)), lineWidth: 1.5)
        }
        if node.id == selected, state != .frontier {
            context.stroke(circle(point, radius * 1.7), with: .color(Palette.ink.opacity(0.25)), lineWidth: 1.5)
        }
        // A paper ring and a paper fill first: nodes that sit close together
        // still read as two, and the edges running under a pale node stop
        // showing through it.
        context.stroke(circle(point, radius), with: .color(Palette.paper), lineWidth: 2.5)
        context.fill(circle(point, radius), with: .color(Palette.paper))
        context.fill(circle(point, radius), with: .color(state.color.opacity(isLit ? 1 : 0.55)))
        context.stroke(circle(point, radius), with: .color(Palette.ink.opacity(isLit ? 0.10 : 0.06)), lineWidth: 1)

        if labels, state == .frontier || state == .shaky || node.id == selected {
            pending.append((node, point, radius, state))
        }
    }

    // Frontier first: when two labels want the same patch of canvas, the one
    // naming the next move keeps it and the other is dropped rather than
    // printed over the top of it.
    // Seeded with every node: a label may never be printed over a circle, only
    // in the paper around one.
    var taken = graph.nodes.map { node -> CGRect in
        let at = view.place(node)
        return CGRect(x: at.x - 17, y: at.y - 17, width: 34, height: 34)
    }
    for item in pending.sorted(by: { ($0.state == .frontier ? 0 : 1) < ($1.state == .frontier ? 0 : 1) }) {
        let isFrontier = item.state == .frontier
        let text = Text(item.node.label).font(.atlas(.serif, isFrontier ? 14 : 12.5))
            .foregroundStyle(isFrontier ? Palette.ink : Palette.inkMuted)
        let resolved = context.resolve(text)
        // One line, always: a wrapped label is twice the box to place and reads
        // as a paragraph dropped on the map.
        let size = resolved.measure(in: CGSize(width: 400, height: 24))
        let below = labelBox(item.point, item.radius, size, above: false)
        let above = labelBox(item.point, item.radius, size, above: true)
        guard let box = [below, above].first(where: { box in !taken.contains { $0.intersects(box) } }) else { continue }
        taken.append(box)
        context.fill(Path(roundedRect: box.insetBy(dx: -6, dy: -3), cornerRadius: 8),
                     with: .color(Palette.paper))
        context.draw(resolved, in: box)
    }
}

private func circle(_ point: CGPoint, _ radius: CGFloat) -> Path {
    Path(ellipseIn: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
}

private func labelBox(_ point: CGPoint, _ radius: CGFloat, _ size: CGSize, above: Bool) -> CGRect {
    CGRect(
        x: point.x - size.width / 2,
        y: above ? point.y - radius - 10 - size.height : point.y + radius + 10,
        width: size.width,
        height: size.height
    )
}
