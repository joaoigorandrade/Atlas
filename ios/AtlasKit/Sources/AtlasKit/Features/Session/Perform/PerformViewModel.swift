import Observation
import PencilKit
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
    var work = "" { didSet { if work != oldValue { park() } } }
    /// Their drawing, read by the checker beside the work. ponytail: held in
    /// memory only — not parked, so it does not survive leaving the screen or
    /// hand off to the web. Park it (as strokes) when someone asks.
    var drawing = PKDrawing()

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
    var pending: Bool { session.pending }
    var canSubmit: Bool { !judging && (!work.trimmed.isEmpty || !drawing.strokes.isEmpty) }
    var steps: [PerformStep] { content?.steps ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }
    /// The two ways a run fails, kept apart because they are different failures:
    /// a wrong result, and a load-bearing step that never happened.
    var broken: [PerformStep] { content.map(session.broken) ?? [] }
    var skipped: [PerformStep] { content.map(session.skipped) ?? [] }

    func verdict(_ step: PerformStep) -> TeachVerdict { session.ran[step.id] ?? .skipped }
    func quote(_ step: PerformStep) -> String? { session.quotes[step.id] }

    // MARK: - Parking (`phaseParking.ts`)

    /// The web's `PerformSession`, field for field, so a run left on one
    /// client reopens on the other. Long-form work the learner typed: leaving
    /// the screen, or a failed run, must not throw it away.
    private struct Parked: Codable {
        var nodeId: String
        var work: String
        var nudged: Bool
        var response: String
        var pending: Bool
        var ran: [String: TeachVerdict]
        var quotes: [String: String]
        var reported: Bool
        var previous: [String]?
        var fixing: [String]?
    }

    /// Mirror the pass into the node's `perform` slot, keeping whatever else
    /// the slot holds (a night hold's `opensAt`).
    private func park() {
        guard restored else { return }
        let parked = Parked(
            nodeId: node.id, work: work, nudged: session.nudged, response: session.response,
            pending: false, ran: session.ran, quotes: session.quotes, reported: session.reported,
            previous: previous.isEmpty ? nil : previous, fixing: fixing.isEmpty ? nil : fixing
        )
        guard let value = try? JSONValue(encoding: parked), var fields = value.fields else { return }
        let store = pass.store
        if let held = store.phaseProgress[node.id]?.fields?["perform"]?.fields?["opensAt"] {
            fields["opensAt"] = held
        }
        var forNode = store.phaseProgress[node.id]?.fields ?? [:]
        forNode["perform"] = .object(fields)
        store.phaseProgress[node.id] = .object(forNode)
    }

    /// Forget the parked copy once the rung closes — leaving it would resume a
    /// pass the node has already passed (`dropParked`).
    private func dropParked() {
        let store = pass.store
        guard var forNode = store.phaseProgress[node.id]?.fields,
              var slot = forNode["perform"]?.fields else { return }
        for key in ["nodeId", "work", "nudged", "response", "pending", "ran", "quotes",
                    "reported", "previous", "fixing"] { slot[key] = nil }
        forNode["perform"] = slot.isEmpty ? nil : .object(slot)
        store.phaseProgress[node.id] = .object(forNode)
    }

    /// Set once the parked pass has been read back, so the restore itself is
    /// not written straight back out.
    private var restored = false

    private func restore() {
        defer { restored = true }
        guard !restored,
              let slot = pass.store.phaseProgress[node.id]?.fields?["perform"],
              let parked = try? slot.decode(Parked.self), parked.nodeId == node.id else { return }
        session.nudged = parked.nudged
        session.response = parked.response
        session.ran = parked.ran
        session.quotes = parked.quotes
        session.reported = parked.reported
        previous = parked.previous ?? []
        fixing = parked.fixing ?? []
        rerunning = !previous.isEmpty
        work = parked.work
        session.work = parked.work
    }

    func load() async {
        restore()
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
        park()
    }

    /// Where the last run broke, quoted on the re-run (W1.4).
    private(set) var previous: [String] = []
    /// True once this learner has re-run the case, even when nothing broke.
    private(set) var rerunning = false
    /// The steps a failed run broke at, once it is being fixed in place. One
    /// fix per case — a second failure gets a new case.
    private(set) var fixing: [String] = []
    var canFix: Bool { reported && !passed && fixing.isEmpty }
    /// True for a step whose answer the report shows: the run failed after
    /// its one fix, and this step is among what it owed.
    func revealsAnswer(_ step: PerformStep) -> Bool {
        reported && !passed && !fixing.isEmpty
            && (broken.isEmpty ? skipped : broken).contains { $0.id == step.id }
    }

    /// Fix it on this case: keep the work, clear the report, and submit again.
    func fix() {
        fixing = (broken.isEmpty ? skipped : broken).map(\.step)
        withAnimation(Motion.enter) {
            session.reported = false
            session.pending = false
            session.response = ""
            session.ran = [:]
            session.quotes = [:]
        }
        park()
    }

    /// Run it again — on a new case. Re-running the case whose report just
    /// named the wrong step tests reading the report, not the procedure. The
    /// failed run is logged first, which bumps the server's `rerun`, so the
    /// case that arrives is one this learner has not seen.
    func rerun() {
        previous = broken.map(\.step)
        rerunning = true
        fixing = []
        work = ""
        drawing = PKDrawing()
        withAnimation(Motion.enter) { session = PerformSession(nodeId: node.id) }
        park()
        Task {
            await pass.store.postAttempt(node, .perform, passed: false)
            pass.store.forgetContent("perform", node)
            await load()
        }
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
        if let sketch = drawing.judgeDataURL { context["sketch"] = .string(sketch) }
        let sent = context
        judge = Task {
            defer { judging = false }
            do {
                // The verdicts stream first: the report opens on them while
                // the checker's comment is still being written.
                let verdict: FeynmanJudgement = try await api.judge("perform", sent) { frame in
                    guard let draft = try? frame.decode(PerformDraft.self) else { return }
                    await self.drafted(draft, steps)
                }
                try Task.checkCancellation()
                apply(verdict.verdicts, steps)
                session.response = verdict.response
                session.pending = false
                withAnimation(Motion.enter) { session.reported = true }
                park()
            } catch is CancellationError {
                return
            } catch {
                // Settle first: a stream that died mid-comment must not leave
                // the report pending with every action disabled.
                session.pending = false
                session.reported = false
                message = ErrorCopy.sentence(
                    for: error, doing: String(localized: "conferir sua execução")
                )
            }
        }
    }

    /// A judgement still being written: whatever of it has landed.
    private struct PerformDraft: Decodable {
        let verdicts: [FeynmanJudgement.Row]?
        let response: String?
    }

    private func drafted(_ draft: PerformDraft, _ steps: [PerformStep]) {
        guard !Task.isCancelled, session.pending else { return }
        if let rows = draft.verdicts, !rows.isEmpty {
            apply(rows, steps)
            if !session.reported { withAnimation(Motion.enter) { session.reported = true } }
        }
        if let text = draft.response, !text.isEmpty { session.response = text }
    }

    private func apply(_ rows: [FeynmanJudgement.Row], _ steps: [PerformStep]) {
        session.ran = [:]
        session.quotes = [:]
        for row in rows {
            guard let step = steps[safe: row.i] else { continue }
            session.ran[step.id] = TeachVerdict(rawValue: row.verdict) ?? .skipped
            if let quote = row.quote?.trimmed, !quote.isEmpty { session.quotes[step.id] = quote }
        }
    }

    func advance() {
        leave()
        // Right on the first run, before any fix or re-run, earns Trace (W3.2).
        if passed { dropParked() }
        pass.advance(passed: passed, clean: !rerunning && fixing.isEmpty)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
