import Foundation
import SwiftUI

// Screen 19 — the daily queue. Mirrors the parts of `lib/curriculum/retain.ts`
// and `lib/fsrs.ts` the surface actually needs: the card, the scheduler that
// gives the grade buttons their real intervals, and the pass over the deck.

/// The three card kinds — review isn't only fill-in-the-blank. Colours echo the
/// phase that drafts each one (recall = learning, why = Connect, apply = Crisol).
public enum ReviewCardType: String, Codable, Sendable {
    case recall, why, apply

    var label: LocalizedStringKey {
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

    var label: LocalizedStringKey {
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

    var label: LocalizedStringKey {
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
public struct ReviewCard: Codable, Sendable, Identifiable {
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
public struct ScheduledCard: Codable, Sendable, Identifiable {
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
    func label(for grade: ReviewGrade, now: Date = .now) -> LocalizedStringKey {
        let days = graded(grade, now: now).due.timeIntervalSince(now) / 86_400
        if days < 1 { return "<1 d" }
        if days < 30 { return "\(Int(days.rounded())) d" }
        return "\(Int((days / 30).rounded())) meses"
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
