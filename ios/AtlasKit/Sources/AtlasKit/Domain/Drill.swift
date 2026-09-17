import Foundation

// ---- Phase · Drill (speed and automaticity) --------------------------------
// The same small call, made over and over until it stops being derived and
// starts being known. The only phase that measures *how long* an answer took,
// which is the whole reason it exists: a learner who reaches the right answer by
// re-deriving it every time has not automated anything, and no other rung can
// see the difference.
//
// Run by a `fact` and a `procedure`, the two kinds that fail this way. A
// `principle` is meant to be reasoned through, so timing it would reward the
// wrong thing. Mirrors `lib/curriculum/drill.ts`.

/// What "without stopping to derive it" means, in seconds per call. Reported
/// against, never gated on — see `passed`.
public let drillTarget: TimeInterval = 8

/// The longest gap between two clock ticks that is still the clock running.
/// Anything longer is a process that was suspended, not a learner who was
/// thinking — see `DrillSession.idled`. Generous next to the 100 ms tick, so a
/// busy main thread is never mistaken for a backgrounded app.
public let idleBeat: TimeInterval = 1

/// One rep. No context, no setup: a drill item is its prompt and nothing else.
public struct DrillRep: Decodable, Sendable, Identifiable {
    public let id: String
    public let prompt: String
    /// Short answers. The wrong ones are the slips made at speed — the
    /// off-by-one, the swapped pair, the inverted ratio.
    public let answers: [String]
    public let answerIndex: Int
    /// The one-line rule that produces the answer directly, so next time it
    /// fires instead of being worked out.
    public let rule: String
}

public struct DrillContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    public let reps: [DrillRep]
}

public struct DrillSession: Sendable {
    public let nodeId: String
    public var index = 0
    /// Committed answer per rep id.
    public var hits: [String: Int] = [:]
    /// Seconds spent on each rep — the signal.
    public var took: [String: TimeInterval] = [:]
    /// When the open rep was put on screen.
    public var openedAt: Date

    public var done = false

    public init(nodeId: String, now: Date = .now) {
        self.nodeId = nodeId
        openedAt = now
    }

    public mutating func answer(_ choice: Int, _ content: DrillContent, now: Date = .now) {
        guard let rep = content.reps[safe: index], hits[rep.id] == nil else { return }
        hits[rep.id] = choice
        took[rep.id] = max(0, now.timeIntervalSince(openedAt))
    }

    public mutating func next(_ content: DrillContent, now: Date = .now) {
        guard let rep = content.reps[safe: index], hits[rep.id] != nil else { return }
        index += 1
        openedAt = now
        done = index >= content.reps.count
    }

    /// Discount an interval the learner was not actually looking at the rep.
    ///
    /// Time the process spent suspended is not time spent deriving the answer —
    /// the same reason the clock does not start until the rep is on screen. The
    /// start is shifted rather than the clock paused, so `took` and the seconds
    /// on screen stay one number and every reader of `openedAt` keeps working.
    /// Without it a single interruption reads as a rep answered slowly, which
    /// is the one finding Drill exists to produce.
    public mutating func idled(_ interval: TimeInterval) {
        guard interval > 0 else { return }
        openedAt = openedAt.addingTimeInterval(interval)
    }

    public func score(_ content: DrillContent) -> Int {
        content.reps.filter { hits[$0.id] == $0.answerIndex }.count
    }

    /// Median seconds per rep. Median rather than mean because one interrupted
    /// rep — a phone call, a notification — should not describe the run.
    public func median(_ content: DrillContent) -> TimeInterval {
        let times = content.reps.compactMap { took[$0.id] }.sorted()
        guard !times.isEmpty else { return 0 }
        let mid = times.count / 2
        return times.count.isMultiple(of: 2) ? (times[mid - 1] + times[mid]) / 2 : times[mid]
    }

    /// Reps answered correctly but slowly — right, and still being worked out.
    /// This is the finding Drill alone can produce.
    public func labored(_ content: DrillContent) -> [DrillRep] {
        content.reps.filter { hits[$0.id] == $0.answerIndex && (took[$0.id] ?? 0) > drillTarget }
    }

    /// Is the run automatic, as opposed to merely correct? Reported on the
    /// closing panel; deliberately not the gate.
    public func automatic(_ content: DrillContent) -> Bool {
        let median = median(content)
        return median > 0 && median <= drillTarget
    }

    /// Drill's gate: correctness, at the same two-thirds bar as its siblings.
    ///
    /// ponytail: speed is measured, surfaced, and named in the closing copy — a
    /// phase that extracted no new signal would be a setting rather than a phase
    /// — but it does not gate. A clock on the gate fails a learner who is right
    /// and careful, and that is a dead end rather than a standard. Move the gate
    /// onto `automatic` only with evidence that slow-and-right is the failure
    /// worth blocking on; `labored` is the reading that would show it.
    public func passed(_ content: DrillContent) -> Bool {
        guard !content.reps.isEmpty else { return done }
        return score(content) >= Int((Double(content.reps.count) * 2 / 3).rounded(.up))
    }
}
