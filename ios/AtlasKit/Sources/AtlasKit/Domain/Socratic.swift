import Foundation

/// What a Socratic pass *is*, apart from the screen that runs it: how a step
/// closed, what the pass earned, what the learner keeps getting wrong, and the
/// snapshot a half-finished pass is saved as.
///
/// Mirrors `lib/curriculum/socratic.ts` and the misconception half of
/// `lib/curriculum/feynman.ts`. The snapshot's keys are the browser's
/// `SocraticSession` keys exactly — the row is shared, so a pass left on a
/// phone reopens in a browser and back again.

/// How a finished step was resolved — it earns the ending differently.
public enum SocraticResolution: String, Codable, Sendable {
    case unaided, hint, told
}

/// The overall verdict on a finished pass. `flagged` is the one that does not
/// hand off: it means the reading didn't land.
public enum SocraticOutcome: String, Sendable {
    case unaided, assisted, flagged
}

/// The probes a streaming pass *plans* on before its own plan has arrived.
/// A session needs a length before its last step lands, which is the only
/// reason this constant exists; `socraticPlan` is the real, per-concept count.
/// Mirrors `SOCRATIC_STEPS`.
public let socraticStepEstimate = 4

/// Whether a pass earned its ending. A gap pass closes only on a clean
/// `told == 0` — hint-assisted still counts as reconstructed, told outright
/// does not. Mirrors `socraticOutcome`.
public func socraticOutcome(_ resolutions: [SocraticResolution], gap: Bool) -> SocraticOutcome {
    let told = resolutions.count { $0 == .told }
    if gap { return told == 0 ? .unaided : .flagged }
    if told >= 2 { return .flagged }
    return resolutions.allSatisfy { $0 == .unaided } ? .unaided : .assisted
}

// MARK: - Misconception memory (across nodes, across sessions)
//
// A pass is thrown away when it ends, so every wrong turn the tutor caught used
// to die with the session that caught it. This is the part worth keeping: what
// this learner gets wrong *everywhere*, so the tutor can name the pattern
// instead of meeting the same confusion cold every time.

/// One wrong idea this learner has hit, rolled up run-wide.
public struct MisconceptionRecord: Codable, Sendable, Equatable {
    /// The wrong idea itself, short enough to say back to them.
    public var label: String
    /// The concept it was last caught under.
    public var node: String
    public var count: Int

    public init(label: String, node: String, count: Int) {
        self.label = label; self.node = node; self.count = count
    }
}

/// The roll-up stays bounded — the tutor only ever reads the top few.
private let misconceptionCap = 24

/// File a caught misconception, merging it into one this learner has hit before
/// (case-insensitively) so a repeat becomes a count, not a second entry.
public func recordMisconception(
    _ list: [MisconceptionRecord], _ label: String, node: String
) -> [MisconceptionRecord] {
    let text = String(label.trimmed.prefix(120))
    guard !text.isEmpty else { return list }
    var next = list
    if let at = next.firstIndex(where: { $0.label.lowercased() == text.lowercased() }) {
        next[at].node = node
        next[at].count += 1
    } else {
        next.append(MisconceptionRecord(label: text, node: node, count: 1))
    }
    return next.count > misconceptionCap ? Array(next.suffix(misconceptionCap)) : next
}

/// What the judge is told about this learner: the confusions they keep coming
/// back to, worst first. Seen once is noise — it earns its name on the repeat,
/// which is exactly when "you keep confusing X and Y" is a true thing to say.
///
/// Not copy: this is prompt text, and it is the same English the browser sends
/// so one judge prompt reads one shape.
public func recurringMisconceptions(
    _ list: [MisconceptionRecord], limit: Int = 3
) -> [String] {
    list.filter { $0.count >= 2 }
        .sorted { $0.count > $1.count }
        .prefix(limit)
        .map { "\"\($0.label)\" — hit \($0.count)× (last under \($0.node))" }
}

// MARK: - The saved pass

/// A pass in progress, in the browser's own shape. Held as a value so the
/// screen can hand one to the store and the store can hand one back without
/// either knowing how the other draws it.
public struct SocraticSnapshot: Codable, Sendable {
    /// One line of the transcript. `move` marks a probe; `tone` colours a
    /// verdict — the browser's vocabulary for both.
    public struct Turn: Codable, Sendable {
        public var role: String
        public var text: String
        public var move: String?
        public var tone: String?

        public init(role: String, text: String, move: String? = nil, tone: String? = nil) {
            self.role = role; self.text = text; self.move = move; self.tone = tone
        }
    }

    public var nodeId: String
    public var step: Int
    public var help: Int
    public var log: [Turn]
    /// Never written here — the phone judges free text and rules nothing out —
    /// but carried so a browser's ruled-out replies survive a phone's save.
    public var ruledOut: [String]
    public var tells: Int
    public var resolutions: [SocraticResolution]
    public var stepAssisted: Bool
    public var total: Int
    public var awaitingNext: Bool
    public var done: Bool

    public init(
        nodeId: String, step: Int, help: Int, log: [Turn], ruledOut: [String] = [],
        tells: Int, resolutions: [SocraticResolution], stepAssisted: Bool,
        total: Int, awaitingNext: Bool, done: Bool
    ) {
        self.nodeId = nodeId
        self.step = step
        self.help = help
        self.log = log
        self.ruledOut = ruledOut
        self.tells = tells
        self.resolutions = resolutions
        self.stepAssisted = stepAssisted
        self.total = total
        self.awaitingNext = awaitingNext
        self.done = done
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nodeId = (try? c.decode(String.self, forKey: .nodeId)) ?? ""
        step = (try? c.decode(Int.self, forKey: .step)) ?? 0
        help = (try? c.decode(Int.self, forKey: .help)) ?? 1
        log = (try? c.decode([Turn].self, forKey: .log)) ?? []
        ruledOut = (try? c.decode([String].self, forKey: .ruledOut)) ?? []
        tells = (try? c.decode(Int.self, forKey: .tells)) ?? 0
        resolutions = (try? c.decode([SocraticResolution].self, forKey: .resolutions)) ?? []
        stepAssisted = (try? c.decode(Bool.self, forKey: .stepAssisted)) ?? false
        total = (try? c.decode(Int.self, forKey: .total)) ?? 0
        awaitingNext = (try? c.decode(Bool.self, forKey: .awaitingNext)) ?? false
        done = (try? c.decode(Bool.self, forKey: .done)) ?? false
    }
}
