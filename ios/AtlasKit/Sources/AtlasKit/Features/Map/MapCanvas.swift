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
}

/// The widest disc the map draws — a frontier node and its halo.
enum NodeDisc {
    static let radius: CGFloat = 15
    static let halo: CGFloat = 1.7
}

/// Everything a redraw needs that the transform never changes: the edges
/// resolved to their endpoint nodes, and the size each label shapes to. The
/// renderer closure re-runs on every pan and pinch frame, so anything O(n) that
/// only depends on the graph is built here instead — once per graph.
///
/// A class, not a struct, because the label metrics fill in lazily as labels
/// are first drawn.
final class PreparedGraph {
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
    private var metrics: [Key: CGSize] = [:]

    private struct Key: Hashable {
        let label: String
        let frontier: Bool
        /// Labels use `Font.custom`, which scales — a metric measured at one
        /// text size is wrong at the next.
        let type: DynamicTypeSize
    }

    init(_ graph: ConceptGraph) {
        self.graph = graph
        let byId = Dictionary(graph.nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        links = graph.edges.compactMap { edge in
            guard let a = byId[edge.from], let b = byId[edge.to] else { return nil }
            return Link(a: a, b: b, into: edge.to, dashed: edge.dashed)
        }
    }

    /// Core Text shaping is the expensive half of a label and depends on the
    /// string and the point size only — never on where the map is dragged to.
    func measure(_ label: String, frontier: Bool, _ environment: EnvironmentValues,
                 shape: () -> CGSize) -> CGSize {
        let key = Key(label: label, frontier: frontier, type: environment.dynamicTypeSize)
        if let known = metrics[key] { return known }
        let size = shape()
        metrics[key] = size
        return size
    }
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
    _ prepared: PreparedGraph,
    _ shown: [String: NodeState],
    _ view: MapTransform,
    viewport: CGSize,
    labels: Bool = true
) {
    // At any real zoom most of a generated map is off-screen, and off-screen
    // still costs a Path and a stroke. The slack covers the widest halo and a
    // label hanging off a disc that sits just outside the frame.
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

    var pending: [(node: ConceptNode, point: CGPoint, radius: CGFloat, state: NodeState)] = []
    // A label may never be printed over a circle, only in the paper around one,
    // so every drawn node reserves its own patch as it goes — out to the glow
    // it actually drew, not to a guessed radius.
    var taken: [CGRect] = []
    for node in prepared.graph.nodes {
        let point = view.place(node)
        guard visible.contains(point) else { continue }
        let state = shown[node.id] ?? .unknown
        let isLit = state != .unknown
        // Deliberately screen space, unlike the web, where the node layer sits
        // inside the scaled transform (`MapCanvas.tsx`) and discs grow with the
        // zoom. On touch a disc is a tap target, so pinching spreads the map
        // apart at a constant 44pt reach instead of shrinking what can be hit.
        let radius: CGFloat = state == .frontier ? NodeDisc.radius : (node.gap == true ? 11 : isLit ? 13 : 10)
        // The frontier's halo is the design's only glow — it is what makes
        // "where do I go next" readable at a glance. One soft disc and a ring,
        // not two stacked discs: two adjacent frontiers used to merge into one
        // amber cloud with no nodes visible inside it.
        let outer = state == .frontier ? radius * NodeDisc.halo : radius
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

        taken.append(CGRect(x: point.x - outer, y: point.y - outer, width: outer * 2, height: outer * 2))
        if labels, state == .frontier || state == .shaky {
            pending.append((node, point, radius, state))
        }
    }

    // Frontier first: when two labels want the same patch of canvas, the one
    // naming the next move keeps it and the other is dropped rather than
    // printed over the top of it.
    for item in pending.sorted(by: { ($0.state == .frontier ? 0 : 1) < ($1.state == .frontier ? 0 : 1) }) {
        let isFrontier = item.state == .frontier
        let text = Text(verbatim: item.node.label).font(.atlas(.serif, isFrontier ? 14 : 12.5))
            .foregroundStyle(isFrontier ? Palette.ink : Palette.inkMuted)
        let resolved = context.resolve(text)
        // One line, always: a wrapped label is twice the box to place and reads
        // as a paragraph dropped on the map. An unbounded box is what makes it
        // one line — a fixed height clipped the serif at accessibility sizes.
        let size = prepared.measure(item.node.label, frontier: isFrontier, context.environment) {
            resolved.measure(in: CGSize(width: 10_000, height: 10_000))
        }
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
