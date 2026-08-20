import Observation
import SwiftUI

/// Screen 17's state: the candidate prior nodes off the learner's own map, the
/// relationship drafts, and which links have been confirmed. Every candidate is
/// a real node they already own, so every link is true rather than trivia.
@Observable
@MainActor
final class ConnectViewModel {
    private(set) var content: ElaborationContent?
    private(set) var linked: Set<String> = []
    private(set) var message = ""
    private var drafts: [String: String] = [:]
    private var active: String?

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    var waitingCopy: String { message.isEmpty ? "Procurando o que você já sabe…" : message }

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

    func text(for candidate: ElaborationLink) -> String { drafts[candidate.id] ?? candidate.rel }

    /// The relationship draft, seeded from the map's own phrasing — the learner
    /// accepts it or writes over it.
    func draft(_ candidate: ElaborationLink) -> Binding<String> {
        Binding(get: { self.text(for: candidate) }, set: { self.drafts[candidate.id] = $0 })
    }

    func canConfirm(_ candidate: ElaborationLink) -> Bool { !text(for: candidate).trimmed.isEmpty }

    func confirm(_ candidate: ElaborationLink) {
        linked.insert(candidate.id)
        active = content?.cands.first { !linked.contains($0.id) }?.id
    }

    /// Understood and wired, but nothing has proven it transfers yet — that is
    /// exactly Shaky, and the write lives on the session.
    func advance() {
        session.finishConnect()
        session.advance()
    }

    func load() async {
        let pool = session.learnedElsewhere
        guard !pool.isEmpty else {
            // Nothing owned yet is nothing true to wire into: the phase has no
            // material, so it hands the node straight on rather than asking the
            // learner to link concepts they have never met.
            return advance()
        }
        var context = session.context
        context["pool"] = .array(pool.map { .object(["id": .string($0.id), "label": .string($0.label)]) })
        do {
            content = try await api.connect(context)
        } catch {
            message = ErrorCopy.sentence(for: error, doing: "montar sua teia")
        }
    }
}
