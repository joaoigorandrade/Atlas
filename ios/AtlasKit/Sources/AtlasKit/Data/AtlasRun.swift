import Foundation

/// One topic, as `/api/v1` sends it.
///
/// **The server owns this shape now.** It used to be the other way round: the
/// browser owned a `run_states` snapshot, this client decoded the part it had
/// screens for, and every key it did not understand had to be carried back
/// untouched on write or a week of work done in a browser vanished the first
/// time the map was opened on a phone. That merge is gone, and so is the
/// version ladder behind it — a run is rows on the server, and this is the
/// drawing of them.
///
/// What that buys, beyond the deleted code: a write is now a *delta*. Nothing
/// here is ever uploaded whole, so a node drag is one node's coordinates and a
/// graded card is one row.
public struct AtlasRun: Codable, Sendable, Identifiable {
    public let id: String
    public var subject: String
    public var goal: GoalKind
    public var interests: String
    public var paretoPct: Int
    public var examDate: String
    /// The language the *content* is written in, which is a property of the run
    /// and not of the device reading it. Nil on a topic that predates the field:
    /// guessing from the interface language would freeze the wrong answer.
    public var language: String?
    public var calibSamples: [CalibSample]
    public var litToday: [String]
    public var updatedAt: String
    public var graph: ConceptGraph
    public var states: StateMap
    public var positions: [String: Point]
    public var shakyReasons: [String: ShakyReason]
    public var reviewedNodes: [String]
    /// The browser's reading records, keyed by node id — held as JSON because
    /// this client reads two of each and writes four, and the rest (lenses,
    /// collapses, checks) belongs to a reader only the browser has.
    public var consumeProgress: [String: JSONValue]
    /// The Socratic passes in progress, keyed by node id — the same JSON for
    /// the same reason, and the row both clients resume a conversation from.
    public var socraticProgress: [String: JSONValue]
    /// The teach-backs in progress, keyed by node id — the pass a learner may
    /// have left mid-explanation or sitting on its Gap Report.
    public var feynmanProgress: [String: JSONValue]
    /// The elaboration passes in progress, keyed by node id — the links a
    /// learner wrote in their own words and may not have finished confirming.
    public var connectProgress: [String: JSONValue]
    /// What the learner keeps getting wrong, run-wide. A topic field, not a
    /// node one: the whole point of it is that it crosses concepts.
    public var misconceptions: [MisconceptionRecord]
    public var cards: [StoredCard]

    public struct Point: Codable, Sendable {
        public let x: Double
        public let y: Double
    }

    /// Share of the map learned at least once — the dashboard card's figure.
    public var mastered: Double {
        guard !graph.nodes.isEmpty else { return 0 }
        let count = graph.nodes.filter { (states[$0.id] ?? .unknown) == .mastered }.count
        return Double(count) / Double(graph.nodes.count)
    }

    /// `displayStates` is the one derivation of the frontier, here too.
    public var frontierCount: Int {
        displayStates(states, graph).values.filter { $0 == .frontier }.count
    }

    private enum CodingKeys: String, CodingKey {
        case id, subject, goal, interests, paretoPct, examDate, language
        case calibSamples, litToday, updatedAt, graph, states, positions
        case shakyReasons, reviewedNodes, consumeProgress, socraticProgress
        case feynmanProgress, connectProgress, misconceptions, cards
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        subject = try c.decode(String.self, forKey: .subject)
        goal = (try? c.decode(GoalKind.self, forKey: .goal)) ?? .exam
        interests = (try? c.decode(String.self, forKey: .interests)) ?? ""
        paretoPct = (try? c.decode(Int.self, forKey: .paretoPct)) ?? paretoLevels[0]
        examDate = (try? c.decode(String.self, forKey: .examDate)) ?? ""
        language = try? c.decode(String.self, forKey: .language)
        calibSamples = (try? c.decode([CalibSample].self, forKey: .calibSamples)) ?? []
        litToday = (try? c.decode([String].self, forKey: .litToday)) ?? []
        updatedAt = (try? c.decode(String.self, forKey: .updatedAt)) ?? ""
        var graph = (try? c.decode(ConceptGraph.self, forKey: .graph)) ?? ConceptGraph()
        states = (try? c.decode(StateMap.self, forKey: .states)) ?? [:]
        positions = (try? c.decode([String: Point].self, forKey: .positions)) ?? [:]
        shakyReasons = (try? c.decode([String: ShakyReason].self, forKey: .shakyReasons)) ?? [:]
        reviewedNodes = (try? c.decode([String].self, forKey: .reviewedNodes)) ?? []
        consumeProgress = (try? c.decode([String: JSONValue].self, forKey: .consumeProgress)) ?? [:]
        socraticProgress = (try? c.decode([String: JSONValue].self, forKey: .socraticProgress)) ?? [:]
        feynmanProgress = (try? c.decode([String: JSONValue].self, forKey: .feynmanProgress)) ?? [:]
        connectProgress = (try? c.decode([String: JSONValue].self, forKey: .connectProgress)) ?? [:]
        misconceptions = (try? c.decode([MisconceptionRecord].self, forKey: .misconceptions)) ?? []
        cards = (try? c.decode([StoredCard].self, forKey: .cards)) ?? []
        // Positions are their own map because the browser draws from it and
        // never from a node's generated coordinates. Folding it onto the nodes
        // here is what makes the two clients draw the same map, and leaves this
        // side with one source of position rather than two that can disagree.
        for index in graph.nodes.indices {
            guard let at = positions[graph.nodes[index].id] else { continue }
            graph.nodes[index].x = at.x
            graph.nodes[index].y = at.y
        }
        self.graph = graph
    }
}

/// The learner, not the run: the streak, the daily target, the reminders.
///
/// It used to be copied into every topic's snapshot — so two maps disagreed
/// about how many days in a row someone had shown up — and kept a third time in
/// this device's `UserDefaults`, which agreed with neither.
public struct AtlasProfile: Codable, Sendable {
    public var dailyTarget: Int
    public var language: String?
    public var adherence: Adherence

    public struct Adherence: Codable, Sendable {
        public var streak: Int
        public var best: Int
        public var freezes: Int
        public var lastDay: String
        public var metToday: Bool
        public var usualTime: String
        public var reminderOn: Bool
    }
}

/// One review card with its scheduler state.
///
/// `fsrs` is opaque here on purpose. This client used to schedule with a
/// hand-rolled SM-2 while the browser used FSRS, so the same card had two
/// different due dates depending on which screen you graded it from. The
/// scheduler now runs in exactly one place — `lib/fsrs.ts`, which the browser
/// calls locally and this client reaches through `/api/v1/…/review` — and this
/// carries its state without interpreting it.
public struct StoredCard: Codable, Sendable, Identifiable {
    public var id: String
    public var nodeId: String
    public var type: ReviewCardType
    public var source: String
    public var cloze: [String]?
    public var answer: String?
    public var front: String?
    public var back: String
    public var reExplain: String?
    public var fsrs: JSONValue

    public init(
        id: String, nodeId: String, type: ReviewCardType, source: String,
        cloze: [String]? = nil, answer: String? = nil, front: String? = nil,
        back: String, reExplain: String? = nil, fsrs: JSONValue = .object([:])
    ) {
        self.id = id
        self.nodeId = nodeId
        self.type = type
        self.source = source
        self.cloze = cloze
        self.answer = answer
        self.front = front
        self.back = back
        self.reExplain = reExplain
        self.fsrs = fsrs
    }
}

/// One node's changed fields — the unit every map write is made of.
///
/// Only what changed travels. The whole run used to go up on a two-second
/// debounce, which is why the generated content had to be split into a second
/// column on a longer one; neither is needed when a drag is `{id, x, y}`.
public struct NodeDelta: Encodable, Sendable {
    public var id: String
    public var label: String?
    public var summary: String?
    public var g: Int?
    public var week: Int?
    public var x: Double?
    public var y: Double?
    public var isGap: Bool?
    public var state: NodeState?
    /// Sent as `null` to clear it — a node that stopped being shaky.
    public var shakyReason: ShakyReason??
    public var reviewed: Bool?
    public var consumeProgress: JSONValue?
    /// The saved pass. `.null` is how a finished one is cleared — the column
    /// holds a session, and a finished pass must not be resumable.
    public var socraticProgress: JSONValue?
    /// The saved teach-back, cleared the same way once its gaps are on the map.
    public var feynmanProgress: JSONValue?
    /// The saved elaboration, cleared the same way once its cards are drafted.
    public var connectProgress: JSONValue?
    /// Prerequisites to attach. Only meaningful for a node being created.
    public var prereqs: [String]?

    public init(id: String) { self.id = id }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(label, forKey: .label)
        try c.encodeIfPresent(summary, forKey: .summary)
        try c.encodeIfPresent(g, forKey: .g)
        try c.encodeIfPresent(week, forKey: .week)
        try c.encodeIfPresent(x, forKey: .x)
        try c.encodeIfPresent(y, forKey: .y)
        try c.encodeIfPresent(isGap, forKey: .isGap)
        try c.encodeIfPresent(state, forKey: .state)
        // Double optional: absent means "leave it", `.some(nil)` means "clear
        // it". Collapsing the two would make un-shaking a node impossible.
        if let shakyReason { try c.encode(shakyReason, forKey: .shakyReason) }
        try c.encodeIfPresent(reviewed, forKey: .reviewed)
        try c.encodeIfPresent(consumeProgress, forKey: .consumeProgress)
        try c.encodeIfPresent(socraticProgress, forKey: .socraticProgress)
        try c.encodeIfPresent(feynmanProgress, forKey: .feynmanProgress)
        try c.encodeIfPresent(connectProgress, forKey: .connectProgress)
        try c.encodeIfPresent(prereqs, forKey: .prereqs)
    }

    private enum Key: String, CodingKey {
        case id, label, summary, g, week, x, y, isGap, state, shakyReason
        case reviewed, consumeProgress, socraticProgress, feynmanProgress
        case connectProgress, prereqs
    }
}

enum ISODate {
    /// Parse the format `ts-fsrs` writes a due date in — `toISOString()`, which
    /// carries milliseconds. `ISO8601DateFormatter`'s default options reject
    /// those outright, so a card would read as never due; and the formatter
    /// itself is not `Sendable`, so it is built per call rather than shared.
    static func parse(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}
