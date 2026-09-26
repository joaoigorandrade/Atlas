import SwiftUI

/// The app's shared vocabulary, mirroring `lib/curriculum/types.ts`.
/// Never invent a state or a colour for one.
public enum NodeState: String, Codable, Sendable, CaseIterable {
    case unknown, frontier, learning, shaky, mastered, gap

    /// A pair per state, for the same reason `Palette`'s tokens are pairs: the
    /// six hues are chosen to read against cream, and on the dark ground the
    /// mid-tones go muddy. The vocabulary does not change — each state simply
    /// knows its own value in each appearance. `unknown` is the one that goes
    /// *darker*: it means "not lit yet", which at night is receding, not
    /// glowing.
    public var color: Color {
        switch self {
        case .unknown: adaptive(0xB3ADA2, 0x6A655C)
        case .frontier: adaptive(0xC99A2E, 0xE3BC5F)
        case .learning: adaptive(0x5B7FBF, 0x8AA8E0)
        case .shaky: adaptive(0xBD7038, 0xDE9A61)
        case .mastered: adaptive(0x4C8B63, 0x74C08F)
        case .gap: adaptive(0xC1574A, 0xE0887A)
        }
    }

    /// The concept has been worked on at all — what the map ticks and what the
    /// review queue and the Connect pool draw from. It is *not* the unlock rule.
    var isLearned: Bool { self == .learning || self == .shaky || self == .mastered }

    /// A prerequisite is met once its pass is *finished*, not once it is
    /// started: Connect leaves a node shaky, the Crucible mastered, and the
    /// diagnostic writes both. `learning` is a pass in progress — written as
    /// soon as the learner answers the first check in the reading — so counting
    /// it here unlocked every descendant of a concept barely opened.
    /// Mirrors `meetsPrereq` in `replan.ts`.
    var meetsPrereq: Bool { self == .shaky || self == .mastered }

    /// What the state is called, wherever one is named to a learner — the
    /// drawer's heading and the trail's caption are the same sentence, and two
    /// hand-written switches are how they drift a word apart.
    public var headline: LocalizedStringKey {
        switch self {
        case .frontier: "Fronteira · pronto"
        case .learning: "Aprendendo"
        case .shaky: "Instável"
        case .mastered: "Dominado"
        case .gap: "Lacuna"
        // `STATE_LABEL_PT` names the state; the drawer's CTA already says
        // "Bloqueado", which is the *consequence* of it.
        case .unknown: "Desconhecido"
        }
    }
}

/// What is actually stored per node. `frontier` is never stored — it is derived
/// from prerequisites by `displayStates`, exactly as on the web.
public typealias StateMap = [String: NodeState]

/// How a node became Shaky. Stored per node so the drawer can say *why* rather
/// than assuming the last thing that could have caused it. Mirrors
/// `ShakyReason` in `lib/curriculum/types.ts`; the raw values are the row's.
public enum ShakyReason: String, Codable, Sendable {
    case connectComplete = "connect-complete"
    case diagnosticHesitation = "diagnostic-hesitation"
    case crucibleFail = "crucible-fail"
    case reviewMiss = "review-miss"
    /// A Socratic pass that had to be told through. Web has written it since
    /// the ladder shipped, and a topic's reasons decode as one map — without
    /// this case one such node dropped every reason on the topic.
    case socraticTold = "socratic-told"

    /// `shakyLine` on the web, minus the language switch — the app is drawn in
    /// one language at a time and `Localizable.xcstrings` is where that lives.
    ///
    /// `gate` is the phase a "go prove it" line points at: the node's own last
    /// gate. That is the Crucible on every plan that has one, and Connect on a
    /// plan that stops there — these four sentences named the Crisol
    /// unconditionally, which promised a phase a `fact` never runs.
    public func line(gate: Phase) -> LocalizedStringKey {
        let gate = gate.label
        switch self {
        case .connectComplete: return "Compreendido e conectado — agora prove que isso se transfere em \(gate)."
        case .diagnosticHesitation: return "Você hesitou nisso no nivelamento — provavelmente é frágil. Uma tentativa em \(gate) mostra se resiste."
        case .crucibleFail: return "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente \(gate) de novo."
        case .reviewMiss: return "Um cartão de revisão disso escorregou — a retenção está amolecendo. Tente \(gate) de novo para firmar."
        case .socraticTold: return "Você chegou lá, mas a sondagem teve que te entregar quase tudo. Vale uma releitura antes de \(gate)."
        }
    }
}

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
    /// What kind of thing this concept is — which decides how it is practised.
    /// Written by the map generation; absent on a run built before kinds
    /// existed, and everything treats a missing kind as `concept`, which is
    /// exactly what every node was then.
    public var kind: NodeKind?
    /// What settles a claim about this concept — the second axis, orthogonal
    /// to `kind`. Absent on a run built before domains existed, and everything
    /// treats a missing domain as `general`, which is exactly how every node
    /// behaved then.
    public var domain: Domain?
    /// How much the goal rests on it and how hard it is — the two cost axes the
    /// map draws. Absent on a run built before them; read as `core` / `medium`.
    public var importance: NodeImportance?
    public var difficulty: NodeDifficulty?
    /// The phases this node runs, resolved from `kind` at map-build time and
    /// frozen on the row. Stored rather than recomputed so shipping a new
    /// catalogue can't rewrite a run already in progress.
    ///
    /// Which of them the learner has *finished* is not here: that is progress,
    /// and it lives in the parallel `PhasesDoneMap` beside `shakyReasons` and
    /// `reviewedNodes`, so completing a phase doesn't rewrite the graph.
    public var phasePlan: [Phase]?

    public init(
        id: String, label: String, summary: String? = nil, state: NodeState = .unknown,
        g: Int = 0, week: Int = 0, x: Double = 0, y: Double = 0, gap: Bool? = nil,
        kind: NodeKind? = nil, domain: Domain? = nil, phasePlan: [Phase]? = nil
    ) {
        self.id = id; self.label = label; self.summary = summary; self.state = state
        self.g = g; self.week = week; self.x = x; self.y = y; self.gap = gap
        self.kind = kind; self.domain = domain; self.phasePlan = phasePlan
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
        // Both are lenient on purpose: a kind this build does not know reads as
        // `concept`, and a plan naming a phase it has no screen for is dropped
        // rather than decoded into a rail with a rung nothing can open. A
        // client one release behind draws a shorter ladder; it does not refuse
        // the map.
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)).map { asNodeKind($0) }
        domain = (try? c.decodeIfPresent(String.self, forKey: .domain)).map { asDomain($0) }
        importance = (try? c.decodeIfPresent(String.self, forKey: .importance))
            .flatMap { NodeImportance(rawValue: $0) }
        difficulty = (try? c.decodeIfPresent(String.self, forKey: .difficulty))
            .flatMap { NodeDifficulty(rawValue: $0) }
        phasePlan = (try? c.decodeIfPresent([String].self, forKey: .phasePlan))?
            .compactMap(Phase.init(rawValue:))
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

public struct ConceptGraph: Codable, Sendable, Equatable {
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
        let unlocked = (prereqs[node.id] ?? []).allSatisfy { (states[$0] ?? .unknown).meetsPrereq }
        out[node.id] = (state == .unknown && node.gap != true && unlocked) ? .frontier : state
    }
    return out
}

/// Frontier nodes ordered to the goal — the plan itself, mirroring
/// `orderedFrontier` in `replan.ts`. A deadline-driven goal attacks whatever
/// unlocks the most territory it has not learned; general mastery walks the map
/// left to right, foundations first.
public func orderedFrontier(
    _ display: [String: NodeState], _ graph: ConceptGraph, _ goal: GoalKind
) -> [ConceptNode] {
    let lit = graph.nodes.filter { display[$0.id] == .frontier }
    guard goal != .mastery else { return lit.sorted { $0.x < $1.x } }

    // Solid edges only, exactly as `descendantsOf` reads them: a dashed edge
    // hangs a gap off its parent and unlocks nothing.
    var forward: [String: [String]] = [:]
    for edge in graph.edges where !edge.dashed { forward[edge.from, default: []].append(edge.to) }
    func unlocks(_ id: String) -> Int {
        var seen: Set<String> = []
        var stack = [id]
        while let current = stack.popLast() {
            for next in forward[current] ?? [] where seen.insert(next).inserted { stack.append(next) }
        }
        return seen.filter { display[$0] == .unknown || display[$0] == .frontier }.count
    }

    let leverage: [String: Int] = lit.reduce(into: [:]) { $0[$1.id] = unlocks($1.id) }
    return lit.sorted { a, b in
        let (left, right) = (leverage[a.id] ?? 0, leverage[b.id] ?? 0)
        return left == right ? a.x < b.x : left > right
    }
}

/// Where one concept's teaching ends and its neighbours' begins — the port of
/// `conceptBoundary` in `replan.ts`.
///
/// A per-node generation that sees only its own label and its *direct* prereqs
/// has no way to know that a concept two columns back already taught what it is
/// re-deriving, or that the next node owns the extension it just wandered into:
/// the learner reads the same material twice and meets the next concept already
/// spoiled. `prior` is every ancestor over solid edges — what has already been
/// taught and may be built on. `later` is every other concept on the map — what
/// belongs to somebody else's pass.
///
/// Gap nodes are in neither: they are spawned per learner, and a per-learner
/// list in the prompt would fork the shared `content_cache` row that two
/// learners on the same topic otherwise hash to.
public extension ConceptGraph {
    func boundary(of id: String) -> (prior: [String], later: [String]) {
        var ancestors: Set<String> = []
        var queue = [id]
        while let current = queue.first {
            queue.removeFirst()
            for edge in edges where !edge.dashed && edge.to == current && edge.from != id {
                if ancestors.insert(edge.from).inserted { queue.append(edge.from) }
            }
        }
        var prior: [String] = [], later: [String] = []
        for node in nodes where node.gap != true && node.id != id {
            if ancestors.contains(node.id) { prior.append(node.label) } else { later.append(node.label) }
        }
        return (prior, later)
    }
}

/// The fields of the web's `ConsumeProgress` this client reads. The rest of the
/// record belongs to the browser's reader and rides through untouched — see
/// `AtlasStore.consumeProgress`.
///
/// The reading pass is the longest surface in Atlas, so where the learner got
/// to has to outlive the screen: `idx` and `checks` are what let a phone call,
/// a pop back to the map or a section read in the browser resume rather than
/// start over.
public struct ReadingProgress: Sendable {
    public var idx: Int
    /// The most sections this pass has ever had. A high-water mark, because a
    /// stream that is still writing reports fewer than it will end with, and a
    /// rail that shrinks on a re-entry is a lie about progress.
    public var total: Int
    /// Chunk ids whose check is already passed. A section answered once is not
    /// re-gated.
    public var checks: Set<String>
    public var finished: Bool
    public var handedOff: Bool

    public init(idx: Int = 0, total: Int = 0, checks: Set<String> = [],
                finished: Bool, handedOff: Bool) {
        self.idx = idx
        self.total = total
        self.checks = checks
        self.finished = finished
        self.handedOff = handedOff
    }
}

public extension ConceptGraph {
    /// Nodes by id. Every lookup below goes through it rather than scanning.
    var byId: [String: ConceptNode] {
        Dictionary(nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// The solid prerequisites of a node, in edge order. Dashed edges hang gap
    /// nodes off a parent and are never prerequisites.
    ///
    /// The index is built once rather than scanning `nodes` per edge: a session
    /// asks for this on every context it builds, over a map that can be
    /// hundreds of concepts long.
    func prerequisites(of id: String) -> [ConceptNode] {
        let wanted = edges.compactMap { $0.to == id && !$0.dashed ? $0.from : nil }
        guard !wanted.isEmpty else { return [] }
        // Bound to a `let` on purpose: `byId` is computed, so reading it inside
        // the closure built the whole index once per prerequisite.
        let index = byId
        return wanted.compactMap { index[$0] }
    }
}
