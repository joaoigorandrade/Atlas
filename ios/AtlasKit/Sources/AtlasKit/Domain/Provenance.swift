import Foundation

// ---- Phase · Provenance (evidence quality) ---------------------------------
// One real source, and the question a historian asks before "is this true?":
// what is this document FOR? A learner is handed an excerpt and rules each
// claim three ways — the source ASSERTS it, the source's existence PROVES it,
// or neither.
//
// The signal no other phase extracts. Discriminate rules instances of a class;
// Trace follows a mechanism; Socratic reasons under questioning. None of them
// asks whether the evidence in front of you supports what is being hung on it,
// which in an interpretive domain is the whole craft.
//
// Mirrors `lib/curriculum/provenance.ts`. Graded on the device — every claim
// ships its own ruling, so the pass costs one generation and no judge call.

/// The three rulings, and the distinction the phase exists to teach.
///
/// `asserts` and `proves` are the pair learners collapse: a papal bull claiming
/// universal authority is strong evidence that the claim was MADE, and no
/// evidence at all that it was accepted.
public enum ProvenanceRuling: String, Codable, Sendable, CaseIterable {
    case asserts, proves, neither
}

/// The excerpt itself, with everything needed to read it as a document rather
/// than as a fact: who wrote it, to whom, and when.
public struct ProvenanceSource: Decodable, Sendable {
    public let title: String
    public let attribution: String
    public let date: String
    public let excerpt: String
    /// The page it is on, on an allow-listed public-domain corpus (W2.7).
    public let url: String?
    /// The excerpt was found on that page; false is a paraphrase.
    public let verified: Bool?
}

public struct ProvenanceClaim: Decodable, Sendable, Identifiable {
    public let id: String
    /// A statement about the world, to be ruled against the source.
    public let claim: String
    public let ruling: ProvenanceRuling
    /// Why it is that ruling — revealed only after the learner commits.
    public let because: String
}

public struct ProvenanceContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    public let source: ProvenanceSource
    public let claims: [ProvenanceClaim]
    /// What the source is silent about — shown at the end, because "whose voice
    /// is missing" is not a claim that can be ruled, and is half the lesson.
    public let silence: String
}

public struct ProvenanceSession: Sendable {
    public let nodeId: String
    /// Which claim is open; equal to `claims.count` when the run is finished.
    public var index = 0
    /// Committed ruling per claim id. A claim with one is answered.
    public var rulings: [String: ProvenanceRuling] = [:]
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    /// One ruling per claim, for the same reason Discriminate allows one call:
    /// cycling the options until the reveal turns green is recognition, not
    /// judgement.
    public mutating func rule(_ ruling: ProvenanceRuling, _ content: ProvenanceContent) {
        guard let item = content.claims[safe: index], rulings[item.id] == nil else { return }
        rulings[item.id] = ruling
    }

    public mutating func next(_ content: ProvenanceContent) {
        guard let item = content.claims[safe: index], rulings[item.id] != nil else { return }
        index += 1
        done = index >= content.claims.count || early(content)
    }

    /// Early exit: the opening three claims all ruled right, one of them a
    /// claim the source only `asserts` that was not taken as proof. Mirrors
    /// `provenanceEarly`.
    public func early(_ content: ProvenanceContent) -> Bool {
        let opening = content.claims.prefix(3)
        return content.claims.count > 3
            && opening.allSatisfy { rulings[$0.id] == $0.ruling }
            && opening.contains { $0.ruling == .asserts }
    }

    public func score(_ content: ProvenanceContent) -> Int {
        content.claims.filter { rulings[$0.id] == $0.ruling }.count
    }

    /// Claims the learner took the source's word for — ruled `proves` where it
    /// only `asserts`. Counted on its own because a learner can score two thirds
    /// while making it every time.
    public func overtrusted(_ content: ProvenanceContent) -> [ProvenanceClaim] {
        content.claims.filter { $0.ruling == .asserts && rulings[$0.id] == .proves }
    }

    /// Provenance's gate: two thirds of the claims, and at most one claim where
    /// the source was taken at its word.
    ///
    /// The second clause is the phase's own standard, the way the over-inclusion
    /// cap is Discriminate's. Reading a document as a record of what happened
    /// rather than as an act by an interested party is the failure, and it
    /// survives a two-thirds score untouched.
    public func passed(_ content: ProvenanceContent) -> Bool {
        guard !content.claims.isEmpty else { return done }
        if early(content) { return true }
        let bar = twoThirds(content.claims.count)
        return score(content) >= bar && overtrusted(content).count <= 1
    }
}
