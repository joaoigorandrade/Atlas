import Observation
import SwiftUI

/// Screen 15's state: the probes that have been written, the transcript, the
/// scaffolding dial, and the judge in flight. The rules it enforces are the
/// web's: a correct or a told answer closes the step, a near miss or a caught
/// error earns help and another try on the same probe — and what the pass
/// *earned* decides where it hands off (`SocraticOutcome`).
@Observable
@MainActor
final class SocraticViewModel {
    struct Turn: Identifiable {
        let id = UUID()
        let learner: Bool
        let text: String
        /// A caught error, an affirmation or direct teaching — the bubble's tone.
        var quality: String?
        /// Which classic Socratic move a probe is making. Written on the
        /// opening probe of a step and nothing else, which is also what tells
        /// a restored transcript a probe from a verdict.
        var move: String?
        /// What the judge named as the wrong idea behind this answer. Said once,
        /// under the turn that caught it — the verdict's own reason, rather
        /// than a colour the learner has to interpret.
        var misconception: String?
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
    /// Read-aloud of whatever the tutor last said. Socratic is the one phase
    /// that is genuinely a conversation, and this is the half that makes it one
    /// without a screen — the mic is already the other half.
    let speaker = Speaker()

    /// How a step closed. The plan is bought and given back off these:
    /// `socratic.ts`'s `advance`.
    private typealias Resolution = SocraticResolution

    private let session: SessionViewModel
    private let api: AtlasAPI
    /// How many probes this pass plans to run. Read off the material — but only
    /// once the material is all here; see `replan`.
    private var total = 0
    private var resolutions: [Resolution] = []
    /// Whether the probe on screen has already cost the learner scaffolding —
    /// a raised dial, a "stuck", or a near miss. `stepAssisted` on the web.
    private var assisted = false
    /// Which attempt the learner is on *for this probe*, which is what the
    /// judge's prompt says the number means.
    private var attempts = 0
    /// "Só me conte" uses. Not read here — the outcome reads `resolutions` —
    /// but part of the saved pass the browser draws.
    private var tells = 0

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
    /// …except when the day's generating is spent, in which case a retry is a
    /// button that cannot work: the way out is the map, and the screen says so.
    private(set) var exhausted = false

    var canSend: Bool { !judging && !answer.trimmed.isEmpty }
    /// The two escape hatches off a probe. Both spend material the generation
    /// already wrote and paid for.
    var canEscape: Bool { !judging && steps[safe: step] != nil }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo a primeira pergunta…") : message }

    /// A targeted pass on a red gap node: finishing it unaided is what takes
    /// the gap off the map.
    var gapPass: Bool { node.gap == true }

    /// What the pass earned, once it is over. Nil until then — "done" is not
    /// automatically "understood", and this is the difference.
    var outcome: SocraticOutcome? {
        done ? socraticOutcome(resolutions, gap: gapPass) : nil
    }

    /// The one line the learner reads before they tap on. A pass that ends is
    /// otherwise indistinguishable from a pass that was earned.
    var doneLine: LocalizedStringKey {
        switch outcome {
        case .flagged: "Apoiando-se em respostas prontas — vamos reforçar a base primeiro."
        case .assisted: "Compreensão construída — com uma ajuda pelo caminho."
        default:
            gapPass
                ? "Subponto reconstruído — essa lacuna pode se fechar."
                : "Compreensão estabelecida — você reconstruiu isso sozinho."
        }
    }

    /// Where the CTA actually goes. A flagged regular pass doesn't hand off, it
    /// hands *back* — into the reading.
    var advanceLabel: LocalizedStringKey {
        switch (outcome, gapPass) {
        case (.flagged, true): "Voltar ao mapa →"
        case (.flagged, false): "Reler isto primeiro · Consume →"
        case (_, true): "Fechar a lacuna · voltar ao mapa →"
        default: "Seguir para o Feynman →"
        }
    }

    /// Amber for a flagged ending, green for one that was earned.
    var doneTint: Color {
        outcome == .flagged ? NodeState.shaky.color : NodeState.mastered.color
    }

    /// The progress rail: one segment per planned probe, coloured by how each
    /// closed. The pass buys and sells probes as it goes, so this is also the
    /// only place a learner can see that happen.
    var rail: [Color?] {
        let planned = max(total, resolutions.count, 1)
        return (0..<planned).map { index in
            guard index < resolutions.count else {
                return index == step ? Phase.socratic.tint.opacity(0.45) : nil
            }
            switch resolutions[index] {
            case .unaided: return NodeState.mastered.color
            case .hint: return NodeState.frontier.color
            case .told: return NodeState.shaky.color
            }
        }
    }

    /// What the rail says out loud — a row of capsules announces nothing.
    var railValue: Text {
        Text(verbatim: String(localized: "Pergunta \(min(step + 1, max(total, 1))) de \(max(total, 1))"))
    }

    /// The tutor's last turn, which is what read-aloud speaks.
    private var spoken: String? { log.last(where: { !$0.learner })?.text }
    var canSpeak: Bool { spoken != nil }

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
        // A pass left half-answered — on this phone, or in a browser — resumes
        // on the probe it stopped at, with its transcript and its dial. The
        // restore comes first so the steps landing behind it fill the pass that
        // was saved rather than opening a second one over the top of it.
        restore()
        // The script lands probe by probe into the warm cache, which is
        // observed rather than returned. Watching it is the loop's liveness and
        // it belongs here: it used to be a view `.onChange`, which is only
        // installed on a re-render — if the whole script landed before that
        // render the screen waited on a probe that had already arrived, forever.
        watchSteps()
        landed()
        if let error = await session.store.socratic(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "abrir esta sessão"))
            let reason = (error as? AtlasError)?.reason
            exhausted = reason == "daily_quota" || reason == "monthly_ceiling"
        }
        writing = false
        landed()
    }

    func retry() async {
        exhausted = false
        await load()
    }

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
        replan()
        if log.isEmpty || awaiting { openStep() }
    }

    /// How long the pass runs.
    ///
    /// While the script is still streaming the array in hand is a *prefix*:
    /// reading the plan off it is how a pass used to end after one question —
    /// the first probe landed, the plan came back as 1, and answering it
    /// finished the pass. So a streaming pass runs on the estimate, exactly as
    /// the web opens on `SOCRATIC_STEPS`, and the material's own plan is only
    /// read once the material is all here.
    private func replan() {
        guard !steps.isEmpty else { return }
        if writing {
            total = max(total, socraticStepEstimate)
        } else {
            // Floored at the probe the learner is on, so a pass whose stream
            // came up short is still finishable, and never past what was
            // actually written.
            total = max(min(socraticPlan(steps), steps.count), step + 1)
        }
    }

    /// Set, never cycled: a learner at "Mostre-me" who tapped once more used to
    /// land on "Silencioso" — the tutor going quiet at the moment they asked
    /// for the most help.
    func setHelp(_ level: Int) {
        let level = max(0, min(3, level))
        if level > help { assisted = true }
        help = level
        save()
    }

    func dictated(_ text: String) { answer += answer.isEmpty ? text : " \(text)" }

    /// Read the tutor's last turn out loud, or stop reading it.
    func toggleReadAloud() {
        guard let spoken else { return }
        speaker.toggle([spoken], api: api)
    }

    func stopReadAloud() { speaker.stop() }

    /// The CTA. Where it goes is the outcome's call, not the button's.
    func advance() {
        stopReadAloud()
        session.settleSocratic(outcome ?? .assisted)
    }

    /// "Estou travado" — the probe's own written hint, and one notch more
    /// scaffolding. The step stays open.
    func stuck() {
        guard !judging, let current = steps[safe: step] else { return }
        session.markWorked()
        assisted = true
        help = min(3, help + 1)
        message = ""
        log.append(Turn(learner: true, text: String(localized: "Estou travado.")))
        log.append(Turn(learner: false, text: current.hint, quality: "near"))
        save()
    }

    /// "Só me conte" — the probe is taught outright and closes as told. The
    /// same `tell` the judge grades against, finally on screen.
    func tell() {
        guard !judging, let current = steps[safe: step] else { return }
        session.markWorked()
        help = 3
        tells += 1
        message = ""
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
        session.markWorked()
        answer = ""
        message = ""
        attempts += 1
        let turn = Turn(learner: true, text: text)
        log.append(turn)
        judging = true
        defer { judging = false }

        do {
            let verdict: SocraticJudgement = try await api.judge("socratic", judgeContext(current, text))
            let named = verdict.misconception?.trimmed
            log.append(Turn(
                learner: false, text: verdict.response, quality: verdict.quality,
                misconception: verdict.quality == "correct" ? nil : (named?.isEmpty == false ? named : nil)
            ))
            // Filed run-wide before it scrolls out of the transcript: this pass
            // is discarded when it ends, the roll-up is not.
            if let named, !named.isEmpty {
                session.store.file(misconception: named, under: node.label)
            }
            guard verdict.closesStep else {
                // A near miss or a caught error: same probe, more scaffolding.
                assisted = true
                if verdict.quality == "wrong" { help = min(3, help + 1) }
                return save()
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
        save()
    }

    /// Push the probe the pass is on, or park until it has been written.
    private func openStep() {
        guard total == 0 || step < total else { return }
        guard let probe = steps[safe: step] else { return awaiting = true }
        awaiting = false
        assisted = false
        attempts = 0
        log.append(Turn(learner: false, text: probe.prompt, move: probe.move))
    }

    // MARK: - The pass, saved

    /// The pass as the row holds it — the browser's own shape, so a pass left
    /// on a phone reopens in a browser and back again.
    private var snapshot: SocraticSnapshot {
        SocraticSnapshot(
            nodeId: node.id, step: step, help: help,
            log: log.map {
                SocraticSnapshot.Turn(
                    role: $0.learner ? "learner" : "ai", text: $0.text,
                    move: $0.move, tone: Self.tone(for: $0)
                )
            },
            ruledOut: [], tells: tells, resolutions: resolutions,
            stepAssisted: assisted, total: total, awaitingNext: awaiting, done: done
        )
    }

    /// The browser colours a bubble by `tone`; this client keeps the judge's
    /// own `quality`. One mapping, both directions, so a saved pass reopens
    /// reading the way it read when it was left.
    private static func tone(for turn: Turn) -> String? {
        guard !turn.learner, turn.move == nil else { return nil }
        switch turn.quality {
        case "correct": return "affirm"
        case "near": return "neutral"
        case "wrong": return "catch"
        case "lost": return "teach"
        default: return nil
        }
    }

    private static func quality(for tone: String?) -> String? {
        switch tone {
        case "affirm": "correct"
        case "neutral": "near"
        case "catch": "wrong"
        case "teach": "lost"
        default: nil
        }
    }

    private func save() {
        // A finished pass is not resumable — the row has to say so, or the next
        // entry reopens a transcript with a CTA and nothing to answer.
        if done { session.store.clearPass(node.id) } else { session.store.note(pass: snapshot) }
    }

    /// Adopt a saved pass, if there is one for this node. A pass whose steps
    /// have not landed yet is left parked — `landed()` opens it the moment the
    /// probe it is waiting on arrives, exactly as a fresh one is.
    private func restore() {
        guard log.isEmpty, let saved = session.store.savedPass(node.id), !saved.done,
              !saved.log.isEmpty
        else { return }
        step = saved.step
        help = max(0, min(3, saved.help))
        tells = saved.tells
        resolutions = saved.resolutions
        assisted = saved.stepAssisted
        total = saved.total
        awaiting = saved.awaitingNext
        log = saved.log.map {
            Turn(
                learner: $0.role == "learner", text: $0.text,
                quality: Self.quality(for: $0.tone), move: $0.move
            )
        }
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
        // …and what this learner keeps getting wrong *everywhere else*, so a
        // repeat is named as a repeat instead of caught cold again. Seen once
        // is noise, which is why this is the run's roll-up and not this pass's.
        context["recurring"] = .array(
            recurringMisconceptions(session.store.misconceptions).map { .string($0) }
        )
        return context
    }
}
