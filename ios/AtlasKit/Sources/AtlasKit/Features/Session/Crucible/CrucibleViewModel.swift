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

        var felt: Int {
            switch self {
            case .unsure: 35
            case .fairly: 65
            case .very: 90
            }
        }
    }

    private(set) var stage = Stage.confidence
    private(set) var confidence: Confidence?
    /// [0] the novel transfer, [1] the scaffolded re-attempt.
    private(set) var rung = 0
    private(set) var hinted = false
    private(set) var judging = false
    private(set) var judgement: CrucibleJudgement?
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
    /// A confirmed transfer ends the pass; so does running out of rungs.
    var isSettled: Bool { judgement?.passed == true || rung >= (content?.problems.count ?? 0) - 1 }
    var reExplanation: String { judgement?.reExplain ?? content?.reExplain ?? "" }

    /// What each transfer row says in words. Two 8pt dots, green and red, were
    /// the sole carrier of "this carried over" before.
    static func transferLabel(_ verdict: String) -> String {
        verdict == "good" ? String(localized: "Atravessou") : String(localized: "Não atravessou")
    }

    /// The calibration read-back: what they said they felt, held against what
    /// happened. Overconfidence is the thing this phase exists to catch.
    var calibration: String {
        guard let judgement, let confidence else { return "" }
        if judgement.passed {
            return String(localized: "Confiança e resultado agora se alinham — isso é domínio calibrado, não fluência.")
        }
        switch confidence {
        case .very:
            return String(localized: "Você disse “Muito confiante” — e a transferência na primeira tentativa ainda quebrou. Essa distância entre a sensação e o resultado é exatamente o excesso de confiança que esta fase existe para pegar.")
        case .unsure:
            return String(localized: "Você sinalizou baixa confiança, e o ponto instável era real — isso é bem calibrado. Agora feche essa lacuna.")
        case .fairly:
            return String(localized: "Você se sentiu razoavelmente confiante, mas um subconceito não se transferiu. Registre a diferença entre se sentir pronto e estar pronto.")
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
        var context = session.context
        context["problem"] = .string(problem.q)
        context["hint"] = .string(problem.hint)
        context["answer"] = .string(work)
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                let verdict: CrucibleJudgement = try await api.judge("crucible", sent)
                try Task.checkCancellation()
                session.settleCrucible(verdict, gap: content.gap)
                // Stated confidence against first-try performance — the reading
                // screen 20 plots. The phase built to catch the gap between
                // feeling ready and being ready never measured it before.
                if let confidence {
                    session.store.recordCalib(node.id, felt: confidence.felt, real: verdict.passed ? 88 : 45)
                }
                judgement = verdict
            } catch is CancellationError {
                return
            } catch {
                message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua tentativa"))
            }
        }
    }

    /// One degree easier, with what didn't carry over already named.
    func retry() {
        judgement = nil
        rung += 1
        work = ""
        hinted = false
    }
}
