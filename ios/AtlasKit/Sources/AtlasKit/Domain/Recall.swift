import Foundation

// ---- Phase · Recall (unaided retrieval) ------------------------------------
// A blank page and one line telling the learner what to produce. Nothing is on
// screen to lean on, because the signal is what comes back *without* a cue —
// distinct from Feynman's unaided production, which grades whether they can
// explain it to someone. Recall grades only whether it is still there.
//
// The rubric is never shown before the answer. What a learner never thinks to
// write is the finding, and a rubric printed above the box is the answer handed
// over before the test. Mirrors `lib/curriculum/recall.ts`.

/// One thing a cold retrieval has to bring back. Not something to explain —
/// something to *have*.
public struct RecallRow: Decodable, Sendable, Identifiable {
    public let id: String
    /// The row label in the report.
    public let point: String
    /// What the learner's own words must get across for this to count as
    /// retrieved. Checkable, never "covers it well".
    public let mustRetrieve: [String]
}

public struct RecallContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// The one line on the blank page.
    public let brief: String
    /// Offered only when the learner freezes, and never a piece of the answer.
    public let scaffold: String
    public let rubric: [RecallRow]
}

public struct RecallSession: Sendable {
    public let nodeId: String
    /// What they wrote, from memory.
    public var written = ""
    /// True once they have asked for the scaffold — the report says so, because
    /// a cued retrieval is a different reading than an uncued one.
    public var cued = false
    /// The judge's reaction to the whole attempt.
    public var response = ""
    public var pending = false
    /// Verdict per rubric row id. Empty until judged.
    public var retrieved: [String: TeachVerdict] = [:]
    /// Their own words that earned each miss.
    public var quotes: [String: String] = [:]
    public var reported = false

    public init(nodeId: String) { self.nodeId = nodeId }

    public func score(_ content: RecallContent) -> Int {
        content.rubric.filter { retrieved[$0.id] == .good }.count
    }

    /// Recall's gate: two thirds of the rubric, rounded up.
    ///
    /// Partial credit is the honest standard for retrieval — memory is graded,
    /// not all-or-nothing, and a learner who brings back most of a concept cold
    /// has demonstrated the thing this phase measures. Perform's gate is
    /// deliberately stricter, because a procedure with one wrong step is a
    /// failed run.
    public func passed(_ content: RecallContent) -> Bool {
        guard !content.rubric.isEmpty else { return reported }
        return score(content) >= Int((Double(content.rubric.count) * 2 / 3).rounded(.up))
    }
}
