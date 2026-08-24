import Observation
import SwiftUI

/// A graded pick on a section's check. The attempt is part of it so that a
/// second miss is a second event — a haptic keyed on right-or-wrong alone stays
/// silent when the learner misses twice in a row.
struct CheckGrade: Equatable {
    let correct: Bool
    let attempt: Int
}

/// Screen 14's state: which section is being read and whether its check has
/// been passed. The sections themselves are not state here — they live in the
/// run's warm cache, which is what lets a pass written before this screen
/// opened arrive with no wait at all.
@Observable
@MainActor
final class ConsumeViewModel {
    /// The stream is still going — the last section on screen isn't the last one.
    private(set) var writing = true
    private(set) var index = 0
    /// The check's picked option for the section on screen — reset per section.
    private(set) var picked: Int?
    /// The wrong picks already spent on this section's check. A miss is a
    /// re-read, not a dead end: the option it names stays marked so it can't be
    /// picked twice, and every other one stays live.
    private(set) var missed: Set<Int> = []
    /// How the last pick was graded, or nil while the check is unanswered. The
    /// band under the options and the haptic both read this — deriving either
    /// from `picked` buzzes on a section turn, which is not an answer.
    private(set) var grade: CheckGrade?
    private(set) var message = ""
    /// Which lens is open over the prose, if any. Bound by the sheet.
    var lens: AltKey?
    let speaker = Speaker()

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
    }

    var node: ConceptNode { session.node }
    /// The pass itself lives in the run's warm cache, not here: a section
    /// written before this screen opened is already in it, and one still being
    /// written lands in it as it arrives. Either way this redraws.
    var chunks: [ConsumeChunk] { session.store.chunks(node) }
    var chunk: ConsumeChunk? { chunks[safe: index] }
    var next: ConsumeChunk? { chunks[safe: index + 1] }

    /// A section closes on its check: getting it right is what earns Continue.
    var passed: Bool {
        guard let check = chunk?.check else { return true }
        guard let picked else { return false }
        return check.opts[safe: picked]?.correct == true
    }

    /// One colour per landed section.
    var rail: [Color?] {
        chunks.indices.map { $0 < index ? Palette.accent : ($0 == index ? NodeState.frontier.color : nil) }
    }

    /// The prose as it is spoken — the section on screen, nothing around it.
    var spoken: String { chunk?.body.joined(separator: " ") ?? "" }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo sua leitura…") : message }

    /// Joins the warm when there is one, runs the pass when there isn't —
    /// `AtlasStore.consume` is the same call either way.
    func load() async {
        if let error = await session.store.consume(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever sua leitura"))
        }
        writing = false
    }

    func pick(_ option: Int) {
        guard !passed, !missed.contains(option), let check = chunk?.check else { return }
        picked = option
        let correct = check.opts[safe: option]?.correct == true
        if !correct { missed.insert(option) }
        grade = CheckGrade(correct: correct, attempt: (grade?.attempt ?? 0) + 1)
    }

    func advance() {
        speaker.stop()
        withAnimation(Motion.standard) {
            index += 1
            picked = nil
            missed = []
            grade = nil
        }
    }

    /// The lens opens over the prose; the section behind it is never swapped.
    func open(_ lens: AltKey) { self.lens = lens }

    func toggleReadAloud() { speaker.toggle(spoken, api: api) }

    /// Handing to the next phase is the only thing this screen writes.
    func finish() {
        guard passed else { return }
        speaker.stop()
        session.advance()
    }

    /// The lens context: the section on screen, so the model view walks *this*
    /// material rather than the concept in general.
    func lensContext(_ lens: AltKey) -> [String: JSONValue]? {
        guard let chunk else { return nil }
        var context = session.context
        context["lens"] = .string(lens.rawValue)
        context["kicker"] = .string(chunk.kicker)
        context["sectionBody"] = .array(chunk.body.map { .string($0) })
        context["takeaway"] = .string(chunk.takeaway)
        return context
    }
}
