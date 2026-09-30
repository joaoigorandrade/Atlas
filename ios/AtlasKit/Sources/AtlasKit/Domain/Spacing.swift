import Foundation

// The proofs that only count after a night — the port of `spacing.ts`.
//
// Everything else on a ladder can run back to back. Three things cannot,
// because what they measure is what survives time: Recall (retrieval without a
// cue, so it opens a night after the node's last exposure and a failed attempt
// re-holds it), a Crucible passed on the guided rung (the cold problem is the
// next day's), and Retido ✓ (a card graded Good the afternoon it was drafted
// says nothing about weeks). The holds live in the phase's own
// `phase_progress` slot as `{ opensAt }`, which both clients carry whole.

/// "Tomorrow", as a duration: long enough to sleep on, short enough that a
/// learner who studies at the same hour each day is not locked out by minutes.
public let spacingSeconds: TimeInterval = 20 * 60 * 60

/// Does closing `phase` push Recall a night out? Anything studied on a node
/// that still owes Recall does.
public func holdsRecall(_ plan: [Phase], _ done: [Phase], _ phase: Phase) -> Bool {
    phase != .recall && plan.contains(.recall) && !done.contains(.recall)
}

/// The shortest interval a review must have survived to earn Retido ✓.
public let retainedMinDays: Double = 7

/// Does this grade earn the node Retido ✓? Only a Good/Easy on a card that went
/// `retainedMinDays` unseen — since its last review, or since it was drafted.
public func earnsRetained(_ grade: ReviewGrade, lastSeen: Date?, now: Date = .now) -> Bool {
    guard grade == .good || grade == .easy, let lastSeen else { return false }
    return now.timeIntervalSince(lastSeen) >= retainedMinDays * 86_400
}
