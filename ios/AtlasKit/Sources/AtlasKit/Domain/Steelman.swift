import Foundation

// ---- Phase · Steelman (holding a contested position) ------------------------
// A question honest readers disagree about, and both answers. The learner builds
// the strongest case for EACH side — including the one they reject — then says
// which they hold and what would change their mind.
//
// The signal no other phase extracts. Socratic reasons toward an answer;
// Crucible transfers one; Feynman explains one. All three assume there IS one.
// In an interpretive domain the defining competence is the opposite: carrying a
// live disagreement without collapsing it into the side you already prefer.
//
// The disconfirmer is the gate, not decoration. "What would change my mind"
// separates a position from an allegiance, and a learner who cannot name one has
// not held the question open — they have picked.
//
// Mirrors `lib/curriculum/steelman.ts`.

/// One side of the question, named by who actually held it — a position with no
/// holders is a strawman with better manners.
public struct SteelmanPosition: Decodable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let heldBy: String
    /// The load-bearing points a genuinely strong version of this side makes.
    /// Never shown before the learner writes — they are the rubric.
    public let mustCover: [String]
}

public struct SteelmanContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// The contested question, stated so that neither side is the default.
    public let question: String
    /// Two: a question with one defensible answer is not contested.
    public let positions: [SteelmanPosition]
}

/// How well the learner's case for one side stood it up.
public enum SteelmanVerdict: String, Codable, Sendable, CaseIterable {
    case strong, thin, strawman
}

public struct SteelmanSession: Sendable {
    public let nodeId: String
    /// The learner's case for each side, by position id.
    public var cases: [String: String] = [:]
    /// Which side they hold, once both cases are written.
    public var holds: String?
    /// What would change their mind.
    public var disconfirmer = ""
    public var verdicts: [String: SteelmanVerdict] = [:]
    public var response: String?
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    public mutating func write(_ positionId: String, _ text: String) {
        cases[positionId] = text
    }

    public mutating func hold(_ positionId: String, disconfirmer: String) {
        holds = positionId
        self.disconfirmer = disconfirmer
    }

    public mutating func judged(_ verdicts: [String: SteelmanVerdict], response: String) {
        self.verdicts = verdicts
        self.response = response
        done = true
    }

    /// Both cases written, with enough in each to be worth judging. Below this
    /// the judge is being asked to rule on a blank page.
    public func ready(_ content: SteelmanContent) -> Bool {
        content.positions.allSatisfy {
            (cases[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count >= 40
        }
    }

    /// Steelman's gate: neither side came out a strawman, at most one came out
    /// thin, and the learner named a real disconfirmer.
    ///
    /// The strawman clause is the phase's own standard. Scoring both sides
    /// together would let a learner write a superb case for their own view, a
    /// shrug for the other, and pass on the average — which is exactly the habit
    /// this phase exists to break, so the weak side is judged on its own terms.
    public func passed(_ content: SteelmanContent) -> Bool {
        let rulings = content.positions.map { verdicts[$0.id] }
        guard rulings.allSatisfy({ $0 != nil }) else { return false }
        guard !rulings.contains(where: { $0 == .strawman }) else { return false }
        guard rulings.filter({ $0 == .thin }).count <= 1 else { return false }
        return disconfirmer.trimmingCharacters(in: .whitespacesAndNewlines).count >= 15
    }
}
