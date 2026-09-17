import Observation
import SwiftUI

/// Steelman's state: both cases written before either is judged, and a stand
/// taken with something that could undo it.
///
/// Its own model, and the gate is the reason. Every other graded phase scores an
/// answer as one thing; this one rules the two sides *independently*, because
/// scoring them together would let a learner write a superb case for their own
/// view, a shrug for the other, and pass on the average — which is exactly the
/// habit the phase exists to break.
///
/// One judge call, not two: the standard is that the weaker side is measured the
/// same way as the stronger one, and a judge shown both at once can apply it.
@Observable
@MainActor
final class SteelmanViewModel {
    private(set) var session: SteelmanSession
    private(set) var writing = true
    private(set) var judging = false
    private(set) var message = ""
    /// Which side's box the learner has open. Nil is the overview.
    var editing: String?
    var draft = ""
    var disconfirmer = ""

    let dictation = Dictation()

    private let pass: SessionViewModel
    private let api: AtlasAPI
    private var judge: Task<Void, Never>?

    init(session pass: SessionViewModel, api: AtlasAPI) {
        self.pass = pass
        self.api = api
        session = SteelmanSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: SteelmanContent? { pass.store.dispute(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Procurando o que se disputa…") : message
    }

    var reported: Bool { session.done }
    var ready: Bool { content.map(session.ready) ?? false }
    var passed: Bool { content.map(session.passed) ?? false }
    /// Both cases written, a side held, and a disconfirmer worth the name.
    var canSubmit: Bool {
        ready && session.holds != nil
            && disconfirmer.trimmed.count >= 15 && !judging
    }
    /// The close has to say which of the two happened: a thin side, or no real
    /// disconfirmer at all.
    var missedForDisconfirmer: Bool { disconfirmer.trimmed.count < 15 }

    func open(_ positionId: String) {
        editing = positionId
        draft = session.cases[positionId] ?? ""
    }

    func commit() {
        guard let editing else { return }
        session.write(editing, draft.trimmed)
        self.editing = nil
        draft = ""
    }

    func hold(_ positionId: String) {
        withAnimation(Motion.standard) { session.hold(positionId, disconfirmer: disconfirmer) }
    }

    func listen() {
        guard !dictation.listening else { return }
        dictation.toggle { [weak self] in self?.dictated($0) }
    }

    func dictated(_ text: String) {
        draft += draft.isEmpty ? text : " \(text)"
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.steelman(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "achar a disputa"))
        }
        writing = false
    }

    func submit() {
        guard canSubmit, let content, let holds = session.holds else { return }
        dictation.flush()
        judging = true
        message = ""
        session.hold(holds, disconfirmer: disconfirmer.trimmed)
        judge?.cancel()
        var context = pass.context
        context["mode"] = .string("steelman")
        context["question"] = .string(content.question)
        context["positions"] = .array(content.positions.map {
            .object([
                "id": .string($0.id),
                "label": .string($0.label),
                "heldBy": .string($0.heldBy),
                "mustCover": .array($0.mustCover.map { .string($0) }),
            ])
        })
        context["cases"] = .object(session.cases.mapValues { .string($0) })
        context["holds"] = .string(holds)
        context["answer"] = .string(disconfirmer.trimmed)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let ruling: SteelmanJudgement = try await api.judge("steelman", sent)
                try Task.checkCancellation()
                var verdicts: [String: SteelmanVerdict] = [:]
                for row in ruling.verdicts { verdicts[row.positionId] = row.verdict }
                withAnimation(Motion.enter) {
                    session.judged(verdicts, response: ruling.response)
                }
            } catch is CancellationError {
                return
            } catch {
                message = ErrorCopy.sentence(
                    for: error, doing: String(localized: "ler os dois argumentos")
                )
            }
        }
    }

    func leave() {
        judge?.cancel()
        dictation.flush()
    }

    func advance() {
        leave()
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}

/// The judge's ruling, off the wire. One row per position — the two are ruled
/// independently, which is the phase's whole standard.
public struct SteelmanJudgement: Decodable, Sendable {
    public struct Row: Decodable, Sendable {
        public let positionId: String
        public let verdict: SteelmanVerdict
        public let quote: String?
    }

    public let verdicts: [Row]
    public let response: String
}

public extension SteelmanVerdict {
    var label: LocalizedStringKey {
        switch self {
        case .strong: "Sustentou"
        case .thin: "Fraco"
        case .strawman: "Um espantalho"
        }
    }

    var tint: Color {
        switch self {
        case .strong: NodeState.mastered.color
        case .thin: Palette.amberInk
        case .strawman: Palette.dangerInk
        }
    }
}
