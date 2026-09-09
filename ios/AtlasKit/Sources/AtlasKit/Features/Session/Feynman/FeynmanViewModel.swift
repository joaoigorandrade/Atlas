import Observation
import SwiftUI

/// Screen 16's state: one explanation, the rubric it is diffed against, and the
/// Gap Report the judge writes.
///
/// The rubric rows are never shown before the learner teaches — what they never
/// think to mention is the whole diagnostic — and the page they teach on is
/// deliberately one blank page rather than one card per row. A card per row is
/// N short answers to N implicit questions, and the order of the cards leaks the
/// shape of the answer; the phase claims to measure a *continuous* explanation
/// produced from nothing, so that is what it asks for.
@Observable
@MainActor
final class FeynmanViewModel {
    /// The rubric is still being written. The page does not wait on it — the
    /// learner is teaching from a blank page either way — but the judge does.
    private(set) var writing = true
    /// The learner's whole explanation, as they taught it.
    var explanation = "" { didSet { save() } }
    /// The freeze scaffold has been asked for. Never on by default: it hands
    /// over "start with the problem it solves" before the learner has had the
    /// chance not to think of it, which is a piece of the diagnostic given away.
    private(set) var scaffolded = false
    private(set) var judging = false
    private(set) var reported = false
    private(set) var verdicts: [String: TeachVerdict] = [:]
    private(set) var quotes: [String: String] = [:]
    private(set) var jargon: [String] = []
    /// The naive student's reaction to the whole teach-back.
    private(set) var response = ""
    /// The previous pass's verdicts, kept across "ensinar de novo". The delta
    /// chip is the one place in the product where the learner watches the loop
    /// work on them.
    private(set) var previous: [String: TeachVerdict]?
    /// The beat whose "Corrigir" micro-pass is open, and what it has caught.
    private(set) var fixing: String?
    private(set) var fixRuledOut: [String] = []
    private(set) var fixReaction: String?
    private(set) var message = ""

    /// One recogniser for the whole screen. The editor used to build its own,
    /// and the card it lived in was keyed on the beat — walking to the next
    /// topic tore down a recogniser mid-sentence and lost what was said.
    let dictation = Dictation()

    private let session: SessionViewModel
    private let api: AtlasAPI
    /// The judge in flight. Held so leaving the screen cancels it: an
    /// unstructured task outlived the view model, and its answer landed on a
    /// report nobody would ever see.
    private var judgeTask: Task<Void, Never>?
    /// The gaps are on the map and the row has been cleared. Nothing may write
    /// the pass back after that — leaving the screen fires `onDisappear` *after*
    /// `advance()`, and one last save there resurrected the whole Gap Report on
    /// the next entry.
    private var settled = false

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The rubric lives in the run's warm cache, written ahead of this screen
    /// when Socratic warmed it and landing beat by beat when it didn't.
    var beats: [FeynmanBeat] { session.store.beats(node) }
    /// The rubric is all here, so the explanation can be diffed against the
    /// whole of it rather than against the rows that happened to have arrived.
    var ready: Bool { !writing && !beats.isEmpty }
    /// The stream died short of the rubric's floor. What landed is still a
    /// shorter test than the concept earns, and the learner is owed that fact
    /// plus the way to fix it.
    var truncated: Bool { !writing && session.store.beatsIncomplete(node) }
    /// Nothing landed and nothing is coming — the retry the screen offers
    /// instead of a bare sentence with no dock under it.
    var failed: Bool { !writing && beats.isEmpty }
    /// Nothing to judge is nothing to send — a blank teach-back is not an answer.
    var canSubmit: Bool { ready && !judging && !explanation.trimmed.isEmpty }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo os tópicos…") : message }

    /// What the primary action says. It is disabled in three different
    /// situations and the learner is owed the reason for each, on the button
    /// itself rather than nowhere.
    var submitTitle: LocalizedStringKey {
        if judging { "Seu aluno está lendo…" }
        else if !ready { "Preparando seu aluno…" }
        else if explanation.trimmed.isEmpty { "Escreva sua explicação" }
        else { "É essa a explicação →" }
    }

    // MARK: - The Gap Report

    var clean: Bool { feynmanClean(verdicts, beats) }
    var gapCount: Int { feynmanGapCount(verdicts, beats) }
    var headline: LocalizedStringKey {
        clean ? "Explicação limpa — você cobriu cada parte." : "Aqui está o que você nunca explicou."
    }

    /// The second pass against the first, as one sentence. Nil on a first pass —
    /// there is nothing to compare it to yet.
    var delta: String? {
        guard let previous else { return nil }
        let before = feynmanGapCount(previous, beats)
        return clean
            ? String(localized: "Segunda passagem · \(before) → limpo")
            : String(localized: "Segunda passagem · \(before) → \(gapCount)")
    }

    /// The rows, in rubric order, each with the verdict it now carries and what
    /// it carried last time — `wasGap` is what makes a fixed row legible as
    /// fixed rather than as one that was always green.
    struct Row: Identifiable {
        let beat: FeynmanBeat
        let verdict: TeachVerdict
        let quote: String?
        let wasGap: Bool
        var id: String { beat.id }
    }

    var rows: [Row] {
        beats.map { beat in
            Row(beat: beat, verdict: verdicts[beat.id] ?? .skipped, quote: quotes[beat.id],
                wasGap: previous.map { ($0[beat.id] ?? .skipped).isGap } ?? false)
        }
    }

    /// The learner's own explanation with the fragments that earned a verdict
    /// marked in that verdict's colour. "What I actually said" is the object of
    /// study here, and a list of abstract rubric rows beside it is not.
    var markedExplanation: AttributedString {
        var text = AttributedString(explanation)
        for row in rows {
            guard let quote = row.quote, !quote.isEmpty,
                  let range = text.range(of: quote, options: .caseInsensitive)
            else { continue }
            text[range].foregroundColor = row.verdict.color
            text[range].underlineStyle = .single
        }
        return text
    }

    /// The open micro-pass, if any — the probe and the replies still on offer.
    var fix: (beat: FeynmanBeat, fix: FeynmanFix)? {
        guard let fixing, let beat = beats.first(where: { $0.id == fixing }), let fix = beat.fix
        else { return nil }
        return (beat, fix)
    }

    func ruledOut(_ reply: FeynmanFix.Reply) -> Bool { fixRuledOut.contains(reply.label) }

    // MARK: - Loading

    func load() async {
        // A pass parked mid-explanation — or sitting on its Gap Report — comes
        // back exactly as it was left. This phase is five to fifteen minutes of
        // hard writing, and it was the only one that forgot it happened.
        if let saved = session.store.savedTeachBack(node.id) { adopt(saved) }
        writing = true
        message = ""
        if let error = await session.store.feynman(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever os tópicos"))
        }
        writing = false
    }

    func retry() async { await load() }

    /// Leaving the screen with the judge still reading. The pass is saved; the
    /// verdict is not owed to anyone.
    func leave() {
        judgeTask?.cancel()
        dictation.flush()
        save()
    }

    private func adopt(_ saved: FeynmanSnapshot) {
        explanation = saved.explanation
        scaffolded = saved.scaffolded
        verdicts = saved.verdicts
        quotes = saved.quotes
        jargon = saved.jargon
        response = saved.response
        previous = saved.previous
        reported = saved.reported
        fixing = saved.fixing
        fixRuledOut = saved.fixRuledOut
        fixReaction = saved.fixReaction
    }

    private var snapshot: FeynmanSnapshot {
        FeynmanSnapshot(
            nodeId: node.id, started: true, scaffolded: scaffolded,
            explanation: explanation, response: response, pending: false,
            verdicts: verdicts, quotes: quotes, jargon: jargon, previous: previous,
            reported: reported, fixing: fixing, fixRuledOut: fixRuledOut,
            fixReaction: fixReaction
        )
    }

    /// Park the pass. The store's own debounce is what makes a page of typing
    /// one request rather than four hundred.
    private func save() {
        guard !settled else { return }
        session.store.note(teachBack: snapshot)
    }

    // MARK: - Teaching

    /// "Estou travado". The nudge is a scaffold, not a banner: it costs the
    /// learner the chance to have thought of the framing themselves, so it is
    /// spent on request and recorded as spent.
    func scaffold() {
        withAnimation(Motion.standard) { scaffolded = true }
        save()
    }

    /// The whole teach-back is judged at once: a rubric row is about the
    /// explanation end to end, not about the box it happened to be typed in.
    /// The gaps it finds land on the map on the way *out* of the phase, never
    /// from here — a learner who reads the report and backs out has not
    /// mutated their map.
    func submit() {
        guard canSubmit else { return }
        // The spoken half of the explanation goes in before it is read.
        dictation.flush()
        judging = true
        // The error sentence is about the attempt that failed, and the next
        // attempt is not that one. Nothing used to clear it — not the retry
        // that succeeded, not teaching again — so the screen kept telling the
        // learner it couldn't grade them long after it had.
        message = ""
        judgeTask?.cancel()
        judgeTask = Task { [beats] in
            defer { judging = false }
            var context = session.context
            context["rubric"] = .array(beats.map {
                .object(["subPoint": .string($0.subPoint), "mustConvey": .array($0.mustConvey.map { .string($0) })])
            })
            context["answer"] = .string(explanation.trimmed)
            do {
                let verdict: FeynmanJudgement = try await api.judge("feynman", context)
                guard !Task.isCancelled else { return }
                let read = feynmanVerdicts(verdict, beats)
                verdicts = read.verdicts
                quotes = read.quotes
                jargon = verdict.jargon ?? []
                response = verdict.response
                withAnimation(Motion.enter) { reported = true }
                save()
            } catch {
                guard !Task.isCancelled else { return }
                message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua explicação"))
            }
        }
    }

    /// Teach it again — with the rows still owed named, not from a blank page
    /// again. A shorter, more targeted, more likely-to-be-attempted loop than
    /// re-teaching the whole concept, and the verdicts of this pass are kept so
    /// the next report can show the delta.
    func teachAgain() {
        previous = verdicts
        withAnimation(Motion.enter) {
            reported = false
            fixing = nil
        }
        fixRuledOut = []
        fixReaction = nil
        message = ""
        save()
    }

    /// A pass has been taught before. The rows still owed are only named on a
    /// *second* pass — on a first one the whole rubric is exactly what must
    /// stay hidden.
    var hasPreviousPass: Bool { previous != nil }

    /// The rows the second pass is asked for by name. Empty after a clean pass,
    /// which is why "ensinar de novo" then reads as a plain fresh start.
    var stillOwed: [String] {
        rows.filter { $0.verdict.isGap }.map(\.beat.subPoint)
    }

    // MARK: - "Corrigir" — the targeted micro-pass

    /// One probe aimed straight at one red row. It is written and paid for on
    /// every generation (`validateFeynmanBeat` fails without it); drawing it is
    /// the difference between "here is what you got wrong" and "here, fix it
    /// now".
    func openFix(_ beat: FeynmanBeat) {
        withAnimation(Motion.standard) { fixing = beat.id }
        fixRuledOut = []
        fixReaction = nil
        save()
    }

    func closeFix() {
        withAnimation(Motion.standard) { fixing = nil }
        fixRuledOut = []
        fixReaction = nil
        save()
    }

    func answerFix(_ reply: FeynmanFix.Reply) {
        guard let open = fix, !ruledOut(reply) else { return }
        guard reply.correct else {
            // Caught: surface the correction, rule this one out, keep trying.
            withAnimation(Motion.standard) {
                fixReaction = reply.response
                fixRuledOut.append(reply.label)
            }
            save()
            return
        }
        // Gap closed: the sub-point flips to good and won't write back.
        withAnimation(Motion.standard) {
            verdicts[open.beat.id] = .good
            fixing = nil
        }
        fixRuledOut = []
        fixReaction = nil
        save()
    }

    // MARK: - Leaving

    /// The gaps as they finally stand go on the map, and the pass is closed.
    func advance() {
        settled = true
        session.settleFeynman(verdicts, beats: beats, quotes: quotes)
        session.advance()
    }
}
