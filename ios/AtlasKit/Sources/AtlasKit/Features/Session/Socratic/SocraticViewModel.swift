import Observation
import SwiftUI

/// Screen 15's state: the probes that have been written, the transcript, the
/// scaffolding dial, and the judge in flight. The rules it enforces are the
/// web's: a correct or a told answer closes the step, a near miss or a caught
/// error earns help and another try on the same probe.
@Observable
@MainActor
final class SocraticViewModel {
    struct Turn: Identifiable {
        let id = UUID()
        let learner: Bool
        let text: String
        /// A caught error, an affirmation or direct teaching — the bubble's tone.
        var quality: String?
    }

    private(set) var writing = true
    private(set) var step = 0
    /// The scaffolding dial, least help → most. Opens mid-dial, at Hint.
    private(set) var help = 1
    private(set) var log: [Turn] = []
    private(set) var judging = false
    /// The next probe is planned but hasn't been written yet — the stream is
    /// still going. The learner sees that it's coming rather than a dead dock.
    private(set) var awaiting = false
    private(set) var message = ""
    var answer = ""

    let dictation = Dictation()

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The script lives in the run's warm cache — written before this screen
    /// opened when the pass ahead of it was warmed, and landing into it probe
    /// by probe when it wasn't.
    var steps: [SocraticStep] { session.store.steps(node) }

    /// How many probes this pass plans to run. Read off the material, not
    /// assumed: the spares are written but only a struggling learner spends one.
    private var total: Int { steps.isEmpty ? 1 : socraticPlan(steps) }

    /// The pass is over when the plan is spent — or when the stream ended short
    /// of it, which is the material's answer, not a hang.
    var done: Bool { step >= total || (!writing && step >= steps.count) }

    var canSend: Bool { !judging && !answer.trimmed.isEmpty }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo a primeira pergunta…") : message }

    func load() async {
        landed()
        if let error = await session.store.socratic(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir esta sessão"))
        }
        writing = false
    }

    /// A probe arriving is what fills a dock that was waiting on one — the
    /// screen calls this as the script lands, and once when it opens on a
    /// script that was already warm.
    func landed() { if log.isEmpty || awaiting { openStep() } }

    func cycleHelp() { help = (help + 1) % 4 }

    func dictated(_ text: String) { answer += answer.isEmpty ? text : " \(text)" }

    func advance() { session.advance() }

    /// The learner's answer joins the transcript on send; the verdict fills in
    /// beside it. Their words are never taken back by a failed judge — the
    /// screen says the judge stumbled and the same answer can be sent again.
    func send() async {
        let text = answer.trimmed
        guard !judging, !text.isEmpty, let current = steps[safe: step] else { return }
        answer = ""
        message = ""
        log.append(Turn(learner: true, text: text))
        judging = true
        defer { judging = false }

        do {
            let verdict: SocraticJudgement = try await api.judge("socratic", judgeContext(current, text))
            log.append(Turn(learner: false, text: verdict.response, quality: verdict.quality))
            guard verdict.closesStep else {
                // A near miss or a caught error: same probe, more scaffolding.
                if verdict.quality == "wrong" { help = min(3, help + 1) }
                return
            }
            help = verdict.quality == "correct" ? max(0, help - 1) : min(3, help + 1)
            step += 1
            openStep()
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua resposta"))
        }
    }

    /// Push the probe the pass is on, or park until it has been written.
    private func openStep() {
        guard step < total else { return }
        guard let probe = steps[safe: step] else { return awaiting = true }
        awaiting = false
        log.append(Turn(learner: false, text: probe.prompt))
    }

    private func judgeContext(_ current: SocraticStep, _ text: String) -> [String: JSONValue] {
        var context = session.context
        context["question"] = .string(log.last(where: { !$0.learner })?.text ?? current.prompt)
        context["reference"] = .string(current.tell)
        context["answer"] = .string(text)
        context["attempt"] = .number(Double(log.filter(\.learner).count))
        context["help"] = .number(Double(help))
        context["history"] = .array(log.suffix(8).map {
            .object(["role": .string($0.learner ? "learner" : "ai"), "text": .string($0.text)])
        })
        context["misconceptions"] = .array(current.replies.filter { $0.quality != "correct" }.map {
            .object(["label": .string($0.label), "quality": .string($0.quality)])
        })
        return context
    }
}
