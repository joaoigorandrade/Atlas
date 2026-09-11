import Observation
import SwiftUI

/// Screen 19 — one pass over the day's deck, plus how that deck came to exist.
///
/// It owns three things: which card is on screen, what a grade writes back (the
/// scheduler, the review history that finally earns Retained, and the Shaky
/// flag a miss hangs on the node), and the one-off card draft for nodes that
/// have never been reviewed. Mirrors `retainReducer` plus the write-backs
/// `useSpiral` keeps beside it.
@Observable
@MainActor
public final class ReviewViewModel {
    public enum Stage { case question, reveal, failed }

    public private(set) var deck: [ReviewCard]
    public private(set) var index = 0
    public private(set) var stage: Stage = .question
    /// The grade each card got, keyed by its **position** in the deck — a
    /// missed card comes back with the same id, and keying by id lit its
    /// second slot on the rail red before the learner had answered it.
    public private(set) var results: [Int: ReviewGrade] = [:]
    public private(set) var finished = false
    /// Why there is nothing on screen — a clear queue, or an honest failure.
    public private(set) var message = ""
    public private(set) var drafting = false

    private let store: AtlasStore
    /// Cards already sent back to the end of the deck once.
    private var requeued: Set<String> = []

    public init(store: AtlasStore, deck: [ReviewCard] = []) {
        self.store = store
        self.deck = deck
    }

    public var card: ReviewCard? { deck[safe: index] }
    public var hasCard: Bool { card != nil && !finished }
    /// Cards still to answer, this one included — the deck count in the header.
    public var remaining: Int { max(0, deck.count - index) }
    /// Minutes left against the daily target, the only honest queue framing.
    public var minutesLeft: Int { Int((Double(remaining) * cardMinutes).rounded()) }
    /// One colour per card, prepared outside the layout pass.
    public var rail: [Color?] { deck.indices.map { results[$0]?.tint } }

    public var waitingCopy: String {
        if drafting { return String(localized: "Escrevendo os cartões de hoje…") }
        if !message.isEmpty { return message }
        // "Fila limpa" is only true of a deck that exists — a run with no cards
        // at all has an empty queue for a different reason, and saying it
        // cleared one it never had is the screen reading its own state wrong.
        if finished, !store.cards.isEmpty {
            // A budget that ran out is not a queue that emptied. The deck the
            // server hands over is already cut to the daily minutes, so an
            // empty deck alone could never tell the two apart — `remaining`
            // does. See `retainContentFromStore`.
            if store.deckRemaining > 0 {
                return String(localized: "A meta de hoje foi cumprida. Ainda há \(store.deckRemaining) cartões vencidos — eles esperam amanhã, ou aumente sua meta diária.")
            }
            return String(localized: "Fila limpa. O FSRS já agendou cada cartão para o próximo momento em que ele vale a pena.")
        }
        // A learner with forty cards, none of them due, is not a learner with
        // nothing learned — telling them to go learn a concept was the screen
        // reading its own empty deck as an empty run.
        return store.cards.isEmpty
            ? String(localized: "Nada para revisar ainda. Aprenda um conceito e ele volta aqui.")
            : String(localized: "Nada vencendo agora. Suas memórias ainda estão firmes.")
    }

    /// When the next card comes back, worded — the honest replacement for
    /// "volte amanhã", which the scheduler almost never means.
    public var nextDueCopy: String? {
        guard let next = store.nextDue else { return nil }
        let when = next.formatted(.relative(presentation: .named))
        return String(localized: "Próximo cartão \(when).")
    }

    /// The retention forecast the deck endpoint already answers with. Empty
    /// until a deck has been loaded, which is the same moment it is drawn.
    public var forecast: [RetainContent.ForecastRow] { store.forecast }

    /// Only a failure offers a retry — a clear queue is not something to retry.
    public var canRetry: Bool { !message.isEmpty && !drafting }

    // MARK: - What the pass was worth

    /// Cards graded in this pass, and how many were recalled first time. The
    /// done-for-today panel is built from these, so the session ends on
    /// something the learner did rather than on a blank screen.
    public var gradedCount: Int { results.count }
    public var recalledCount: Int { results.values.count { $0 == .good || $0 == .easy } }

    /// What the pass came to. Nil when it was too short to mean much.
    public var passVerdict: String? {
        guard gradedCount >= 2 else { return nil }
        let missed = gradedCount - recalledCount
        if missed == 0 {
            return String(localized: "Você recordou todos. Se algum pareceu fácil demais, o intervalo dele acabou de crescer.")
        }
        return String(localized: "Você errou \(missed). Eles voltam cedo, e os nós deles reentraram no ciclo.")
    }

    /// The concept a missed card belongs to — what "reensinar agora" opens.
    public var failedNode: ConceptNode? {
        guard let card else { return nil }
        return store.graph.nodes.first { $0.id == card.node }
    }

    // MARK: - Filling the deck

    /// The queue reads from the cards that exist; a node that has never been
    /// reviewed gets its cards drafted once, and they live here from then on.
    public func open() async {
        if hasCard { return }
        // The deck — which cards are due, in what order, and what each grade
        // button would schedule — is the server's answer, because that is where
        // the scheduler runs. See `Retain.swift`.
        await store.loadDeck()
        if !store.deck.isEmpty { return reset(to: store.deck) }
        let uncovered = store.uncovered
        guard !uncovered.isEmpty, !drafting else { return }
        drafting = true
        defer { drafting = false }
        // The map warms this ahead of the tab being opened, and the draft files
        // itself into the run either way — so this usually returns with the
        // cards already written. See `AtlasStore.draftCards`.
        if let error = await store.draftCards(for: uncovered) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar sua revisão"))
        } else {
            await store.loadDeck()
            reset(to: store.deck)
        }
    }

    private func reset(to deck: [ReviewCard]) {
        self.deck = deck
        index = 0
        stage = .question
        results = [:]
        requeued = []
        finished = deck.isEmpty
        message = ""
    }

    /// Try again after a failure. Generation is flaky by nature and the only
    /// recovery used to be quitting the app.
    public func retry() async {
        message = ""
        await open()
    }

    // MARK: - The pass

    /// Turn the card over.
    public func flip() {
        guard stage == .question else { return }
        stage = .reveal
    }

    /// Grade the card on screen: the scheduler moves it, and a miss flags its
    /// node Shaky.
    public func grade(_ grade: ReviewGrade) {
        guard stage == .reveal, let card else { return }
        // The scheduler is the server's; the card leaves this deck immediately
        // and the write settles behind it, so nothing on screen waits.
        //
        // A card on its second trip through this deck was already graded and
        // rescheduled; grading it again would schedule off a state this pass no
        // longer knows. The copy is local, so the second answer only updates
        // what the screen says about it.
        if !requeued.contains(card.id) { store.grade(card, grade) }
        results[index] = grade
        store.markActiveToday()
        // Real review history is what earns "Retido ✓" — mastered alone doesn't.
        if grade == .good || grade == .easy { store.reviewed.insert(card.node) }
        guard grade == .again else { return advance() }
        // Any node a card keeps alive goes Shaky on a miss, not only a mastered
        // one — `useSpiral` has always flagged every node, and a Learning node
        // that just failed its own card is exactly what Shaky is for.
        if store.states[card.node] != .shaky, (store.states[card.node] ?? .unknown).isLearned {
            store.states[card.node] = .shaky
            store.shakyReasons[card.node] = .reviewMiss
        }
        // A miss really does come back at the end of the deck — but only once,
        // or a card nobody can answer is a session with no end. This copy is
        // local to the pass: the server has already been told, and grading it
        // again would schedule off a state this session no longer knows.
        if requeued.insert(card.id).inserted { deck.append(card) }
        stage = .failed
    }

    /// Leave the fail stage, or the revealed card, for the next one.
    public func advance() {
        guard index + 1 < deck.count else { return finished = true }
        index += 1
        stage = .question
    }

    /// A cloze card is its two halves around the blank; everything else asks
    /// its question outright.
    public func front(_ card: ReviewCard) -> String {
        guard let cloze = card.cloze, cloze.count == 2 else { return card.front ?? card.back }
        // The halves are written by a model and their edge whitespace is a
        // coin toss; the browser sidesteps it by laying the blank out as its
        // own element. Here the string is the layout, so it owns the spaces.
        return cloze[0].trimmingCharacters(in: .whitespaces) + " ______ "
            + cloze[1].trimmingCharacters(in: .whitespaces)
    }
}
