import Foundation

// ---- Phase · Trace (following a mechanism step by step) --------------------
// One case, walked stage by stage: given where it has got to, what does this
// stage hand the next? The links of a single chain, in order — not independent
// items that happen to be about the same concept.
//
// The chain is why this is its own phase and its own surface. What an answered
// stage established stays on screen, because it is the input to the next one,
// and a broken link stops the walk: everything after a stage you got wrong is
// being carried forward from the wrong place, so the run reports where it broke
// rather than a bare score. Mirrors `lib/curriculum/trace.ts`.

/// One link of the chain.
public struct TraceStage: Decodable, Sendable, Identifiable {
    public let id: String
    /// Where the case has got to — what the previous stage produced.
    public let reached: String
    /// Candidate next stages: the right one, plus a skipped stage, a reversed
    /// pair, or a quantity carried forward that the last stage changed.
    public let nexts: [String]
    public let answerIndex: Int
    /// What this stage consumes, what it produces, and what would break if it
    /// ran out of order. Revealed after the commit.
    public let handsOn: String
}

public struct TraceContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// The one running case the whole chain walks.
    public let scenario: String
    public let stages: [TraceStage]
}

public struct TraceSession: Sendable {
    public let nodeId: String
    public var index = 0
    /// Committed next-stage per stage id.
    public var walked: [String: Int] = [:]
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    public mutating func step(_ next: Int, _ content: TraceContent) {
        guard let item = content.stages[safe: index], walked[item.id] == nil else { return }
        walked[item.id] = next
    }

    public mutating func next(_ content: TraceContent) {
        guard let item = content.stages[safe: index], walked[item.id] != nil else { return }
        index += 1
        done = index >= content.stages.count
    }

    public func score(_ content: TraceContent) -> Int {
        content.stages.filter { walked[$0.id] == $0.answerIndex }.count
    }

    /// Where the chain first broke — the index of the earliest wrong stage, or
    /// nil.
    ///
    /// The first break is the one that matters: every stage after it was
    /// answered from a position the learner had already left, so a run that
    /// breaks at stage two and recovers at stage four has not walked the chain,
    /// it has re-joined it.
    public func brokeAt(_ content: TraceContent) -> Int? {
        content.stages.firstIndex { walked[$0.id] != nil && walked[$0.id] != $0.answerIndex }
    }

    /// Trace's gate, and deliberately not a score threshold: the chain has to
    /// hold from the start. The learner must walk at least the first two thirds
    /// of it unbroken.
    ///
    /// A fraction-correct gate would pass a run that broke at the first link and
    /// guessed the rest, which is the opposite of following a mechanism.
    public func passed(_ content: TraceContent) -> Bool {
        guard !content.stages.isEmpty else { return done }
        let unbroken = brokeAt(content) ?? content.stages.count
        return unbroken >= Int((Double(content.stages.count) * 2 / 3).rounded(.up))
    }
}
