import Observation
import SwiftUI

/// Perform's state: one real case, the work as the learner showed it, and the
/// run report.
///
/// Its own model, and the gate is the reason. Recall takes partial credit
/// because memory is partial; a run does not — a wrong intermediate result is a
/// failed run of that step however much of the rest was right, and every
/// load-bearing step has to have actually been carried out. Two phases that both
/// grade free text, with two different standards for what counts as having done
/// it.
@Observable
@MainActor
final class PerformViewModel {
    private(set) var session: PerformSession
    private(set) var writing = true
    private(set) var judging = false
    private(set) var message = ""
    var work = ""

    let dictation = Dictation()

    private let pass: SessionViewModel
    private let api: AtlasAPI
    private var judge: Task<Void, Never>?

    init(session pass: SessionViewModel, api: AtlasAPI) {
        self.pass = pass
        self.api = api
        session = PerformSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: PerformContent? { pass.store.runCase(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Montando um caso real…") : message
    }

    var reported: Bool { session.reported }
    var nudged: Bool { session.nudged }
    var response: String { session.response }
    var canSubmit: Bool { !judging && !work.trimmed.isEmpty }
    var steps: [PerformStep] { content?.steps ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }
    /// The two ways a run fails, kept apart because they are different failures:
    /// a wrong result, and a load-bearing step that never happened.
    var broken: [PerformStep] { content.map(session.broken) ?? [] }
    var skipped: [PerformStep] { content.map(session.skipped) ?? [] }

    func verdict(_ step: PerformStep) -> TeachVerdict { session.ran[step.id] ?? .skipped }
    func quote(_ step: PerformStep) -> String? { session.quotes[step.id] }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.perform(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "montar o caso"))
        }
        writing = false
    }

    /// The nudge, spent on request. Never a step of the answer — a run carried
    /// out from a walkthrough is not a run carried out.
    func nudge() {
        withAnimation(Motion.standard) { session.nudged = true }
    }

    func listen() {
        guard !dictation.listening else { return }
        dictation.toggle { [weak self] in self?.dictated($0) }
    }

    func dictated(_ text: String) {
        work += work.isEmpty ? text : " \(text)"
    }

    /// A re-run keeps the case and clears the work: running it again is the
    /// point, and the case is the same case.
    func rerun() {
        work = ""
        withAnimation(Motion.enter) { session = PerformSession(nodeId: node.id) }
    }

    func leave() {
        judge?.cancel()
        dictation.flush()
    }

    /// The checker is given the case as well as the steps, so it grades what the
    /// work produced *on this case* rather than whether the method sounds right.
    func submit() {
        guard canSubmit, let content else { return }
        dictation.flush()
        judging = true
        message = ""
        session.work = work.trimmed
        session.pending = true
        judge?.cancel()
        let steps = content.steps
        var context = pass.context
        context["mode"] = .string("perform")
        context["task"] = .string(content.task)
        context["rubric"] = .array(steps.map {
            .object([
                "subPoint": .string($0.step),
                "mustConvey": .array($0.mustShow.map { .string($0) }),
            ])
        })
        context["answer"] = .string(session.work)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let verdict: FeynmanJudgement = try await api.judge("perform", sent)
                try Task.checkCancellation()
                for row in verdict.verdicts {
                    guard let step = steps[safe: row.i] else { continue }
                    session.ran[step.id] = TeachVerdict(rawValue: row.verdict) ?? .skipped
                    if let quote = row.quote?.trimmed, !quote.isEmpty { session.quotes[step.id] = quote }
                }
                session.response = verdict.response
                session.pending = false
                withAnimation(Motion.enter) { session.reported = true }
            } catch is CancellationError {
                return
            } catch {
                session.pending = false
                message = ErrorCopy.sentence(
                    for: error, doing: String(localized: "conferir sua execução")
                )
            }
        }
    }

    func advance() {
        leave()
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
