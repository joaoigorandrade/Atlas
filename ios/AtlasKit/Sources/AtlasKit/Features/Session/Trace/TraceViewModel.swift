import Observation
import SwiftUI

/// Trace's state: one running case, walked stage by stage, and where the chain
/// broke.
///
/// Its own model because the chain is the phase. What an answered stage
/// established stays on screen — it is the input to the next one — and the
/// report is not a score but a position: the first wrong link, because
/// everything after it was answered from somewhere the learner had already left.
@Observable
@MainActor
final class TraceViewModel {
    private(set) var session: TraceSession
    private(set) var writing = true
    private(set) var message = ""

    private let pass: SessionViewModel

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = TraceSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: TraceContent? { pass.store.chain(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Montando a cadeia, estágio por estágio…") : message
    }

    var current: TraceStage? { content?.stages[safe: session.index] }
    var walked: Int? { current.flatMap { session.walked[$0.id] } }
    var settled: Bool { walked != nil }
    var reported: Bool { session.done }

    var total: Int { content?.stages.count ?? 0 }
    var passed: Bool { content.map(session.passed) ?? false }
    /// Where the chain first broke, as a 1-based stage number for the copy.
    var brokeAt: Int? { content.flatMap(session.brokeAt).map { $0 + 1 } }

    /// The stages already walked, each with what it handed on. Not a history
    /// panel for its own sake: the link before is the input to the link on
    /// screen, and a learner who cannot see it is guessing rather than tracing.
    var soFar: [TraceStage] {
        guard let content else { return [] }
        return Array(content.stages.prefix(session.index))
    }

    var rail: [Color?] {
        guard let content else { return [] }
        return content.stages.map { stage in
            guard let step = session.walked[stage.id] else { return nil }
            return step == stage.answerIndex ? NodeState.mastered.color : NodeState.shaky.color
        }
    }

    func mark(_ index: Int) -> ChoiceMark {
        guard let current, let walked else { return .unmarked }
        if index == current.answerIndex { return .right }
        return index == walked ? .wrong : .unmarked
    }

    func step(_ index: Int) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.step(index, content) }
    }

    func next() {
        guard let content else { return }
        withAnimation(Motion.enter) { session.next(content) }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.trace(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar a cadeia"))
        }
        writing = false
    }

    /// The rung closes on an unbroken prefix, not on a fraction: a run that
    /// broke at the first link and guessed the rest has not walked the chain.
    func advance() { pass.advance(passed: passed) }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
