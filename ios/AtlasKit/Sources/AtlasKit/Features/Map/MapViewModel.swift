import Observation
import SwiftUI

/// The map laid out in levels: every concept exactly once, at its own depth,
/// with the real edges between them — including the ones that reach back
/// several levels, and the levels that hold half a dozen concepts side by side.
///
/// Depth is the longest path from a root, not `ConceptNode.g`: `g` is whatever
/// the generator wrote and defaults to zero on a map built before it existed,
/// which lays every concept out on one line. The edges are the thing the layout
/// has to agree with, so the edges are what it counts.
struct TrailMap: Equatable {
    /// A concept and where it sits, in content space.
    struct Placed: Identifiable, Equatable {
        let node: ConceptNode
        let level: Int
        /// The centre of its disc. `y` is the middle of the level's band, so a
        /// level reads as one line straight across.
        let at: CGPoint

        var id: String { node.id }
    }

    /// One edge, resolved to the two points it runs between. Edges naming a
    /// node the graph doesn't have are dropped when the map is built rather
    /// than looked up and skipped on every redraw.
    struct Link: Equatable {
        let from: CGPoint
        let to: CGPoint
        /// The destination id, so the renderer can ask whether this is the last
        /// step into the frontier without re-reading the node.
        let into: String
        let dashed: Bool
    }

    /// A level's height, and the width one concept is given inside it. The band
    /// has to hold a disc, two lines of name and a state under it; the slot is
    /// what a name can be set in before it starts hyphenating.
    static let band: CGFloat = 134
    static let slot: CGFloat = 128

    let levels: [[Placed]]
    let links: [Link]
    /// The whole map's size. Wider than the screen when a level holds more
    /// concepts than fit across it — that is what the horizontal scroll is for.
    let size: CGSize

    var placed: [Placed] { levels.flatMap { $0 } }

    init(_ graph: ConceptGraph, width: CGFloat) {
        // Solid edges only, as everywhere else: a dashed edge hangs a gap off
        // its parent and unlocks nothing, so it must not push it down a level.
        var prereqs: [String: [String]] = [:]
        for edge in graph.edges where !edge.dashed { prereqs[edge.to, default: []].append(edge.from) }

        var depth: [String: Int] = [:]
        var open: Set<String> = []
        // Memoised, and a cycle stops at the node that closes it instead of
        // recurring forever. A generated map is a DAG, but nothing on the wire
        // enforces that, and an infinite recursion here hangs the map tab.
        func level(_ id: String) -> Int {
            if let known = depth[id] { return known }
            guard open.insert(id).inserted else { return 0 }
            defer { open.remove(id) }
            let found = (prereqs[id] ?? []).map(level).max().map { $0 + 1 } ?? 0
            depth[id] = found
            return found
        }

        let ranked = Dictionary(grouping: graph.nodes) { level($0.id) }
        let count = (ranked.keys.max() ?? 0) + 1
        let widest = ranked.values.map(\.count).max() ?? 1
        let content = max(width, CGFloat(widest) * Self.slot)

        // Top down, each level ordered under its own prerequisites rather than
        // by the browser's `x`: spreading a level evenly and then sorting it by
        // a coordinate from a different layout drags every edge across the map.
        // Placing a concept over the average of what it waits on is the cheap
        // half of the usual layered-graph ordering, and it is the half that
        // removes the crossings a reader actually notices.
        //
        // ponytail: one pass, no sweeps. Add the back-and-forth passes if a
        // real map still looks tangled — a phone shows a handful of levels at a
        // time, and each one is already sorted against the level above it.
        var settled: [String: CGFloat] = [:]
        var rows: [[Placed]] = []
        for depth in 0..<count {
            // Roots have nothing above them, so they keep the order the browser
            // laid them out in; everything deeper is placed under its parents.
            let row = (ranked[depth] ?? []).sorted { left, right in
                (anchor(left, settled), left.x, left.id) < (anchor(right, settled), right.x, right.id)
            }
            let placed = row.enumerated().map { position, node in
                Placed(
                    node: node,
                    level: depth,
                    at: CGPoint(
                        x: content * CGFloat(position + 1) / CGFloat(row.count + 1),
                        y: Self.band * (CGFloat(depth) + 0.5)
                    )
                )
            }
            for one in placed { settled[one.id] = one.at.x }
            rows.append(placed)
        }
        levels = rows

        func anchor(_ node: ConceptNode, _ settled: [String: CGFloat]) -> CGFloat {
            let above = (prereqs[node.id] ?? []).compactMap { settled[$0] }
            guard !above.isEmpty else { return node.x }
            return above.reduce(0, +) / CGFloat(above.count)
        }

        size = CGSize(width: content, height: Self.band * CGFloat(count))

        let index = Dictionary(levels.flatMap { $0 }.map { ($0.id, $0.at) }, uniquingKeysWith: { first, _ in first })
        links = graph.edges.compactMap { edge in
            guard let from = index[edge.from], let to = index[edge.to] else { return nil }
            return Link(from: from, to: to, into: edge.to, dashed: edge.dashed)
        }
    }
}

/// The map screen's own state: the layout, and which concept is highlighted. It
/// owns no navigation — tapping a concept answers *which* node, and the view
/// asks the navigator to open it.
@Observable
@MainActor
final class MapViewModel {
    private(set) var selection: ConceptNode?

    /// Built once per graph and width. A `body` reads this on every scroll
    /// frame, and walking the edges there would put the whole layout on the
    /// scroll loop.
    @ObservationIgnored private var cache: (graph: ConceptGraph, width: CGFloat, map: TrailMap)?

    func trail(_ graph: ConceptGraph, width: CGFloat) -> TrailMap {
        if let cache, cache.graph == graph, cache.width == width { return cache.map }
        let made = TrailMap(graph, width: width)
        cache = (graph, width, made)
        return made
    }

    func select(_ node: ConceptNode?) { selection = node }
}
