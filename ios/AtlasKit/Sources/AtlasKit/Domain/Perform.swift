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

    /// Load-bearing steps that were never carried out at all — a thin run, and
    /// the other half of the gate.
    public func skipped(_ content: PerformContent) -> [PerformStep] {
        content.steps.filter { $0.loadBearing && ran[$0.id] != .good && ran[$0.id] != .confused }
    }

    /// Perform's gate, and deliberately not Recall's.
    ///
    /// Retrieval takes partial credit because memory is partial. Execution does
    /// not: a run with a wrong intermediate result is a failed run of that step,
    /// however much of the rest was right, so *any* wrong step fails — and every
    /// load-bearing step must actually have been carried out. A step the learner
    /// skipped that nothing downstream depends on (a sanity check, a units note)
    /// is a thinner run, not a wrong one, so it is allowed through.
    public func passed(_ content: PerformContent) -> Bool {
        guard !content.steps.isEmpty else { return reported }
        guard broken(content).isEmpty else { return false }
        return content.steps.filter(\.loadBearing).allSatisfy { ran[$0.id] == .good }
    }
}
