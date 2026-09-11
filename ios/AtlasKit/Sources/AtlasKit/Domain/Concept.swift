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

    /// `shakyLine` on the web, minus the language switch — the app is drawn in
    /// one language at a time and `Localizable.xcstrings` is where that lives.
    public var line: LocalizedStringKey {
        switch self {
        case .connectComplete: "Compreendido e conectado — agora prove que isso se transfere no Crisol."
        case .diagnosticHesitation: "Você hesitou nisso no nivelamento — provavelmente é frágil. Uma tentativa no Crisol mostra se resiste."
        case .crucibleFail: "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente o Crisol de novo."
        case .reviewMiss: "Um cartão de revisão disso escorregou — a retenção está amolecendo. Tente o Crisol de novo para firmar."
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

/// The spiral, mirroring `PHASES` in `lib/curriculum/types.ts`. Order is the
/// vocabulary — a phase's index is what `phaseIndex` returns.
public enum Phase: String, CaseIterable, Sendable, Identifiable {
    case consume = "Consume", socratic = "Socratic", feynman = "Feynman"
    case connect = "Connect", crucible = "Crucible", retained = "Retained"
    public var id: String { rawValue }
}

public extension Phase {
    /// The generated kind this phase renders — what has to be ready before it
    /// opens. Retido reads review cards, which are drafted per node rather
    /// than per phase, so it names none.
    var kind: String? { self == .retained ? nil : rawValue.lowercased() }

    /// The next phase of the spiral, or nil at the end of it. Retido is not a
    /// phase a pass walks into — a review is its own screen — so the Crisol is
    /// where the spiral stops, exactly as `advance()` reads it.
    var next: Phase? {
        guard let index = Phase.allCases.firstIndex(of: self), index + 1 < Phase.allCases.count - 1 else { return nil }
        return Phase.allCases[index + 1]
    }

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

    /// The gentle push back when a learner taps a phase ahead of the one they
    /// are owed. Mirrors `PHASE_SKIP_NUDGE_PT` in `lib/curriculum/types.ts` —
    /// it names the phase they'd be skipping, not the one they tapped.
    var skipNudge: LocalizedStringKey {
        switch self {
        case .consume: "Você ainda não leu isso — quer ler?"
        case .socratic: "Você ainda não raciocinou sobre isso — quer tentar?"
        case .feynman: "Você ainda não ensinou isso de volta — quer tentar?"
        case .connect: "Você ainda não ligou isso ao seu mapa — quer tentar?"
        case .crucible: "Você ainda não aplicou isso em um contexto novo — quer tentar?"
        case .retained: "Isso ainda não está na sua rotação de revisão — quer adicionar?"
        }
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

/// `phaseIndex`, corrected by what the learner actually read. Mirrors
/// `readingPhaseIndex` in `lib/curriculum/calibration.ts`.
///
/// A node goes Learning the moment a session opens on it, and that is real —
/// but the state alone maps to Feynman, which would tick off Consume *and*
/// Socratic on the strength of having opened a screen. So the reading record
/// gets the last word where it has one: still reading → Consume, read it and
/// never went on → Socratic, anything else → the state-derived answer.
public func readingPhaseIndex(
    _ state: NodeState, reviewed: Bool = false, _ progress: ReadingProgress?
) -> Int {
    if state == .learning, let progress {
        if !progress.finished { return 0 }
        if !progress.handedOff { return 1 }
    }
    return phaseIndex(state, reviewed: reviewed)
}

/// Which phase a node is on, `-1` for locked. Mirrors `phaseIndex` in
/// `lib/curriculum/calibration.ts`: mastered alone doesn't grant Retained, a
/// real review does. Every caller goes through `readingPhaseIndex` — this is
/// the state half of the answer, not the whole one.
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
