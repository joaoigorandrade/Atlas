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

    /// How a step closed. The plan is bought and given back off these:
    /// `socratic.ts`'s `advance`.
    private enum Resolution { case unaided, hint, told }

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
    /// How many probes this pass plans to run. Read off the material when the
    /// first one lands, then earned and given back as the learner goes.
    private var total = 0
    private var resolutions: [Resolution] = []
    /// Whether the probe on screen has already cost the learner scaffolding —
    /// a raised dial, a "stuck", or a near miss. `stepAssisted` on the web.
    private var assisted = false
    /// Which attempt the learner is on *for this probe*, which is what the
    /// judge's prompt says the number means.
    private var attempts = 0
    /// What the judge named as the misconception behind a wrong answer, rolled
    /// up across the pass — the "you keep confusing X and Y" line.
    private(set) var misconceptions: [String] = []

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The script lives in the run's warm cache — written before this screen
    /// opened when the pass ahead of it was warmed, and landing into it probe
    /// by probe when it wasn't.
    var steps: [SocraticStep] { session.store.steps(node) }

    /// The pass is over when the plan is spent — or when the stream ended short
    /// of it, which is the material's answer, not a hang. A pass that never had
    /// a probe at all is not finished, it failed: `message` and a retry, never
    /// a CTA saying they got to the end.
    var done: Bool { total > 0 && (step >= total || (!writing && step >= steps.count)) }
    /// Nothing landed and nothing is coming — the retry the screen offers.
    var failed: Bool { !writing && steps.isEmpty }

    var canSend: Bool { !judging && !answer.trimmed.isEmpty }
    /// The two escape hatches off a probe. Both spend material the generation
    /// already wrote and paid for.
    var canEscape: Bool { !judging && steps[safe: step] != nil }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo a primeira pergunta…") : message }

    /// The dial's four levels, as the web labels them.
    static func helpLabel(_ level: Int) -> String {
        switch level {
        case 0: String(localized: "Silencioso")
        case 1: String(localized: "Dica")
        case 2: String(localized: "Guiar")
        default: String(localized: "Mostre-me")
        }
    }

    func load() async {
        writing = true
        message = ""
        // The script lands probe by probe into the warm cache, which is
        // observed rather than returned. Watching it is the loop's liveness and
        // it belongs here: it used to be a view `.onChange`, which is only
        // installed on a re-render — if the whole script landed before that
        // render the screen waited on a probe that had already arrived, forever.
        watchSteps()
        landed()
        if let error = await session.store.socratic(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir esta sessão"))
        }
        writing = false
        landed()
    }

    func retry() async { await load() }

    private func watchSteps() {
        withObservationTracking { _ = steps.count } onChange: {
            Task { @MainActor in
                self.landed()
                if self.writing { self.watchSteps() }
            }
        }
    }

    /// A probe arriving is what fills a dock that was waiting on one.
    func landed() {
        if total == 0, !steps.isEmpty { total = socraticPlan(steps) }
        if log.isEmpty || awaiting { openStep() }
    }

    /// Set, never cycled: a learner at "Mostre-me" who tapped once more used to
    /// land on "Silencioso" — the tutor going quiet at the moment they asked
    /// for the most help.
    func setHelp(_ level: Int) {
        let level = max(0, min(3, level))
        if level > help { assisted = true }
        help = level
    }

    func dictated(_ text: String) { answer += answer.isEmpty ? text : " \(text)" }

    func advance() { session.advance() }

    /// "Estou travado" — the probe's own written hint, and one notch more
    /// scaffolding. The step stays open.
    func stuck() {
        guard !judging, let current = steps[safe: step] else { return }
        assisted = true
        help = min(3, help + 1)
        log.append(Turn(learner: true, text: String(localized: "Estou travado.")))
        log.append(Turn(learner: false, text: current.hint, quality: "near"))
    }

    /// "Só me conte" — the probe is taught outright and closes as told. The
    /// same `tell` the judge grades against, finally on screen.
    func tell() {
        guard !judging, let current = steps[safe: step] else { return }
        help = 3
        log.append(Turn(learner: true, text: String(localized: "Só me conte.")))
        log.append(Turn(learner: false, text: current.tell, quality: "lost"))
        close(.told)
    }

    /// The learner's answer joins the transcript on send; the verdict fills in
    /// beside it. Their words are never taken back by a failed judge — the turn
    /// comes back out of the transcript and back into the composer, so the same
    /// answer can be sent again without retyping it.
    func send() async {
        let text = answer.trimmed
        guard !judging, !text.isEmpty, let current = steps[safe: step] else { return }
        answer = ""
        message = ""
        attempts += 1
        let turn = Turn(learner: true, text: text)
        log.append(turn)
        judging = true
        defer { judging = false }

        do {
            let verdict: SocraticJudgement = try await api.judge("socratic", judgeContext(current, text))
            log.append(Turn(learner: false, text: verdict.response, quality: verdict.quality))
            if let missed = verdict.misconception?.trimmed, !missed.isEmpty,
               !misconceptions.contains(missed) {
                misconceptions.append(missed)
            }
            guard verdict.closesStep else {
                // A near miss or a caught error: same probe, more scaffolding.
                assisted = true
                if verdict.quality == "wrong" { help = min(3, help + 1) }
                return
            }
            let correct = verdict.quality == "correct"
            help = correct ? max(0, help - 1) : min(3, help + 1)
            close(verdict.quality == "lost" ? .told : (assisted || !correct ? .hint : .unaided))
        } catch {
            log.removeAll { $0.id == turn.id }
            answer = text
            attempts -= 1
            message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua resposta"))
        }
    }

    /// A step closing is what buys and sells probes. Three unaided answers
    /// running end the pass early; two assisted ones running buy another probe
    /// out of the spares the generation already wrote — which is the only way
    /// a spare is ever spent. Mirrors `advance` in `socratic.ts`.
    private func close(_ resolution: Resolution) {
        resolutions.append(resolution)
        if resolutions.count >= 3, total > resolutions.count,
           resolutions.suffix(3).allSatisfy({ $0 == .unaided }) {
            total = resolutions.count
        }
        let recent = resolutions.suffix(2)
        if resolutions.count >= 2, total < steps.count,
           recent.allSatisfy({ $0 != .unaided }), recent.contains(.hint) {
            total += 1
        }
        step += 1
        openStep()
    }

    /// Push the probe the pass is on, or park until it has been written.
    private func openStep() {
        guard total == 0 || step < total else { return }
        guard let probe = steps[safe: step] else { return awaiting = true }
        awaiting = false
        assisted = false
        attempts = 0
        log.append(Turn(learner: false, text: probe.prompt))
    }

    private func judgeContext(_ current: SocraticStep, _ text: String) -> [String: JSONValue] {
        var context = session.context
        // The probe, not the last thing the tutor said: on a retry that was the
        // *critique* of the previous attempt, and the judge was grading a real
        // answer against a sentence that was never a question.
        context["question"] = .string(current.prompt)
        context["reference"] = .string(current.tell)
        context["answer"] = .string(text)
        context["attempt"] = .number(Double(attempts))
        context["help"] = .number(Double(help))
        context["history"] = .array(log.suffix(8).map {
            .object(["role": .string($0.learner ? "learner" : "ai"), "text": .string($0.text)])
        })
        context["misconceptions"] = .array(current.replies.filter { $0.quality != "correct" }.map {
            .object(["label": .string($0.label), "quality": .string($0.quality)])
        })
        context["recurring"] = .array(misconceptions.map { .string($0) })
        return context
    }
}
