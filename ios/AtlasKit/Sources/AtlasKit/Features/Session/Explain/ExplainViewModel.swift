import Observation
import SwiftUI

/// Explain's state: the five cards revealed one at a time, then the listener's
/// misconception and the replies still worth trying.
@Observable
@MainActor
final class ExplainViewModel {
    private(set) var session: ExplainSession
    private(set) var writing = true
    private(set) var message = ""

    private let pass: SessionViewModel

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = ExplainSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: ExplainContent? { pass.store.modelExplanation(node) }
    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Montando como explicar isso…") : message
    }

    var cards: [ExplainCard] { Array(ExplainCard.allCases.prefix(session.revealed)) }
    var checking: Bool { session.checking }
    var picked: ExplainReply? { session.picked.flatMap { content?.listener.replies[safe: $0] } }
    /// The replies still on offer, by their index in the check.
    var open: [(index: Int, reply: ExplainReply)] {
        (content?.listener.replies ?? []).enumerated()
            .filter { !session.tried.contains($0.offset) }
            .map { ($0.offset, $0.element) }
    }

    func reveal() { withAnimation(Motion.standard) { session.reveal() } }

    func pick(_ index: Int) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.pick(index, content) }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.explain(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar a explicação"))
        }
        writing = false
    }

    /// On to the next rung of the plan, the rung closed on a found reply. A
    /// first-try find is a clean pass.
    func advance() { pass.advance(passed: session.passed, clean: session.tried.isEmpty) }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
