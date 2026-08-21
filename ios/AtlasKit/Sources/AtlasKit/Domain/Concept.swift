import SwiftUI

/// The app's shared vocabulary, mirroring `lib/curriculum/types.ts`.
/// Never invent a state or a colour for one.
public enum NodeState: String, Codable, Sendable, CaseIterable {
    case unknown, frontier, learning, shaky, mastered, gap

    public var color: Color {
        switch self {
        case .unknown: Color(hex: 0xB3ADA2)
        case .frontier: Color(hex: 0xC99A2E)
        case .learning: Color(hex: 0x5B7FBF)
        case .shaky: Color(hex: 0xBD7038)
        case .mastered: Color(hex: 0x4C8B63)
        case .gap: Color(hex: 0xC1574A)
        }
    }

    /// A prerequisite is met once the node has been learned at least once.
    var isLearned: Bool { self == .learning || self == .shaky || self == .mastered }
}

/// What is actually stored per node. `frontier` is never stored — it is derived
/// from prerequisites by `displayStates`, exactly as on the web.
public typealias StateMap = [String: NodeState]

public struct ConceptNode: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public var label: String
    /// One sentence on what the concept is; absent on runs built before summaries.
    public var summary: String?
    public var state: NodeState
    /// Topological depth.
    public var g: Int
    public var week: Int
    public var x: Double
    public var y: Double
    public var gap: Bool?

    public init(
        id: String, label: String, summary: String? = nil, state: NodeState = .unknown,
        g: Int = 0, week: Int = 0, x: Double = 0, y: Double = 0, gap: Bool? = nil
    ) {
        self.id = id; self.label = label; self.summary = summary; self.state = state
        self.g = g; self.week = week; self.x = x; self.y = y; self.gap = gap
    }

    /// Written by hand because a generated map omits what it has nothing to say
    /// about — a concept with no sentence, a node that isn't a gap. The
    /// synthesized decoder would fail the whole map over one absent key.
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        label = try c.decode(String.self, forKey: .label)
        summary = try c.decodeIfPresent(String.self, forKey: .summary)
        state = try c.decodeIfPresent(NodeState.self, forKey: .state) ?? .unknown
        g = try c.decodeIfPresent(Int.self, forKey: .g) ?? 0
        week = try c.decodeIfPresent(Int.self, forKey: .week) ?? 0
        x = try c.decodeIfPresent(Double.self, forKey: .x) ?? 0
        y = try c.decodeIfPresent(Double.self, forKey: .y) ?? 0
        gap = try c.decodeIfPresent(Bool.self, forKey: .gap)
    }
}

/// How a generated map travels: a laid-out node carrying its own prerequisites,
/// so every streamed frame is independently meaningful — the three concepts on
/// screen so far are a real graph, not three orphans. Mirrors `MapNode` in
/// `lib/curriculum/types.ts`.
public struct MapNode: Decodable, Sendable {
    public let node: ConceptNode
    public let prereqs: [String]

    public init(from decoder: any Decoder) throws {
        node = try ConceptNode(from: decoder)
        prereqs = try decoder.container(keyedBy: CodingKeys.self)
            .decodeIfPresent([String].self, forKey: .prereqs) ?? []
    }

    private enum CodingKeys: String, CodingKey { case prereqs }
}

/// The graph a streamed (or partial) node list describes. Prereqs pointing
/// outside the list are dropped, which is what lets this run mid-stream.
public func graphFromMapNodes(_ mapNodes: [MapNode]) -> ConceptGraph {
    let ids = Set(mapNodes.map(\.node.id))
    return ConceptGraph(
        nodes: mapNodes.map(\.node),
        edges: mapNodes.flatMap { mapNode in
            mapNode.prereqs
                .filter { ids.contains($0) && $0 != mapNode.node.id }
                .map { ConceptEdge($0, mapNode.node.id) }
        }
    )
}

/// The stored progress a fresh map starts from — whatever each node arrived as.
public func initialStates(_ graph: ConceptGraph) -> StateMap {
    StateMap(uniqueKeysWithValues: graph.nodes.map { ($0.id, $0.state) })
}

/// A sub-concept the re-planner hangs under a node that keeps failing. The
/// placement diagnostic is where the first ones come from.
public struct GapSpec: Decodable, Sendable {
    public let id: String
    public let label: String
    /// Why the model split it out — the truest summary a gap node has.
    public let reason: String
    public let dx: Double
    public let dy: Double
}

/// A red gap node hung under its parent by a dashed edge. Idempotent, and a
/// no-op when the parent isn't on the map. Mirrors `spawnGap` in `replan.ts`.
public func spawnGap(_ graph: ConceptGraph, parentId: String, _ spec: GapSpec) -> ConceptGraph {
    guard let parent = graph.nodes.first(where: { $0.id == parentId }),
          !graph.nodes.contains(where: { $0.id == spec.id }) else { return graph }
    var next = graph
    next.nodes.append(ConceptNode(
        id: spec.id, label: spec.label, summary: spec.reason, state: .gap,
        g: parent.g, week: 4, x: parent.x + spec.dx, y: parent.y + spec.dy, gap: true
    ))
    next.edges.append(ConceptEdge(parentId, spec.id, dashed: true))
    return next
}

/// Direction is prerequisite → dependent. A dashed edge hangs a gap node off
/// its parent and never locks anything.
public struct ConceptEdge: Codable, Sendable, Hashable {
    public let from: String
    public let to: String
    public var dashed: Bool

    public init(_ from: String, _ to: String, dashed: Bool = false) {
        self.from = from; self.to = to; self.dashed = dashed
    }

    /// The wire form is the web's tuple `[from, to, dashed?]`.
    public init(from decoder: any Decoder) throws {
        var c = try decoder.unkeyedContainer()
        from = try c.decode(String.self)
        to = try c.decode(String.self)
        dashed = (try? c.decode(Bool.self)) ?? false
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(from); try c.encode(to); try c.encode(dashed)
    }
}

public struct ConceptGraph: Codable, Sendable {
    public var nodes: [ConceptNode]
    public var edges: [ConceptEdge]

    public init(nodes: [ConceptNode] = [], edges: [ConceptEdge] = []) {
        self.nodes = nodes; self.edges = edges
    }
}

/// What each node *displays* as: stored progress, except an unknown non-gap node
/// whose solid prerequisites are all learned, which shows as the frontier.
/// This is the single derivation — no surface stores `frontier` or a locked flag.
public func displayStates(_ states: StateMap, _ graph: ConceptGraph) -> [String: NodeState] {
    var prereqs: [String: [String]] = [:]
    for edge in graph.edges where !edge.dashed {
        prereqs[edge.to, default: []].append(edge.from)
    }
    var out: [String: NodeState] = [:]
    for node in graph.nodes {
        let state = states[node.id] ?? .unknown
        let unlocked = (prereqs[node.id] ?? []).allSatisfy { (states[$0] ?? .unknown).isLearned }
        out[node.id] = (state == .unknown && node.gap != true && unlocked) ? .frontier : state
    }
    return out
}

/// The spiral, mirroring `PHASES` in `lib/curriculum/types.ts`. Order is the
/// vocabulary — a phase's index is what `phaseIndex` returns.
public enum Phase: String, CaseIterable, Sendable, Identifiable {
    case consume = "Consume", socratic = "Socratic", feynman = "Feynman"
    case connect = "Connect", crucible = "Crucible", retained = "Retained"
    public var id: String { rawValue }
}

public extension Phase {
    /// The phase colour, carried by the CTA's tint and the header kicker and
    /// nothing else. Socratic and Feynman share one — they are the same half of
    /// the spiral, and the design draws them in the same blue.
    var tint: Color {
        switch self {
        case .consume: Palette.accent
        case .socratic, .feynman: NodeState.learning.color
        case .connect: Palette.connectInk
        case .crucible: Palette.crucibleInk
        case .retained: NodeState.mastered.color
        }
    }

    /// The header kicker the design writes above the node's name.
    var kicker: LocalizedStringKey {
        switch self {
        case .consume: "Consume · leitura"
        case .socratic: "Socratic · sessão"
        case .feynman: "Feynman · ensine de volta"
        case .connect: "Connect · elaboração"
        case .crucible: "Crisol · aplicação"
        case .retained: "Retido · revisão"
        }
    }
}

/// Which phase a node is on, `-1` for locked. Mirrors `phaseIndex` in
/// `lib/curriculum/calibration.ts`: mastered alone doesn't grant Retained, a
/// real review does.
/// ponytail: no `readingPhaseIndex` correction — that needs `ConsumeProgress`,
/// which arrives with Consume in phase 5. Add the two guards there.
public func phaseIndex(_ state: NodeState, reviewed: Bool = false) -> Int {
    switch state {
    case .frontier: 0
    case .learning: 2
    case .shaky: 4
    case .mastered: reviewed ? 6 : 5
    default: -1
    }
}

public extension ConceptGraph {
    /// The solid prerequisites of a node, in edge order. Dashed edges hang gap
    /// nodes off a parent and are never prerequisites.
    func prerequisites(of id: String) -> [ConceptNode] {
        edges.filter { $0.to == id && !$0.dashed }
            .compactMap { edge in nodes.first { $0.id == edge.from } }
    }
}
