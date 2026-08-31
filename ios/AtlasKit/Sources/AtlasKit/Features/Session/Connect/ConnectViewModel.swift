import Observation
import SwiftUI

/// Screen 17's state: the candidate prior nodes off the learner's own map, the
/// relationship drafts, and which links have been confirmed. Every candidate is
/// a real node they already own, so every link is true rather than trivia.
@Observable
@MainActor
final class ConnectViewModel {
    private(set) var linked: Set<String> = []
    private(set) var message = ""
    private(set) var writing = true
    private var drafts: [String: String] = [:]
    private var active: String?

    /// One recogniser for the screen — the link editor is rebuilt on every
    /// candidate, and a recogniser rebuilt with it loses what was being said.
    let dictation = Dictation()

    private let session: SessionViewModel

    init(session: SessionViewModel) {
        self.session = session
    }

    var node: ConceptNode { session.node }
    /// The web lives in the run's warm cache — drawn while the learner was
    /// still teaching the concept back, when Feynman warmed it.
    var content: ElaborationContent? { session.store.web(node) }
    var waitingCopy: String { message.isEmpty ? String(localized: "Procurando o que você já sabe…") : message }

    /// The candidate the prompt is asking about: the one being edited, else the
    /// first still unlinked.
    var candidate: ElaborationLink? {
        guard let content else { return nil }
        return content.cands.first { $0.id == active } ?? content.cands.first { !linked.contains($0.id) }
    }

    /// The confirmed links, in the order the generation laid them out — raw
    /// material for a review card.
    var confirmed: [ElaborationLink] {
        content?.cands.filter { linked.contains($0.id) } ?? []
    }

    /// What the learner has written, and nothing else. The map's own phrasing
    /// is still there — `suggest` puts it in the box on request — but handing
    /// it over unasked turns generation into recognition: they read a plausible
    /// sentence, confirm, and encode almost nothing (`connect.ts`).
    func text(for candidate: ElaborationLink) -> String { drafts[candidate.id] ?? "" }

    /// The back of the card this link drafts: their sentence, or the map's when
    /// they never wrote one.
    func back(for candidate: ElaborationLink) -> String {
        let written = text(for: candidate).trimmed
        return written.isEmpty ? candidate.rel : written
    }

    func draft(_ candidate: ElaborationLink) -> Binding<String> {
        Binding(get: { self.text(for: candidate) }, set: { self.drafts[candidate.id] = $0 })
    }

    /// "Ver a sugestão do mapa" — offered, never imposed, and gone once there
    /// is anything of theirs to overwrite.
    func suggest(_ candidate: ElaborationLink) { drafts[candidate.id] = candidate.rel }
    func canSuggest(_ candidate: ElaborationLink) -> Bool { text(for: candidate).trimmed.isEmpty }

    func canConfirm(_ candidate: ElaborationLink) -> Bool { !text(for: candidate).trimmed.isEmpty }

    func confirm(_ candidate: ElaborationLink) {
        linked.insert(candidate.id)
        active = content?.cands.first { !linked.contains($0.id) }?.id
    }

    /// Pick any node on the web, including one already linked — the order the
    /// generation happened to emit is not the order the learner has to work in.
    func select(_ candidate: ElaborationLink) { active = candidate.id }

    /// Two real connections is the design's gate — but a web that only ever
    /// offered one candidate cannot produce two, and a gate nobody can pass is
    /// a dead end. Mirrors `connectReady`.
    var ready: Bool {
        linked.count >= min(2, max(1, content?.cands.count ?? 1))
    }

    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }

    /// Understood and wired, but nothing has proven it transfers yet — that is
    /// exactly Shaky, and the write lives on the session.
    ///
    /// Every confirmed link also becomes a real review card. That was the whole
    /// promised product of the phase — the screen counted them out loud — and
    /// nothing was ever written: the learner's own sentence died with the view.
    func advance() {
        draftCards()
        session.finishConnect()
        session.advance()
    }

    /// One card per confirmed link, keyed by the link's own identity so redoing
    /// the phase rewrites in place instead of stacking a second copy into the
    /// queue. Mirrors `connectCards` + `advanceFromConnect`.
    private func draftCards() {
        guard let content else { return }
        for candidate in confirmed {
            let card = ReviewCard(
                id: "\(content.centerId)-connect-\(candidate.id)",
                type: .why,
                source: "Connect",
                node: node.id,
                cloze: nil,
                answer: nil,
                front: String(localized: "\(content.centerLabel) ↔ \(candidate.label): qual é a conexão?"),
                back: back(for: candidate),
                reExplain: nil
            )
            // Keep the scheduler state of a card that already exists: redoing
            // Connect must not reset a link the learner has been reviewing.
            if let index = session.store.cards.firstIndex(where: { $0.id == card.id }) {
                var existing = session.store.cards[index]
                existing.card = card
                session.store.cards[index] = existing
            } else {
                session.store.cards.append(ScheduledCard(card))
            }
        }
    }

    func load() async {
        // Nothing owned yet is nothing true to wire into: the phase has no
        // material, so it hands the node straight on rather than asking the
        // learner to link concepts they have never met. The store answers the
        // same way — an empty pool is no generation at all.
        guard !session.learnedElsewhere.isEmpty else { return advance() }
        writing = true
        message = ""
        if let error = await session.store.connect(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar sua teia"))
        }
        writing = false
    }

    func retry() async { await load() }
}
