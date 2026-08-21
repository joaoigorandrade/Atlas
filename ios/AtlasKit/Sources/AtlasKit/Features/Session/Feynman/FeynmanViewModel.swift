import Observation
import SwiftUI

/// Screen 16's state: the rubric beats, what was taught for each, and the Gap
/// Report the judge writes. The rubric rows are never shown before the learner
/// teaches — what they never think to mention is the whole diagnostic.
@Observable
@MainActor
final class FeynmanViewModel {
    private(set) var beats: [FeynmanBeat] = []
    private(set) var writing = true
    private(set) var index = 0
    /// What was taught per beat, by beat id — the learner's own words, kept
    /// while they walk back and forth across the rail.
    private(set) var taught: [String: String] = [:]
    private(set) var judging = false
    private(set) var judgement: FeynmanJudgement?
    private(set) var message = ""
    /// One colour per beat, prepared outside the layout pass.
    private(set) var rail: [Color?] = []

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    var beat: FeynmanBeat? { beats[safe: index] }
    var isLast: Bool { index >= beats.count - 1 }
    var isFirst: Bool { index == 0 }
    /// Nothing to judge is nothing to send — a blank teach-back is not an answer.
    var canSubmit: Bool { !judging && taught.values.contains { !$0.trimmed.isEmpty } }
    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo os tópicos…") : message }

    func subPoint(at index: Int) -> String { beats[safe: index]?.subPoint ?? "" }

    func binding(for beat: FeynmanBeat) -> Binding<String> {
        // Strong on purpose: the binding lives in the view and the view model
        // lives in the view's `@State` — there is no cycle to break here.
        Binding(get: { self.taught[beat.id] ?? "" }, set: { self.taught[beat.id] = $0 })
    }

    func load() async {
        do {
            for try await landed in await api.feynman(session.context) {
                beats = landed
                rebuildRail()
            }
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever os tópicos"))
        }
        writing = false
    }

    func back() {
        withAnimation(Motion.standard) {
            index = max(0, index - 1)
            rebuildRail()
        }
    }

    func next() {
        guard !isLast else { return }
        withAnimation(Motion.standard) {
            index += 1
            rebuildRail()
        }
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
        context["answer"] = .string(beats.compactMap { taught[$0.id] }.joined(separator: "\n\n"))
        do {
            let verdict: FeynmanJudgement = try await api.judge("feynman", context)
            session.writeFeynmanGaps(verdict, beats: beats)
            judgement = verdict
        } catch {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "avaliar sua explicação"))
        }
    }

    private func rebuildRail() {
        rail = beats.indices.map {
            $0 < index ? NodeState.mastered.color : ($0 == index ? Phase.feynman.tint : nil)
        }
    }
}
