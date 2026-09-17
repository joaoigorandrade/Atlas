import Observation
import SwiftUI

/// Produce's state: one spoken turn at a time, judged before the next is worth
/// attempting.
///
/// Its own model, and the third verdict is the reason. Every other graded phase
/// rules an answer right or wrong; this one has to name the answer that was
/// understood *and* dodged the form it existed to elicit. That verdict — `thin`
/// — reads as success to a speaker and to everyone they talk to, which is how a
/// speaker fossilizes at "good enough", so it is counted and capped here.
///
/// Judged turn by turn rather than in a batch at the end: the learner has to
/// hear how the last one landed before the next is worth attempting.
@Observable
@MainActor
final class ProduceViewModel {
    private(set) var session: ProduceSession
    private(set) var writing = true
    private(set) var judging = false
    private(set) var message = ""
    /// What they said on the open turn, before it is sent. Cleared per turn.
    var said = ""

    let dictation = Dictation()

    private let pass: SessionViewModel
    private let api: AtlasAPI
    private var judge: Task<Void, Never>?

    init(session pass: SessionViewModel, api: AtlasAPI) {
        self.pass = pass
        self.api = api
        session = ProduceSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: ProduceContent? { pass.store.turns(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Preparando uma cena…") : message
    }

    var current: ProduceTurn? { content?.turns[safe: session.index] }
    var verdict: ProduceVerdict? { current.flatMap { session.verdicts[$0.id] } }
    var settled: Bool { verdict != nil }
    var reported: Bool { session.done }
    var canSend: Bool { !said.trimmed.isEmpty && !judging && !settled }

    var total: Int { content?.turns.count ?? 0 }
    var score: Int { content.map(session.score) ?? 0 }
    var avoided: [ProduceTurn] { content.map(session.avoided) ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }

    /// One capsule per turn. `thin` draws amber, not green: understood is not
    /// the same as produced, and the rail must not say it was.
    var rail: [Color?] {
        guard let content else { return [] }
        return content.turns.map { turn in
            switch session.verdicts[turn.id] {
            case .good: NodeState.mastered.color
            case .thin: NodeState.shaky.color
            case .wrong: Palette.dangerInk
            case nil: nil
            }
        }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.produce(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar a cena"))
        }
        writing = false
    }

    func listen() {
        guard !dictation.listening else { return }
        dictation.toggle { [weak self] in self?.dictated($0) }
    }

    func dictated(_ text: String) {
        said += said.isEmpty ? text : " \(text)"
    }

    /// Send what they said. The transcript is the whole input — no audio leaves
    /// the device, and the server never sees a recording.
    func submit() {
        guard canSend, let content, let turn = current else { return }
        dictation.flush()
        judging = true
        message = ""
        session.said(said.trimmed, content)
        judge?.cancel()
        var context = pass.context
        context["mode"] = .string("produce")
        context["scene"] = .string(content.scene)
        context["cue"] = .string(turn.cue)
        context["targetForms"] = .array(turn.targetForms.map { .string($0) })
        context["answer"] = .string(said.trimmed)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let ruling: ProduceJudgement = try await api.judge("produce", sent)
                try Task.checkCancellation()
                withAnimation(Motion.enter) {
                    session.judged(ruling.verdict, read: ruling.read, content)
                }
            } catch is CancellationError {
                return
            } catch {
                message = ErrorCopy.sentence(
                    for: error, doing: String(localized: "ouvir o que você disse")
                )
            }
        }
    }

    func next() {
        guard let content else { return }
        said = ""
        withAnimation(Motion.enter) { session.next(content) }
    }

    func leave() {
        judge?.cancel()
        dictation.flush()
    }

    /// Leave for the next rung. The rung closes only on a run that cleared the
    /// gate — two thirds landed *and* at most one routed around.
    func advance() {
        leave()
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}

/// One spoken turn's ruling, off the wire.
public struct ProduceJudgement: Decodable, Sendable {
    public let verdict: ProduceVerdict
    public let read: String
}

public extension ProduceVerdict {
    var label: LocalizedStringKey {
        switch self {
        case .good: "Saiu"
        case .thin: "Entendido — mas você desviou"
        case .wrong: "Não saiu"
        }
    }

    var tint: Color {
        switch self {
        case .good: NodeState.mastered.color
        case .thin: Palette.amberInk
        case .wrong: Palette.dangerInk
        }
    }
}
