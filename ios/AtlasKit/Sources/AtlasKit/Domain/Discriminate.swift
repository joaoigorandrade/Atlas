import Foundation

// ---- Phase · Discriminate (the boundary) -----------------------------------
// Case by case: is this an instance of the concept, and if not, which neighbour
// is it? A concept IS a classification, so telling instances from near-misses
// is not a warm-up for the ladder — it is the thing being learned, which is why
// it sits directly behind the reading.
//
// Every case is committed before it is revealed. A learner who can see the
// verdict while choosing is doing recognition, which is the one thing a boundary
// test may not measure.
//
// Mirrors `lib/curriculum/discriminate.ts`. Purpose-built, like every phase: the
// four commit-then-reveal phases share a shape on screen and nothing else — the
// content they grade, and the bar they grade it against, are each their own.

/// One candidate case, described without naming any concept.
public struct DiscriminateCase: Decodable, Sendable, Identifiable {
    public let id: String
    /// The case itself — a situation, not a question.
    public let candidate: String
    /// Candidate readings: the right one, plus the neighbours really confused
    /// with it. Never "none of the above".
    public let readings: [String]
    public let answerIndex: Int
    /// The feature present or missing that decides THIS case. Revealed only
    /// after the commit.
    public let decidedBy: String
    /// True when the case is genuinely an instance — the report separates
    /// "called a non-instance an instance" from the reverse, because they are
    /// different errors.
    public let isInstance: Bool
}

public struct DiscriminateContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// The question asked of every case, so it is asked once rather than per
    /// case — the cases vary, the question does not.
    public let ask: String
    public let cases: [DiscriminateCase]
}

public struct DiscriminateSession: Sendable {
    public let nodeId: String
    /// Which case is open; equal to `cases.count` when the run is finished.
    public var index = 0
    /// Committed reading per case id. A case with one is answered.
    public var calls: [String: Int] = [:]
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    /// One call per case. Re-calling would let a learner cycle the readings
    /// until the reveal turns green, which is not a boundary test.
    public mutating func call(_ index: Int, _ content: DiscriminateContent) {
        guard let item = content.cases[safe: self.index], calls[item.id] == nil else { return }
        calls[item.id] = index
    }

    public mutating func next(_ content: DiscriminateContent) {
        guard let item = content.cases[safe: index], calls[item.id] != nil else { return }
        index += 1
        done = index >= content.cases.count
    }

    public func score(_ content: DiscriminateContent) -> Int {
        content.cases.filter { calls[$0.id] == $0.answerIndex }.count
    }

    /// Cases wrongly waved through as instances — the over-inclusive error, and
    /// the one a learner who memorised the definition actually makes.
    public func falsePositives(_ content: DiscriminateContent) -> [DiscriminateCase] {
        content.cases.filter { !$0.isInstance && calls[$0.id] != nil && calls[$0.id] != $0.answerIndex }
    }

    /// Discriminate's gate: two thirds of the cases, and no more than one
    /// over-inclusive miss.
    ///
    /// The second clause is the phase's own standard. A learner who calls every
    /// case an instance scores whatever fraction of the run happens to be
    /// instances — by luck, not by the boundary — and waving near-misses through
    /// is precisely the failure this phase exists to catch.
    public func passed(_ content: DiscriminateContent) -> Bool {
        guard !content.cases.isEmpty else { return done }
        let bar = Int((Double(content.cases.count) * 2 / 3).rounded(.up))
        return score(content) >= bar && falsePositives(content).count <= 1
    }
}
