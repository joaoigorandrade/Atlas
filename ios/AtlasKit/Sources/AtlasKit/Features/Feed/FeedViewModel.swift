import Observation
import SwiftUI

/// The Frontier Feed's round: which concepts it deals from, how far into it the
/// learner is, and the last card's outcome. The answers are not kept here —
/// each is a Consume pretest, written straight into that reading's record — so
/// a round can be left at any card and nothing it found out is lost. A round is
/// a sitting, not a record: reopening deals anew. Mirrors `useFeed`.
@Observable
@MainActor
final class FeedViewModel {
    struct Card: Equatable {
        let node: ConceptNode
        let chunk: ConsumeChunk
        static func == (a: Card, b: Card) -> Bool { a.node.id == b.node.id && a.chunk.id == b.chunk.id }
    }

    /// The card just answered, held on screen until the learner moves on.
    struct Outcome {
        let card: Card
        let correct: Bool
        let stake: Int
    }

    private(set) var card: Card?
    private(set) var last: Outcome?
    /// A guess on the card waiting on its ink bet.
    private(set) var held: Int?
    private(set) var answered = 0
    /// Concepts with a miss this round: the ones the closing page sends to read.
    private(set) var missed: [ConceptNode] = []

    private let store: AtlasStore
    private var concepts: [String]
    /// The ink when the round was dealt — the closing tally is the difference.
    private let inkAt: Int

    init(store: AtlasStore) {
        self.store = store
        concepts = store.feedReady
        inkAt = store.ink
        deal()
    }

    var ink: Int { store.ink }
    var roundInk: Int { ink - inkAt }
    var progress: LocalizedStringKey { "carta \(answered + 1) de até \(FeedSize.cards)" }

    func guess(_ option: Int) { held = option }

    func bet(_ stake: Int) {
        guard let card, let option = held, let check = card.chunk.check else { return }
        held = nil
        let right = check.opts[safe: option]?.correct == true
        let id = card.node.id
        store.note(reading: id, passed: right ? card.chunk.id : nil, option: option,
                   guess: (card.chunk.id, right), stake: stake)
        answered += 1
        last = Outcome(card: card, correct: right, stake: stake)
        if !right && !missed.contains(where: { $0.id == id }) { missed.append(card.node) }
        // The answered concept goes to the back, so the next card changes subject.
        concepts.removeAll { $0 == id }
        concepts.append(id)
    }

    func next() {
        last = nil
        deal()
    }

    private func deal() {
        card = answered < FeedSize.cards ? store.feedCard(concepts).map { Card(node: $0.node, chunk: $0.chunk) } : nil
    }
}
