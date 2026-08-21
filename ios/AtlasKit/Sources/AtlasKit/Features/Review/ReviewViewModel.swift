import Observation
import SwiftUI

/// Screen 19 — one pass over the day's deck, plus how that deck came to exist.
///
/// It owns three things: which card is on screen, what a grade writes back (the
/// scheduler, the review history that finally earns Retained, the calibration
/// reading, and the Shaky flag a miss hangs on the node), and the one-off card
/// draft for nodes that have never been reviewed. Mirrors `retainReducer` plus
/// the write-backs `useSpiral` keeps beside it.
@Observable
@MainActor
public final class ReviewViewModel {
    public enum Stage { case confidence, reveal, failed }

    public private(set) var deck: [ScheduledCard]
    public private(set) var index = 0
    public private(set) var stage: Stage = .confidence
    public private(set) var confidence: ReviewConfidence?
    /// The grade each card got — what the deck rail across the top reads.
    public private(set) var results: [String: ReviewGrade] = [:]
    public private(set) var finished = false
    /// Why there is nothing on screen — a clear queue, or an honest failure.
    public private(set) var message = ""
    public private(set) var drafting = false

    private let store: AtlasStore
    /// Cards already sent back to the end of the deck once.
    private var requeued: Set<String> = []

    public init(store: AtlasStore, deck: [ScheduledCard] = []) {
        self.store = store
        self.deck = deck
    }

    public var card: ScheduledCard? { deck[safe: index] }
    public var hasCard: Bool { card != nil && !finished }
    /// Cards still to answer, this one included — the deck count in the header.
    public var remaining: Int { max(0, deck.count - index) }
    /// Minutes left against the daily target, the only honest queue framing.
    public var minutesLeft: Int { Int((Double(remaining) * cardMinutes).rounded()) }
    /// One colour per card, prepared outside the layout pass.
    public var rail: [Color?] { deck.map { results[$0.id]?.tint } }

    public var waitingCopy: String {
        if drafting { return String(localized: "Escrevendo os cartões de hoje…") }
        if !message.isEmpty { return message }
        return finished
            ? String(localized: "Fila limpa por hoje. Volte amanhã — é quando essas memórias começam a desvanecer.")
            : String(localized: "Nada para revisar ainda. Aprenda um conceito e ele volta aqui.")
    }

    /// The concept a missed card belongs to — what "reensinar agora" opens.
    public var failedNode: ConceptNode? {
        guard let card else { return nil }
        return store.graph.nodes.first { $0.id == card.card.node }
    }

    // MARK: - Filling the deck

    /// The queue reads from the cards that exist; a node that has never been
    /// reviewed gets its cards drafted once, and they live here from then on.
    public func open() async {
        if hasCard { return }
        if !store.queue.isEmpty { return reset(to: store.queue) }
        let uncovered = store.uncovered
        guard !uncovered.isEmpty, !drafting else { return }
        drafting = true
        defer { drafting = false }
        do {
            let drafted = try await store.api.retain(
                topic: store.subject,
                budgetMin: store.dailyTarget,
                nodes: uncovered.map { ($0.id, $0.label, store.states[$0.id] ?? .learning) },
                interests: store.interests
            )
            store.cards.append(contentsOf: drafted.map { ScheduledCard($0) })
            reset(to: store.queue)
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar sua revisão"))
        }
    }

    private func reset(to deck: [ScheduledCard]) {
        self.deck = deck
        index = 0
        stage = .confidence
        confidence = nil
        results = [:]
        requeued = []
        finished = deck.isEmpty
        message = ""
    }

    // MARK: - The pass

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

    /// A cloze card is its two halves around the blank; everything else asks
    /// its question outright.
    public func front(_ card: ReviewCard) -> String {
        guard let cloze = card.cloze, cloze.count == 2 else { return card.front ?? card.back }
        return cloze[0] + "______" + cloze[1]
    }

    /// The failure read-back: the tap held against the miss. A "Sólido" that
    /// then missed is the overconfidence the whole surface exists to catch.
    public var calibrationLine: LocalizedStringKey {
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
