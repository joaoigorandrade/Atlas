import Observation
import SwiftUI

/// Screen 18's state: the ladder of problems, the learner's work, and the
/// transfer diagnostic. A failure is the diagnostically rich outcome, not the
/// wasted one — but the writes it triggers live on the session, so this holds
/// only what is on screen.
@Observable
@MainActor
final class CrucibleViewModel {
    private(set) var content: CrucibleContent?
    /// [0] the novel transfer, [1] the scaffolded re-attempt.
    private(set) var rung = 0
    private(set) var hinted = false
    private(set) var judging = false
    private(set) var judgement: CrucibleJudgement?
    private(set) var message = ""
    var work = ""

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    var problem: CrucibleProblem? { content?.problems[safe: rung] }
    var canSubmit: Bool { !judging && !work.trimmed.isEmpty }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo um problema novo…") : message }
    /// A confirmed transfer ends the pass; so does running out of rungs.
    var isSettled: Bool { judgement?.passed == true || rung >= (content?.problems.count ?? 0) - 1 }
    var reExplanation: String { judgement?.reExplain ?? content?.reExplain ?? "" }

    func showHint() { hinted = true }

    func load() async {
        var context = session.context
        context["masteredLabels"] = .array(session.learnedElsewhere.map { .string($0.label) })
        do {
            content = try await api.crucible(context)
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever seu problema"))
        }
    }

    /// The only path to green, and the only path to a spawned gap — both live in
    /// `SessionViewModel.settleCrucible`, so nothing here touches the map.
    func submit() async {
        guard !judging, let content, let problem else { return }
        judging = true
        defer { judging = false }
        var context = session.context
        context["problem"] = .string(problem.q)
        context["hint"] = .string(problem.hint)
        context["answer"] = .string(work)
        do {
            let verdict: CrucibleJudgement = try await api.judge("crucible", context)
            session.settleCrucible(verdict, gap: content.gap)
            judgement = verdict
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua tentativa"))
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
