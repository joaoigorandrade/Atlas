import Foundation

// ---- Phase · Produce (real-time production) ---------------------------------
// The learner says it. Out loud, unscripted, against the clock.
//
// The signal no other phase extracts. Feynman is unaided production too, but of
// an EXPLANATION, in whatever language the learner already has, graded on
// content. Drill is fast but closed. Perform runs a procedure on a case. None of
// them measures whether the learner can generate the target form live, which in
// a performative domain is the entire competence — and is why `performative`
// takes Socratic, Feynman and Crucible off the ladder to make room for this.
//
// The verdict that earns the phase is `thin`: understood, but the learner routed
// around the form they were unsure of. Avoidance reads as success in every other
// phase and in most conversations, which is exactly how a speaker fossilizes at
// "good enough" — so it is counted, and capped, here.
//
// Mirrors `lib/curriculum/produce.ts`.

public struct ProduceTurn: Decodable, Sendable, Identifiable {
    public let id: String
    /// What to say, written in the LEARNER'S language so that reading the cue is
    /// never itself the test.
    public let cue: String
    /// The forms this turn exists to elicit. The learner never sees them — they
    /// are what `thin` is measured against.
    public let targetForms: [String]
    /// How long they get. Short on purpose: production under time pressure is
    /// the signal, and an unbounded turn becomes a writing exercise.
    public let seconds: Int
}

public struct ProduceContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    /// One sentence setting the situation all the turns happen inside.
    public let scene: String
    public let turns: [ProduceTurn]
}

/// `good` — understood, and the target form was used.
/// `thin` — understood, but the target form was avoided.
/// `wrong` — not comprehensible, or the form was used incorrectly.
public enum ProduceVerdict: String, Codable, Sendable, CaseIterable {
    case good, thin, wrong
}

public struct ProduceSession: Sendable {
    public let nodeId: String
    /// Which turn is open; equal to `turns.count` when the run is finished.
    public var index = 0
    /// What the learner actually said, per turn id, as dictation transcribed it.
    public var saidBy: [String: String] = [:]
    public var verdicts: [String: ProduceVerdict] = [:]
    /// The judge's one-line read per turn.
    public var reads: [String: String] = [:]
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    /// One attempt per turn. A retry until it lands is rehearsal, and rehearsal
    /// is what the next phase is for.
    public mutating func said(_ text: String, _ content: ProduceContent) {
        guard let item = content.turns[safe: index], saidBy[item.id] == nil else { return }
        saidBy[item.id] = text
    }

    public mutating func judged(
        _ verdict: ProduceVerdict, read: String, _ content: ProduceContent
    ) {
        guard let item = content.turns[safe: index] else { return }
        verdicts[item.id] = verdict
        reads[item.id] = read
    }

    public mutating func next(_ content: ProduceContent) {
        guard let item = content.turns[safe: index], verdicts[item.id] != nil else { return }
        index += 1
        done = index >= content.turns.count
    }

    public func score(_ content: ProduceContent) -> Int {
        content.turns.filter { verdicts[$0.id] == .good }.count
    }

    /// Turns the learner got across while dodging the form — understood, and no
    /// evidence they can produce the thing the turn was for.
    public func avoided(_ content: ProduceContent) -> [ProduceTurn] {
        content.turns.filter { verdicts[$0.id] == .thin }
    }

    /// Produce's gate: two thirds of the turns landed, and at most one was
    /// routed around.
    ///
    /// The avoidance cap is the phase's own standard, and the reason it is not a
    /// plain score: `thin` turns are comprehensible, so a learner who avoids
    /// every hard form is understood every time and never improves. Counting
    /// `thin` as partial credit would encode exactly the habit that stalls a
    /// speaker for years.
    public func passed(_ content: ProduceContent) -> Bool {
        guard !content.turns.isEmpty else { return done }
        let bar = Int((Double(content.turns.count) * 2 / 3).rounded(.up))
        return score(content) >= bar && avoided(content).count <= 1
    }
}
