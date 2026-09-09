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

/// One card in today's deck, as the server sends it.
///
/// `fsrs` here is the four interval labels — what "Bom" would actually
/// schedule, in days or months — not scheduler state. They arrive with the card
/// because the scheduler runs in one place: `lib/fsrs.ts`, which the browser
/// calls locally and this client reaches through `/api/v1/…/review`. Computing
/// them here instead would mean a second implementation of FSRS, which is
/// exactly what the hand-rolled SM-2 that used to live in this file was — and
/// why a card graded on the phone showed a different due date in a browser.
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
    /// Grade → the interval it schedules, already worded. Absent on a card that
    /// arrived from somewhere other than the deck endpoint.
    public let fsrs: [String: String]?

    /// The honest label for a grade button. Falls back to nothing rather than
    /// to a guess: a made-up interval is worse than no interval.
    func label(for grade: ReviewGrade) -> String? { fsrs?[grade.rawValue] }
}

/// What the deck endpoint answers with: today's cards, budgeted to the daily
/// target, plus the retention forecast the screen's three rows read.
public struct RetainContent: Decodable, Sendable {
    public let budgetMin: Int
    public let cards: [ReviewCard]
    /// Absent on the draft, because two endpoints answer in this shape and
    /// only one of them carries it: `/api/v1/…/review` builds the forecast from
    /// real due dates, while the card *factory* at `/api/generate` deliberately
    /// does not (`lib/server/generate/retain.ts`). Requiring it here made every
    /// draft fail to decode — silently, since the draft path treats a decode
    /// failure as "no cards" — and the Review tab could never fill.
    public let forecast: [ForecastRow]?

    public struct ForecastRow: Decodable, Sendable, Identifiable {
        public let label: String
        public let count: String
        public let sub: String
        public let tone: String
        public var id: String { label }

        /// The rail beside each row. Same three tones the browser paints —
        /// `FORECAST_COLOR` in `lib/curriculum/retain.ts`.
        var tint: Color {
            switch tone {
            case "solid": NodeState.mastered.color
            case "soft": NodeState.shaky.color
            default: Palette.accent
            }
        }
    }
}

/// Roughly how long one card takes — the queue is budgeted in minutes against
/// the daily target, never framed as a wall of cards.
public let cardMinutes = 1.5
