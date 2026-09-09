import Observation
import SwiftUI

/// Screen 18's state: the confidence tap, the ladder of problems, the learner's
/// work, and the transfer diagnostic. A failure is the diagnostically rich
/// outcome, not the wasted one — but the writes it triggers live on the
/// session, so this holds only what is on screen.
@Observable
@MainActor
final class CrucibleViewModel {
    /// State confidence, then work. The tap comes *before* the problem is
    /// revealed or it measures nothing.
    enum Stage { case confidence, work }

    /// Stated confidence, least → most solid. `CRUCIBLE_FELT` on the web.
    enum Confidence: Int, CaseIterable, Identifiable {
        case unsure, fairly, very
        var id: Int { rawValue }

        var label: LocalizedStringKey {
            switch self {
            case .unsure: "Não tenho certeza"
            case .fairly: "Bastante confiante"
            case .very: "Muito confiante"
            }
        }

        /// The one-line consequence of each choice, so the tap is a considered
        /// reading rather than three identical buttons.
        var note: LocalizedStringKey {
            switch self {
            case .unsure: "Acho que vou travar em alguma parte."
            case .fairly: "Consigo, com algum esforço."
            case .very: "Consigo sem hesitar, em qualquer contexto."
            }
        }

        var felt: Int {
            switch self {
            case .unsure: 35
            case .fairly: 65
            case .very: 90
            }
        }
    }

    /// What a failed attempt hands down to the rung below it. The scaffolded
    /// problem's own copy promises "com o que faltou já nomeado" — before this
    /// it named nothing, and the learner had to remember the report they had
    /// just been shown.
    struct Missing {
        let label: String
        let reExplain: String
    }

    private(set) var stage = Stage.confidence
    private(set) var confidence: Confidence?
    /// [0] the novel transfer, [1] the scaffolded re-attempt.
    private(set) var rung = 0
    private(set) var hinted = false
    /// Whether the hint was open when the attempt went to the judge. `hinted`
    /// is a toggle the learner can close again; this is the reading.
    private(set) var leaned = false
    private(set) var judging = false
    private(set) var judgement: CrucibleJudgement?
    private(set) var missing: Missing?
    private(set) var message = ""
    private(set) var writing = true
    var work = ""

    let dictation = Dictation()

    private let session: SessionViewModel
    private let api: AtlasAPI
    /// The judge in flight. Held so leaving the screen cancels it — an
    /// unstructured task used to land twenty seconds later and repaint the map
    /// with no report and no explanation.
    private var judge: Task<Void, Never>?

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The ladder lives in the run's warm cache — written while the learner was
    /// still wiring the concept in, when Connect warmed it.
    var content: CrucibleContent? { session.store.problems(node) }
    var problem: CrucibleProblem? { content?.problems[safe: rung] }
    var canSubmit: Bool { !judging && !work.trimmed.isEmpty }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo um problema novo…") : message }
    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }
    /// How many rungs this pass has, for the "attempt 1 of 2" the screen shows.
    var rungs: Int { content?.problems.count ?? 0 }
    /// A confirmed transfer ends the pass; so does running out of rungs.
    var isSettled: Bool { judgement?.passed == true || rung >= rungs - 1 }
    var reExplanation: String { judgement?.reExplain ?? content?.reExplain ?? "" }

    /// What each transfer row says in words. Two 8pt dots, green and red, were
    /// the sole carrier of "this carried over" before.
    static func transferLabel(_ verdict: String) -> String {
        verdict == "good" ? String(localized: "Atravessou") : String(localized: "Não atravessou")
    }

    /// The verdict headline. It used to claim "a framing you have never seen —
    /// that is mastery" for the *scaffolded* rung too, which is the one problem
    /// on the ladder the learner was walked into.
    var verdictHeadline: String {
        guard judgement?.passed == true else {
            return String(localized: "Parte disso atravessou, parte não. O que ficou está no seu mapa agora — em vermelho, sob o conceito.")
        }
        if rung == 0 {
            return String(localized: "\(node.label) atravessou para um enquadramento que você nunca viu. Isso é domínio.")
        }
        return String(localized: "\(node.label) atravessou no degrau com apoio. O conceito está firme — e a transferência a frio continua sendo o próximo teste.")
    }

    /// Said plainly, because the judge was told too: a pass on a reframe you
    /// were handed is a different reading than one you found yourself.
    var hintNote: String {
        guard leaned, judgement != nil else { return "" }
        return String(localized: "Você abriu a dica antes de responder, então o enquadramento veio pronto. Isso conta — a leitura de confiança abaixo já desconta essa ajuda.")
    }

    /// The calibration read-back: what they said they felt, held against what
    /// happened. Overconfidence is the thing this phase exists to catch — and
    /// underconfidence costs the learner just as much, so a pass no longer
    /// answers "aligned" to all three taps.
    var calibration: String {
        guard let judgement, let confidence else { return "" }
        guard judgement.passed else {
            switch confidence {
            case .very:
                return String(localized: "Você disse “Muito confiante” — e a transferência na primeira tentativa ainda quebrou. Essa distância entre a sensação e o resultado é exatamente o excesso de confiança que esta fase existe para pegar.")
            case .unsure:
                return String(localized: "Você sinalizou baixa confiança, e o ponto instável era real — isso é bem calibrado. Agora feche essa lacuna.")
            case .fairly:
                return String(localized: "Você se sentiu razoavelmente confiante, mas um subconceito não se transferiu. Registre a diferença entre se sentir pronto e estar pronto.")
            }
        }
        switch confidence {
        case .very:
            return String(localized: "Você disse “Muito confiante” e a transferência confirmou. Confiança e resultado se alinham — isso é domínio calibrado, não fluência.")
        case .fairly:
            return String(localized: "Confiança e resultado agora se alinham — isso é domínio calibrado, não fluência.")
        case .unsure:
            return String(localized: "Você disse “Não tenho certeza” — e atravessou mesmo assim. Você sabe mais do que sente que sabe, e subestimar-se custa tanto quanto o excesso de confiança.")
        }
    }

    /// The tap that opens the problem, and the only reading this phase takes.
    func state(_ confidence: Confidence) {
        self.confidence = confidence
        withAnimation(Motion.enter) { stage = .work }
    }

    /// Reversible, and the button says which way it goes — the hint used to be
    /// one-way and looked identical either side of the tap.
    func toggleHint() { withAnimation(Motion.standard) { hinted.toggle() } }

    func load() async {
        writing = true
        message = ""
        if let error = await session.store.crucible(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever seu problema"))
        }
        writing = false
    }

    func retryLoad() async { await load() }

    /// Leaving abandons the attempt. The verdict that lands after the learner
    /// has gone would rewrite the map behind their back.
    func leave() {
        dictation.flush()
        judge?.cancel()
        judge = nil
    }

    /// The only path to green, and the only path to a spawned gap — both live
    /// in `SessionViewModel.settleCrucible`, so nothing here touches the map.
    func submit() {
        guard !judging, let content, let problem else { return }
        judging = true
        message = ""
        leaned = hinted
        let leaned = hinted
        let first = rung == 0
        var context = session.context
        context["problem"] = .string(problem.q)
        context["hint"] = .string(problem.hint)
        context["answer"] = .string(work)
        // The Crucible is the app's only measurement of transfer, and a pass on
        // a reframe that was handed over is not the same reading as one found
        // cold. The judge is told, and the calibration point below is discounted.
        context["hinted"] = .bool(leaned)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let verdict: CrucibleJudgement = try await api.judge("crucible", sent)
                try Task.checkCancellation()
                session.settleCrucible(verdict, gap: content.gap)
                // Stated confidence against *first-try* performance — the
                // reading screen 20 plots. `recordCalib` averages into the
                // sample it already holds, so recording the scaffolded rung too
                // produced a point that described neither attempt.
                if first, let confidence {
                    session.store.recordCalib(node.id, felt: confidence.felt,
                                              real: verdict.passed ? (leaned ? 70 : 88) : 45)
                }
                judgement = verdict
            } catch is CancellationError {
                return
            } catch {
                message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua tentativa"))
            }
        }
    }

    /// One degree easier, with what didn't carry over already named — and now
    /// actually carried onto the next screen rather than only promised there.
    func retry() {
        if let judgement {
            missing = Missing(label: judgement.gapLabel ?? content?.gap.label ?? "",
                              reExplain: judgement.reExplain ?? content?.reExplain ?? "")
        }
        judgement = nil
        rung += 1
        work = ""
        hinted = false
        leaned = false
        message = ""
    }
}
