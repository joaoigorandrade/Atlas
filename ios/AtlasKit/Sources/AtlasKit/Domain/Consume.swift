import Foundation

/// Where the learner got to in a node's reading pass — the port of
/// `ConsumeProgress` in `lib/curriculum/consume.ts`.
///
/// The reading is the longest surface in the app, and until this existed
/// leaving it cost the whole pass: arriving marked the node Learning, which
/// `phaseIndex` reads as *Feynman owed*, so backing out of the first section
/// ticked Consume **and** Socratic off a node nobody had read, and reopening it
/// landed three phases ahead of the prose.
///
/// **The web app owns the format**, exactly as it owns `RunSnapshot`: it also
/// stores the lens last opened over each section, the sections collapsed to
/// their takeaway and the terms this learner expanded, none of which this
/// client has a surface for. So the decode is partial and the encode is a
/// merge — see `extras`.
public struct ConsumeProgress: Codable, Sendable, Equatable {
    /// One section's answered check: the option that was tapped, and whether it
    /// was the right one. Persisted with the rest rather than held for the
    /// session — a check already passed has to stay passed, or coming back
    /// re-gates a section the learner demonstrably read.
    public struct Check: Codable, Sendable, Equatable {
        public var oi: Int
        public var correct: Bool
        public init(oi: Int, correct: Bool) {
            self.oi = oi
            self.correct = correct
        }
    }

    /// Deepest section reached so far.
    public var idx = 0
    /// The end-of-section comprehension checks, keyed by chunk id.
    public var checks: [String: Check] = [:]
    /// Sections in the pass as last seen. With `idx`, the honest "3 de 5" — a
    /// pass still streaming when the learner left has a smaller total than the
    /// finished one, so it is stored rather than assumed.
    public var total = 0
    /// The last section was reached at least once.
    public var finished = false
    /// Socratic was actually opened on this node. A finished reading the
    /// learner walked away from is still only a finished *reading* — see
    /// `readingPhaseIndex`.
    public var handedOff = false

    /// Every other key of the browser's record, untouched. Same reason as
    /// `RunSnapshot`'s own extras: this client has no collapsed section, no
    /// term pill and no per-section lens record, and dropping those would throw
    /// a week of browser work away the first time the run is opened on a phone.
    private var extras: [String: JSONValue] = [:]

    public init() {}
}

// MARK: - The wire form

public extension ConsumeProgress {
    /// The keys this client renders. Everything else in the record is `extras`.
    private static let owned = ["idx", "checks", "total", "finished", "handedOff"]

    init(from decoder: any Decoder) throws {
        self.init()
        let row = try JSONValue(from: decoder).fields ?? [:]
        if case .number(let value)? = row["idx"] { idx = Int(value) }
        if case .number(let value)? = row["total"] { total = Int(value) }
        if case .bool(let value)? = row["finished"] { finished = value }
        if case .bool(let value)? = row["handedOff"] { handedOff = value }
        if let raw = row["checks"], let decoded = try? raw.decode([String: Check].self) {
            checks = decoded
        }
        extras = row
        for key in Self.owned { extras[key] = nil }
    }

    func encode(to encoder: any Encoder) throws {
        var row = extras
        row["idx"] = .number(Double(idx))
        row["total"] = .number(Double(total))
        row["finished"] = .bool(finished)
        row["handedOff"] = .bool(handedOff)
        row["checks"] = (try? JSONValue(encoding: checks)) ?? .object([:])
        // The web's `ConsumeView` indexes all three without a guard of its own,
        // so a record this client wrote first has to carry them.
        row["variant"] = row["variant"] ?? .object([:])
        row["collapsed"] = row["collapsed"] ?? .object([:])
        row["termsSeen"] = row["termsSeen"] ?? .array([])
        try JSONValue.object(row).encode(to: encoder)
    }
}

// MARK: - What the map reads off it

public extension ConsumeProgress {
    /// Sections read out of sections there are — never claiming past what
    /// exists, and never short-changing a finished pass whose `total` arrived
    /// late. Mirrors `readingProgress` in `lib/curriculum/consume.ts`.
    var reading: (read: Int, total: Int) {
        let total = Swift.max(self.total, idx + 1)
        return (finished ? total : Swift.min(idx + 1, total), total)
    }

    /// A real pass, left part-way through. What earns a "3 de 5" on the map and
    /// what turns the node's CTA into a resume rather than a start.
    var unfinished: Bool { !finished && total > 0 }
}
