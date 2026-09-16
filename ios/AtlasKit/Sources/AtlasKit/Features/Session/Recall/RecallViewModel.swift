import Observation
import SwiftUI

/// Recall's state: a blank page, what came back on it, and the diff against a
/// rubric the learner was never shown.
///
/// Its own model rather than Feynman's. What they share is a verdict row, and
/// nothing else: Feynman grades whether a concept can be *explained to someone*
/// and docks unpacked jargon; this grades only whether it is still there, so a
/// terse correct answer scores as well as a fluent one. Two phases, two bars,
/// two prompts on the server.
@Observable
@MainActor
final class RecallViewModel {
    private(set) var session: RecallSession
    private(set) var writing = true
    private(set) var judging = false
    private(set) var message = ""
    /// What they are writing. Bound by the editor, so it is not on the session
    /// until the attempt goes in.
    var written = ""

    let dictation = Dictation()

    private let pass: SessionViewModel
    private let api: AtlasAPI
    /// The judge in flight. Held so leaving the screen cancels it.
    private var judge: Task<Void, Never>?

    init(session pass: SessionViewModel, api: AtlasAPI) {
        self.pass = pass
        self.api = api
        session = RecallSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: RecallContent? { pass.store.blankPage(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Preparando a página em branco…") : message
    }

    var reported: Bool { session.reported }
    var cued: Bool { session.cued }
    var response: String { session.response }
    var canSubmit: Bool { !judging && !written.trimmed.isEmpty }
    var rubric: [RecallRow] { content?.rubric ?? [] }
    var score: Int { content.map(session.score) ?? 0 }
    var passed: Bool { content.map(session.passed) ?? false }

    func verdict(_ row: RecallRow) -> TeachVerdict { session.retrieved[row.id] ?? .skipped }
    func quote(_ row: RecallRow) -> String? { session.quotes[row.id] }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.recall(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "preparar a página"))
        }
        writing = false
    }

    /// "Estou travado". A cue is not a piece of the answer, but a cued retrieval
    /// is a different reading than an unaided one — so it is spent on request
    /// and recorded as spent, and the judge is told.
    func cue() {
        withAnimation(Motion.standard) { session.cued = true }
    }

    func listen() {
        guard !dictation.listening else { return }
        dictation.toggle { [weak self] in self?.dictated($0) }
    }

    func dictated(_ text: String) {
        written += written.isEmpty ? text : " \(text)"
    }

    /// A second attempt starts from a blank page. Leaving the first answer in
    /// the box turns retrieval into an edit of a report they have now read.
    func again() {
        written = ""
        withAnimation(Motion.enter) { session = RecallSession(nodeId: node.id) }
    }

    func leave() {
        judge?.cancel()
        dictation.flush()
    }

    /// The rubric goes to the judge as verdict rows — the same shape Feynman's
    /// grader answers in, under an entirely different instruction. What the
    /// learner wrote is diffed against what a cold retrieval owes.
    func submit() {
        guard canSubmit, let content else { return }
        dictation.flush()
        judging = true
        message = ""
        session.written = written.trimmed
        session.pending = true
        judge?.cancel()
        let rubric = content.rubric
        var context = pass.context
        context["mode"] = .string("recall")
        context["brief"] = .string(content.brief)
        context["cued"] = .bool(session.cued)
        context["rubric"] = .array(rubric.map {
            .object([
                "subPoint": .string($0.point),
                "mustConvey": .array($0.mustRetrieve.map { .string($0) }),
            ])
        })
        context["answer"] = .string(session.written)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let verdict: FeynmanJudgement = try await api.judge("recall", sent)
                try Task.checkCancellation()
                // The judge rules by rubric index; the session keys by row id.
                // Joined here rather than anywhere a renderer can see it.
                for row in verdict.verdicts {
                    guard let owed = rubric[safe: row.i] else { continue }
                    session.retrieved[owed.id] = TeachVerdict(rawValue: row.verdict) ?? .skipped
                    if let quote = row.quote?.trimmed, !quote.isEmpty { session.quotes[owed.id] = quote }
                }
                session.response = verdict.response
                session.pending = false
                withAnimation(Motion.enter) { session.reported = true }
            } catch is CancellationError {
                return
            } catch {
                session.pending = false
                message = ErrorCopy.sentence(
                    for: error, doing: String(localized: "ler o que você recuperou")
                )
            }
        }
    }

    /// The rung closes on two thirds of the rubric. Partial credit is the honest
    /// standard for retrieval — memory is graded, not all-or-nothing.
    func advance() {
        leave()
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
