import Observation
import SwiftUI

/// Screen 14's state: which section is being read and whether its check has
/// been passed. The sections themselves are not state here — they live in the
/// run's warm cache, which is what lets a pass written before this screen
/// opened arrive with no wait at all.
///
/// Nor is *where the learner got to*: that is the run's, held per node in
/// `AtlasStore.consumeProgress` and written on every move rather than on the
/// way out, because a closed app is a way out too. This screen is eight to
/// fifteen minutes long; stepping back to the map used to throw all of it away
/// and leave the node claiming Consume and Socratic were done.
@Observable
@MainActor
final class ConsumeViewModel {
    /// The stream is still going — the last section on screen isn't the last one.
    private(set) var writing = true
    /// The section on screen, resumed from the run: a pass left half-read
    /// reopens where it stopped.
    private(set) var index: Int
    private(set) var message = ""
    /// Which lens is open over the prose, if any. Bound by the sheet.
    var lens: AltKey?
    let speaker = Speaker()

    private let session: SessionViewModel
    private let api: AtlasAPI

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
        index = session.store.consumeProgress[session.node.id]?.idx ?? 0
    }

    var node: ConceptNode { session.node }
    /// The pass itself lives in the run's warm cache, not here: a section
    /// written before this screen opened is already in it, and one still being
    /// written lands in it as it arrives. Either way this redraws.
    var chunks: [ConsumeChunk] { session.store.chunks(node) }
    var chunk: ConsumeChunk? { chunks[safe: index] }
    var next: ConsumeChunk? { chunks[safe: index + 1] }

    /// Where the learner got to in this node's pass, as the run holds it.
    private var progress: ConsumeProgress {
        session.store.consumeProgress[node.id] ?? ConsumeProgress()
    }

    /// The check's picked option for the section on screen. Read back from the
    /// run rather than held here: a check already answered stays answered when
    /// the learner comes back, or resuming would re-gate a section they
    /// demonstrably read.
    var picked: Int? { chunk.flatMap { progress.checks[$0.id]?.oi } }

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
        // A pass regenerated shorter than the one this position came from would
        // otherwise resume past its own last section and wait forever.
        if index >= chunks.count { index = max(0, chunks.count - 1) }
        record()
    }

    /// A miss is kept — the section names it — and replaced by the next
    /// attempt; only the right answer closes the question. Guarding on the
    /// pick instead would be a dead end now that a pick outlives the screen:
    /// one wrong tap and Continue never comes back, relaunch included.
    func pick(_ option: Int) {
        guard let chunk, !passed else { return }
        let correct = chunk.check?.opts[safe: option]?.correct == true
        record { $0.checks[chunk.id] = ConsumeCheck(oi: option, correct: correct) }
    }

    func advance() {
        speaker.stop()
        withAnimation(Motion.standard) { index += 1 }
        record()
        // Reading past the first section is real progress, and it used to leave
        // no trace at all: the node stayed on the frontier and the map said the
        // learner had never started. Exactly `exitConsume`'s write on the web.
        markLearning()
    }

    /// The lens opens over the prose; the section behind it is never swapped.
    func open(_ lens: AltKey) { self.lens = lens }

    func toggleReadAloud() { speaker.toggle(spoken, api: api) }

    /// The end of the reading, and the hand-off to Socratic. The pass is marked
    /// finished *before* the hand-off, so the record Socratic stamps as handed
    /// off is the finished one.
    func finish() {
        guard passed else { return }
        speaker.stop()
        record { $0.finished = true }
        markLearning()
        session.advance()
    }

    /// Mirror the pass into the run — the position, the sections there are, and
    /// whatever else the caller changed. Every move on this screen goes through
    /// here; nothing about where the learner is lives only in this object.
    private func record(_ change: (inout ConsumeProgress) -> Void = { _ in }) {
        var progress = self.progress
        change(&progress)
        progress.idx = max(progress.idx, index)
        // A pass still streaming has fewer sections in hand than it will end up
        // with; never let a mid-stream count shrink a known total.
        progress.total = max(progress.total, chunks.count)
        session.store.consumeProgress[node.id] = progress
    }

    /// A node being read is a node being learned. Anything already past
    /// Learning is left where it is — reading again never walks mastery back.
    private func markLearning() {
        if (session.store.states[node.id] ?? .unknown) == .unknown {
            session.store.states[node.id] = .learning
        }
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
