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
        /// Both end ids, so the renderer can say what kind of road this is —
        /// reached, the trail into the frontier, or a track — without
        /// re-reading the nodes.
        let out: String
        let into: String
        let dashed: Bool
    }

    /// A level's height, and the width one concept is given inside it. The band
    /// has to hold a disc, two lines of name and a state under it; the slot is
    /// what a name can be set in before it starts hyphenating.
    static let band: CGFloat = 134
    static let slot: CGFloat = 128
    /// Open sea above the first band and below the last, so the coast and its
    /// water lines close round the land instead of running off the sheet.
    static let shore: CGFloat = 56

    let levels: [[Placed]]
    let links: [Link]
    /// Which country each concept belongs to, drawn as a war map's: runs of
    /// consecutive bands, about five concepts each (`regionsOf` in
    /// atlasTerrain.ts, over the bands rather than `g`, because the bands are
    /// what sit next to each other here).
    let country: [String: Int]
    /// Each named country's capital — the concept with the most roads — and
    /// the name it lends the country. A country of three cities or fewer goes
    /// unnamed: its name would only repeat a city's, set big over it.
    let capitals: [String: Int]
    let names: [Int: String]
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
        // A level wider than the screen wraps onto the next band rather than
        // running off the side: the page scrolls one way only.
        let content = max(width, Self.slot)
        let perBand = max(1, Int(content / Self.slot))

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
            for start in stride(from: 0, to: row.count, by: perBand) {
                let line = Array(row[start..<min(start + perBand, row.count)])
                let band = rows.count
                let placed = line.enumerated().map { position, node in
                    Placed(
                        node: node,
                        level: band,
                        at: CGPoint(
                            x: content * CGFloat(position + 1) / CGFloat(line.count + 1),
                            y: Self.shore + Self.band * (CGFloat(band) + 0.5)
                        )
                    )
                }
                for one in placed { settled[one.id] = one.at.x }
                rows.append(placed)
            }
        }
        levels = rows

        func anchor(_ node: ConceptNode, _ settled: [String: CGFloat]) -> CGFloat {
            let above = (prereqs[node.id] ?? []).compactMap { settled[$0] }
            guard !above.isEmpty else { return node.x }
            return above.reduce(0, +) / CGFloat(above.count)
        }

        size = CGSize(width: content, height: Self.band * CGFloat(rows.count) + Self.shore * 2)

        let index = Dictionary(levels.flatMap { $0 }.map { ($0.id, $0.at) }, uniquingKeysWith: { first, _ in first })
        links = graph.edges.compactMap { edge in
            guard let from = index[edge.from], let to = index[edge.to] else { return nil }
            return Link(from: from, to: to, out: edge.from, into: edge.to, dashed: edge.dashed)
        }

        // A country closes when adding the next band would overshoot its share
        // by more than stopping short does.
        var degree: [String: Int] = [:]
        for edge in graph.edges { degree[edge.from, default: 0] += 1; degree[edge.to, default: 0] += 1 }
        let total = rows.reduce(0) { $0 + $1.count }
        let wanted = min(6, max(1, Int((Double(total) / 5).rounded())))
        let share = Double(total) / Double(wanted)
        var groups: [[Placed]] = [[]]
        for row in rows {
            let open = groups[groups.count - 1].count
            if open > 0, groups.count < wanted,
               abs(Double(open + row.count) - share) > abs(Double(open) - share) {
                groups.append(row)
            } else {
                groups[groups.count - 1] += row
            }
        }
        var country: [String: Int] = [:], capitals: [String: Int] = [:], names: [Int: String] = [:]
        for (n, members) in groups.enumerated() {
            for one in members { country[one.id] = n }
            guard members.count > 3,
                  let capital = members.max(by: { (degree[$0.id] ?? 0) < (degree[$1.id] ?? 0) }) else { continue }
            capitals[capital.id] = n
            names[n] = capital.node.label
        }
        self.country = country
        self.capitals = capitals
        self.names = names
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

    /// The land and the fog under the trail, baked off the main actor.
    private(set) var atlas: AtlasBake?
    @ObservationIgnored private var painted: AtlasInput?

    func paint(_ input: AtlasInput) async {
        // A new layout drops the old land at once — it would sit under the
        // wrong cities; a new colouring keeps it until the repaint lands, so
        // winning a territory doesn't blink the map.
        if painted?.size != input.size || painted?.seed != input.seed { atlas = nil }
        let bake = await AtlasTerrain.paint(input)
        guard !Task.isCancelled else { return }
        atlas = bake
        painted = input
    }

    /// The legend strip under the title.
    var legend = false
    /// The map being switched to from the title menu.
    var switching: String?
    /// The concept whose new state is landing.
    private(set) var landing: String?

    func land(_ id: String) {
        landing = id
        Task {
            try? await Task.sleep(for: .seconds(2))
            if landing == id { landing = nil }
        }
    }

    /// The drawing's scale: what the last pinch settled on, and the pinch in
    /// progress on top of it.
    @ObservationIgnored private var settledZoom: CGFloat = 1
    private(set) var zoom: CGFloat = 1

    func pinch(_ magnification: CGFloat) { zoom = min(1.8, max(0.45, settledZoom * magnification)) }
    func settlePinch() { settledZoom = zoom }
    func resetZoom() {
        settledZoom = 1
        withAnimation(Motion.standard) { zoom = 1 }
    }
}
