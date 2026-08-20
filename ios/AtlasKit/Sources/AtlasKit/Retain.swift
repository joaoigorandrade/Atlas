import Foundation
import Observation
import SwiftUI

// Screen 19 — the daily queue. Mirrors the parts of `lib/curriculum/retain.ts`
// and `lib/fsrs.ts` the surface actually needs: the card, the scheduler that
// gives the grade buttons their real intervals, and the pass over the deck.

/// The three card kinds — review isn't only fill-in-the-blank. Colours echo the
/// phase that drafts each one (recall = learning, why = Connect, apply = Crisol).
public enum ReviewCardType: String, Decodable, Sendable {
    case recall, why, apply

    var label: String {
        switch self {
        case .recall: "Recordar"
        case .why: "Explicar por quê"
        case .apply: "Aplicação"
        }
    }

    var tint: Color {
        switch self {
        case .recall: NodeState.learning.color
        case .why: Palette.connectInk
        case .apply: Palette.crucibleInk
        }
    }
}

/// The FSRS grade after the flip — it sets the next interval, and `again` is
/// the alive-loop: retention failure re-enters the spiral.
public enum ReviewGrade: String, CaseIterable, Sendable, Identifiable {
    case again, hard, good, easy
    public var id: String { rawValue }

    var label: String {
        switch self {
        case .again: "De novo"
        case .hard: "Difícil"
        case .good: "Bom"
        case .easy: "Fácil"
        }
    }

    var tint: Color {
        switch self {
        case .again: NodeState.gap.color
        case .hard: NodeState.shaky.color
        case .good: NodeState.learning.color
        case .easy: NodeState.mastered.color
        }
    }

    /// First-try performance, as the calibration curve reads it. Same numbers
    /// as `GRADE_REAL` in `useSpiral.ts` — the two clients plot one scale.
    var real: Int {
        switch self {
        case .again: 25
        case .hard: 55
        case .good: 75
        case .easy: 95
        }
    }
}

/// The pre-flip confidence tap — the calibration hook, least → most solid.
public enum ReviewConfidence: Int, CaseIterable, Sendable, Identifiable {
    case blank, shaky, solid
    public var id: Int { rawValue }

    var label: String {
        switch self {
        case .blank: "Em branco"
        case .shaky: "Instável"
        case .solid: "Sólido"
        }
    }

    /// Stated confidence, as the curve reads it — `REVIEW_FELT` on the web.
    var felt: Int {
        switch self {
        case .blank: 20
        case .shaky: 55
        case .solid: 88
        }
    }
}

/// One card the `retain` kind drafted: atomic, one fact. Cloze cards carry the
/// two halves around the blank, the others a plain `front`.
public struct ReviewCard: Decodable, Sendable, Identifiable {
    public let id: String
    public let type: ReviewCardType
    /// Which pass auto-generated it — the provenance line ("de Connect").
    public let source: String
    /// The node this card keeps alive; a miss flags it Shaky on the map.
    public let node: String
    public let cloze: [String]?
    public let answer: String?
    public let front: String?
    public let back: String
    /// The 30-second re-explanation shown right there when it is missed.
    public let reExplain: String?
}

/// What the `retain` kind answers with — a card factory, not a queue.
public struct RetainContent: Decodable, Sendable {
    public let cards: [ReviewCard]
}

/// A card with its scheduler state. The web grades through `ts-fsrs`; there is
/// no Swift port worth a dependency, and this client's cards are its own (the
/// run itself doesn't sync yet either).
///
/// ponytail: SM-2, not FSRS — same four grades, same monotonic intervals, and
/// the honest label on each button. Port real FSRS when the two clients have to
/// agree on a due date card for card.
public struct ScheduledCard: Sendable, Identifiable {
    public let card: ReviewCard
    public var due: Date
    /// Days until the next review; 0 for a card that is new or relearning.
    public var interval: Double
    public var ease: Double

    public var id: String { card.id }

    public init(_ card: ReviewCard, now: Date = .now) {
        self.card = card
        due = now
        interval = 0
        ease = 2.5
    }

    public func isDue(_ now: Date = .now) -> Bool { due <= now }

    /// What this grade schedules. `again` doesn't leave the day — the card
    /// comes back at the end of the session, which is what "de novo" means.
    public func graded(_ grade: ReviewGrade, now: Date = .now) -> ScheduledCard {
        var next = self
        switch grade {
        case .again:
            next.ease = max(1.3, ease - 0.2)
            next.interval = 0
            next.due = now.addingTimeInterval(600)
        case .hard:
            next.ease = max(1.3, ease - 0.15)
            next.interval = max(1, interval * 1.2)
        case .good:
            next.interval = interval == 0 ? 1 : interval * ease
        case .easy:
            next.ease = min(3, ease + 0.15)
            next.interval = interval == 0 ? 3 : interval * ease * 1.3
        }
        if grade != .again { next.due = now.addingTimeInterval(next.interval * 86_400) }
        return next
    }

    /// The interval each grade would schedule, for the button that offers it.
    func label(for grade: ReviewGrade, now: Date = .now) -> String {
        let days = graded(grade, now: now).due.timeIntervalSince(now) / 86_400
        if days < 1 { return "<1 d" }
        if days < 30 { return "\(Int(days.rounded())) d" }
        let months = Int((days / 30).rounded())
        return months == 1 ? "1 mês" : "\(months) meses"
    }
}

/// Roughly how long one card takes — the queue is budgeted in minutes against
/// the daily target, never framed as a wall of cards.
public let cardMinutes = 1.5

/// Today's queue: what is due, most overdue first, cut to the daily target.
public func todaysQueue(_ cards: [ScheduledCard], target: Int, now: Date = .now) -> [ScheduledCard] {
    cards.filter { $0.isDue(now) }
        .sorted { $0.due < $1.due }
        .prefix(max(1, Int(Double(target) / cardMinutes)))
        .map { $0 }
}

/// One pass over the day's deck — screen 19.
///
/// It owns two things: where in the deck the learner is, and what a grade
/// writes back (the scheduler, the review history that finally earns Retained,
/// the calibration reading, and the Shaky flag a miss hangs on the node).
/// Mirrors `retainReducer` plus the write-backs `useSpiral` keeps beside it.
@Observable
@MainActor
public final class Review {
    public enum Stage { case confidence, reveal, failed }

    public private(set) var deck: [ScheduledCard]
    public private(set) var index = 0
    public private(set) var stage: Stage = .confidence
    public private(set) var confidence: ReviewConfidence?
    /// The grade each card got — what the deck rail across the top reads.
    public private(set) var results: [String: ReviewGrade] = [:]
    public private(set) var finished = false

    private let store: AtlasStore
    /// Cards already sent back to the end of the deck once.
    private var requeued: Set<String> = []

    public init(deck: [ScheduledCard], store: AtlasStore) {
        self.deck = deck
        self.store = store
    }

    public var card: ScheduledCard? { deck[safe: index] }
    /// Cards still to answer, this one included — the deck count in the header.
    public var remaining: Int { max(0, deck.count - index) }
    /// Minutes left against the daily target, the only honest queue framing.
    public var minutesLeft: Int { Int((Double(remaining) * cardMinutes).rounded()) }

    /// The concept a missed card belongs to — what "reensinar agora" opens.
    public var failedNode: ConceptNode? {
        guard let card else { return nil }
        return store.graph.nodes.first { $0.id == card.card.node }
    }

    public func tap(_ level: ReviewConfidence) {
        guard stage == .confidence else { return }
        confidence = level
        stage = .reveal
    }

    /// Grade the card on screen: the scheduler moves it, the tap before the
    /// flip becomes a calibration reading, and a miss flags its node Shaky.
    public func grade(_ grade: ReviewGrade) {
        guard stage == .reveal, let scheduled = card else { return }
        store.schedule(scheduled.graded(grade))
        results[scheduled.id] = grade
        store.markActiveToday()
        if let confidence { store.recordCalib(scheduled.card.node, felt: confidence.felt, real: grade.real) }
        // Real review history is what earns "Retido ✓" — mastered alone doesn't.
        if grade == .good || grade == .easy { store.reviewed.insert(scheduled.card.node) }
        guard grade == .again else { return advance() }
        if store.states[scheduled.card.node] == .mastered { store.states[scheduled.card.node] = .shaky }
        // A miss really does come back at the end of the deck — but only once,
        // or a card nobody can answer is a session with no end.
        if requeued.insert(scheduled.id).inserted { deck.append(scheduled) }
        stage = .failed
    }

    /// Leave the fail stage, or the revealed card, for the next one.
    public func advance() {
        guard index + 1 < deck.count else { return finished = true }
        index += 1
        stage = .confidence
        confidence = nil
    }

    /// The failure read-back: the tap held against the miss. A "Sólido" that
    /// then missed is the overconfidence the whole surface exists to catch.
    public var calibrationLine: String {
        switch confidence {
        case .solid:
            "Você tocou “Sólido” antes de virar — e errou. Esse excesso de confiança é exatamente o sinal que a Revisão existe para pegar."
        case .blank:
            "Você sinalizou em branco, e estava certo. Bem calibrado — agora vamos fechar isso de verdade."
        default:
            "Você se sentiu instável, e estava. O cartão volta para o fim da fila e o nó reentra no ciclo."
        }
    }
}
