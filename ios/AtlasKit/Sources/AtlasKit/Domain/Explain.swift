import Foundation

// ---- Phase · Explain (explanation design) ----------------------------------
// Straight after the reading: not what the concept is, but how to put it across
// to someone else. Five cards model one explanation, then one check — a
// listener voices the misconception and the learner picks the reply that
// defuses it. A miss is taught on the spot and the learner tries again, so the
// gate is finding the reply, however many tries it took.
//
// Mirrors `lib/curriculum/explain.ts`.

/// One reply to the listener. Exactly one per check defuses the misconception.
public struct ExplainReply: Decodable, Sendable {
    public let label: String
    public let correct: Bool
    /// Why it works, or why it leaves the misconception standing.
    public let why: String
}

public struct ExplainContent: Decodable, Sendable {
    public struct Analogy: Decodable, Sendable { public let text: String; public let breaks: String }
    public struct Misconception: Decodable, Sendable { public let belief: String; public let tempting: String }
    public struct CheckBack: Decodable, Sendable { public let question: String; public let rightAnswer: String }
    public struct Listener: Decodable, Sendable { public let says: String; public let replies: [ExplainReply] }

    public let nodeId: String
    public let nodeLabel: String
    /// The question this concept answers — where an explanation starts.
    public let problem: String
    public let analogy: Analogy
    /// 3-5 ideas, in the order to introduce them.
    public let order: [String]
    public let misconception: Misconception
    public let checkBack: CheckBack
    public let listener: Listener
}

/// The five cards, in the order they are revealed.
public enum ExplainCard: CaseIterable, Sendable {
    case problem, analogy, order, misconception, checkBack
}

public struct ExplainSession: Sendable {
    public let nodeId: String
    /// Cards revealed so far, 1-5. The check opens once all five are.
    public var revealed = 1
    /// Replies already tried and found wanting — never offered again.
    public var tried: [Int] = []
    /// The last reply picked, for the reveal under it.
    public var picked: Int?
    /// The defusing reply was picked.
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    public var checking: Bool { revealed >= ExplainCard.allCases.count }

    public mutating func reveal() {
        guard !done, !checking else { return }
        revealed += 1
    }

    /// The check waits on the whole model; a reply already ruled out is not a
    /// second try.
    public mutating func pick(_ index: Int, _ content: ExplainContent) {
        guard !done, checking, !tried.contains(index),
              let reply = content.listener.replies[safe: index] else { return }
        picked = index
        if reply.correct { done = true } else { tried.append(index) }
    }

    /// Explain's gate: the defusing reply, found.
    public var passed: Bool { done }
}
