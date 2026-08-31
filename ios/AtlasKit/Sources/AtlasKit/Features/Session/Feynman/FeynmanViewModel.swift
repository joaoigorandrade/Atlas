import Observation
import SwiftUI

/// Screen 16's state: the rubric beats, what was taught for each, and the Gap
/// Report the judge writes. The rubric rows are never shown before the learner
/// teaches — what they never think to mention is the whole diagnostic.
@Observable
@MainActor
final class FeynmanViewModel {
    private(set) var writing = true
    private(set) var index = 0
    /// What was taught per beat, by beat id — the learner's own words, kept
    /// while they walk back and forth across the rail.
    private(set) var taught: [String: String] = [:]
    private(set) var judging = false
    private(set) var judgement: FeynmanJudgement?
    private(set) var message = ""

    /// One recogniser for the whole screen. The editor used to build its own,
    /// and the card it lives in is keyed on the beat — walking to the next
    /// topic tore down a recogniser mid-sentence and lost what was said.
    let dictation = Dictation()

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The rubric lives in the run's warm cache, written ahead of this screen
    /// when Socratic warmed it and landing beat by beat when it didn't.
    var beats: [FeynmanBeat] { session.store.beats(node) }
    var beat: FeynmanBeat? { beats[safe: index] }
    /// One colour per beat.
    var rail: [Color?] {
        beats.indices.map { $0 < index ? NodeState.mastered.color : ($0 == index ? Phase.feynman.tint : nil) }
    }
    var isLast: Bool { index >= beats.count - 1 }
    var isFirst: Bool { index == 0 }
    /// Nothing to judge is nothing to send — a blank teach-back is not an answer.
    var canSubmit: Bool { !judging && taught.values.contains { !$0.trimmed.isEmpty } }
    /// Nothing landed and nothing is coming — the retry the screen offers
    /// instead of a bare sentence with no dock under it.
    var failed: Bool { !writing && beats.isEmpty }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo os tópicos…") : message }

    /// What each row's verdict says in words. Colour alone is invisible to
    /// VoiceOver and indistinguishable to a colour-blind learner.
    static func verdictLabel(_ verdict: String) -> String {
        switch verdict {
        case "good": String(localized: "Bem explicado")
        case "confused": String(localized: "Errado · confuso")
        default: String(localized: "Pulado")
        }
    }

    func subPoint(at index: Int) -> String { beats[safe: index]?.subPoint ?? "" }

    func binding(for beat: FeynmanBeat) -> Binding<String> {
        // Strong on purpose: the binding lives in the view and the view model
        // lives in the view's `@State` — there is no cycle to break here.
        Binding(get: { self.taught[beat.id] ?? "" }, set: { self.taught[beat.id] = $0 })
    }

    func load() async {
        writing = true
        message = ""
        if let error = await session.store.feynman(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever os tópicos"))
        }
        writing = false
    }

    func retry() async { await load() }

    /// Teach it again with the report's rows in mind — the answers are still
    /// there, and the next verdict is the delta. The gaps the first pass wrote
    /// stay on the map; a later pass is what takes them off.
    func teachAgain() {
        judgement = nil
        index = 0
    }

    func back() {
        withAnimation(Motion.standard) { index = max(0, index - 1) }
    }

    func next() {
        guard !isLast else { return }
        withAnimation(Motion.standard) { index += 1 }
    }

    func advance() { session.advance() }

    /// The whole teach-back is judged at once: a rubric row is about the
    /// explanation end to end, not about the box it happened to be typed in.
    /// The gaps it finds land on the map through the session, never from here.
    func submit() async {
        guard !judging, !beats.isEmpty else { return }
        judging = true
        defer { judging = false }
        var context = session.context
        context["rubric"] = .array(beats.map {
            .object(["subPoint": .string($0.subPoint), "mustConvey": .array($0.mustConvey.map { .string($0) })])
        })
        // One monologue in rail order, with the parts they never wrote simply
        // absent — which is exactly what a skipped rubric row looks like.
        // `compactMap` alone kept the blanks and shifted nothing.
        context["answer"] = .string(
            beats.compactMap { taught[$0.id]?.trimmed }.filter { !$0.isEmpty }.joined(separator: "\n\n")
        )
        do {
            let verdict: FeynmanJudgement = try await api.judge("feynman", context)
            session.writeFeynmanGaps(verdict, beats: beats)
            judgement = verdict
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua explicação"))
        }
    }
}
