import Foundation

// ---- Phase · Perform (execution under real conditions) ---------------------
// One real case, carried out end to end, with the work shown. Not "explain the
// procedure" (Feynman) and not "recite its steps" (which is the rehearsal a
// procedure most easily fakes) — the learner runs it, and what is graded is what
// each step actually produced on this case.
//
// Only a `procedure` runs this. A fact is had, a concept is told apart, a
// principle is a mechanism you forecast and walk.
// Mirrors `lib/curriculum/perform.ts`.

/// One thing a correct run on *this* case has to show. Not "understands step
/// two" — what step two produces here.
public struct PerformStep: Decodable, Sendable, Identifiable {
    public let id: String
    /// The step's label in the run report.
    public let step: String
    /// What the learner's work has to show for this step to count as run.
    public let mustShow: [String]
    /// True when getting this step wrong invalidates everything after it. The
    /// gate leans on this: a run can omit a check and still be a run.
    public let loadBearing: Bool
}

public struct PerformContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// The concrete case, with its real values — the whole brief.
    public let task: String
    /// The nudge offered only if they stall, never a step of the answer.
    public let scaffold: String
    public let steps: [PerformStep]
}

public struct PerformSession: Sendable {
    public let nodeId: String
    /// The work, as they showed it.
    public var work = ""
    /// True once they have taken the nudge.
    public var nudged = false
    /// The checker's read on the whole run.
    public var response = ""
    public var pending = false
    /// Verdict per step id — empty until the run is checked.
    public var ran: [String: TeachVerdict] = [:]
    /// Their own work that earned each finding.
    public var quotes: [String: String] = [:]
    public var reported = false

    public init(nodeId: String) { self.nodeId = nodeId }

    /// Steps whose result is wrong — not merely absent.
    public func broken(_ content: PerformContent) -> [PerformStep] {
        content.steps.filter { ran[$0.id] == .confused }
    }

    /// Steps the run never carried out — absent, not wrong.
    public func skipped(_ content: PerformContent) -> [PerformStep] {
        content.steps.filter { ran[$0.id] != .good && ran[$0.id] != .confused }
    }

    /// How many steps a run may leave out and still pass.
    public static let skipAllowance = 2

    /// Perform's gate. Only a mistake fails: any step carried out with a wrong
    /// result is a failed run. A right run that leaves out one or two steps
    /// passes, as long as something was actually run.
    public func passed(_ content: PerformContent) -> Bool {
        guard !content.steps.isEmpty else { return reported }
        guard broken(content).isEmpty else { return false }
        guard content.steps.contains(where: { ran[$0.id] == .good }) else { return false }
        return skipped(content).count <= Self.skipAllowance
    }
}
