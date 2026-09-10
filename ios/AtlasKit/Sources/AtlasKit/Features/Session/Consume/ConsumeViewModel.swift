import Observation
import SwiftUI

/// A graded pick on a section's check. The attempt is part of it so that a
/// second miss is a second event — a haptic keyed on right-or-wrong alone stays
/// silent when the learner misses twice in a row.
struct CheckGrade: Equatable {
    let correct: Bool
    let attempt: Int
}

/// The lens sheet's whole request: which lens, over which section, with the
/// context it is generated from. Built when the chip is tapped rather than in
/// `body` — a view computes nothing a stored property could carry
/// (`ios/AGENTS.md` §MVVM) — and non-optional throughout, so the sheet can
/// never open on a request that was never made.
struct LensRequest: Identifiable {
    let lens: AltKey
    let chunk: ConsumeChunk
    let context: [String: JSONValue]
    var id: String { "\(chunk.id):\(lens.rawValue)" }
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
    /// The end of the section has been on screen. The check is held back until
    /// then: a gate answerable without scrolling past the prose is a gate that
    /// no longer implies reading. Mirrors `SectionCheck`'s observer.
    private(set) var reachedEnd = false
    /// The last section turn went backwards, so the page turn animates that
    /// way: a section the learner just came back to sliding in from the right
    /// reads as going forward.
    private(set) var goingBack = false
    private(set) var message = ""
    /// Which lens is open over the prose, if any. Bound by the sheet.
    var lens: LensRequest?
    let speaker = Speaker()

    private let session: SessionViewModel
    private let api: AtlasAPI
    /// The pass's address in the warm cache. Built once — `key` folds four
    /// strings and every one of `chunk`, `next`, `rail` and `spoken` asked for
    /// it, several times per redraw during a section turn.
    private let key: String
    /// Sections whose check was passed on an earlier visit, so a re-entry does
    /// not re-gate work the learner already did.
    private var passedChecks: Set<String>
    /// The most sections this pass has ever had. The frames carry no total, so
    /// a cold rail grows under the learner; what this stops is the *second*
    /// problem — a re-entry mid-stream drawing a shorter rail than last time.
    private var seenTotal: Int

    init(session: SessionViewModel, api: AtlasAPI) {
        self.session = session
        self.api = api
        key = session.store.address("consume", session.node)
        let progress = session.store.reading(session.node.id)
        // Where the learner got to, in this browser or the last one. The
        // reading pass is the longest surface in Atlas — coming back to
        // section 1 after a phone call is re-reading ten minutes of prose.
        index = max(0, progress?.idx ?? 0)
        passedChecks = progress?.checks ?? []
        seenTotal = progress?.total ?? 0
    }

    var node: ConceptNode { session.node }
    /// The pass itself lives in the run's warm cache, not here: a section
    /// written before this screen opened is already in it, and one still being
    /// written lands in it as it arrives. Either way this redraws.
    var chunks: [ConsumeChunk] { session.store.warm.content(key) ?? [] }
    var chunk: ConsumeChunk? { chunks[safe: index] }
    var next: ConsumeChunk? { chunks[safe: index + 1] }

    /// The pass stopped part-way: what landed is on screen and worth keeping,
    /// but there is more of it that never arrived. The notice belongs under the
    /// last section that landed — that is where the reading actually ran out.
    var incomplete: Bool { !message.isEmpty && !chunks.isEmpty && next == nil }

    /// A section closes on its check: getting it right is what earns Continue.
    /// A section answered on an earlier visit stays answered.
    var passed: Bool {
        guard let chunk else { return true }
        // A section still being written is not a section that can be left: its
        // check has not been written yet, and `check == nil` means "ungated".
        guard chunk.settled else { return false }
        guard let check = chunk.check else { return true }
        if passedChecks.contains(chunk.id) { return true }
        guard let picked else { return false }
        return check.opts[safe: picked]?.correct == true
    }

    /// Sections the reading actually has. The one being written is on screen —
    /// it is the point of streaming it — but it is not a section the rail
    /// counts, the recap totals, or the map records: it can still fail.
    var landed: Int { chunks.filter(\.settled).count }

    /// One colour per landed section, never fewer than the pass has had before.
    var rail: [Color?] {
        (0..<max(landed, seenTotal)).map {
            $0 < index ? Palette.accent : ($0 == index ? NodeState.frontier.color : nil)
        }
    }

    /// What the rail says to VoiceOver. The count is withheld while the stream
    /// is still writing — announcing a total that is about to change is worse
    /// than not announcing one.
    var railValue: Text {
        writing
            ? Text("Seção \(index + 1)")
            : Text("Seção \(index + 1) de \(max(landed, seenTotal))")
    }

    /// The prose as it is spoken: the explanation, the worked example that
    /// follows it and the takeaway that closes it — what is on screen, rather
    /// than the paragraphs alone. Mirrors `segmentsForChunk`.
    var spoken: [String] {
        // Half a section read aloud stops mid-sentence and cannot be resumed.
        guard let chunk, chunk.settled else { return [] }
        var segments = chunk.body
        if let example = chunk.example {
            segments.append(example.title)
            segments.append(contentsOf: example.steps)
        }
        segments.append(chunk.takeaway)
        // The screen renders the model's markdown; the voice has to be handed
        // the same string, or it reads the asterisks out loud. See `Markdown`.
        return segments.map(Markdown.plain)
    }

    var waitingCopy: String { message.isEmpty ? String(localized: "Escrevendo sua leitura…") : message }

    /// The lens the learner keeps reaching for, marked on the chips from the
    /// second time they pick it. SPEC §6's adaptive modality.
    var preferredLens: AltKey? { session.store.preferredLens }

    /// Joins the warm when there is one, runs the pass when there isn't —
    /// `AtlasStore.consume` is the same call either way. Also the retry the
    /// screen offers under an incomplete pass: re-entering the node used to be
    /// the only one, and it restarted the generation from section 1.
    func load() async {
        writing = true
        message = ""
        if let error = await session.store.consume(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever sua leitura"))
        }
        writing = false
        // A restored `idx` past the end of the pass in hand — a pass rewritten
        // shorter than the one the learner left — drew no section *and* no
        // dock: the back arrow was the only way off the screen. Clamped here,
        // once, so `next`, `rail` and `note` all agree with what is drawn.
        if !chunks.isEmpty, index > chunks.count - 1 { index = chunks.count - 1 }
    }

    func pick(_ option: Int) {
        guard !passed, !missed.contains(option), let check = chunk?.check else { return }
        picked = option
        let correct = check.opts[safe: option]?.correct == true
        if !correct { missed.insert(option) }
        grade = CheckGrade(correct: correct, attempt: (grade?.attempt ?? 0) + 1)
        guard correct, let chunk else { return }
        // Answering a check is work: it is the first thing on this screen that
        // proves the learner read something, which is what a streak day means.
        passedChecks.insert(chunk.id)
        session.markWorked()
        note(passed: chunk.id)
    }

    /// The end of the section has scrolled into view, so the check may appear.
    func reachEnd() { reachedEnd = true }

    /// Back to a section already read. The rail is the way back: the web keeps
    /// every revealed section on the page, and here only one is on screen at a
    /// time — so without this the only way back to the previous section was the
    /// back arrow, which leaves the pass. Nothing is written: how far the
    /// reading *got* is not undone by re-reading something behind it.
    func revisit(_ section: Int) {
        guard section >= 0, section < index else { return }
        speaker.stop()
        withAnimation(Motion.standard) {
            goingBack = true
            index = section
            // The check on a section already answered stays answered — that
            // lives in `passedChecks`, not in these.
            picked = nil
            missed = []
            grade = nil
            reachedEnd = false
            speaker.clearMessage()
        }
    }

    func advance() {
        speaker.stop()
        withAnimation(Motion.standard) {
            goingBack = false
            index += 1
            picked = nil
            missed = []
            grade = nil
            reachedEnd = false
            // A read-aloud that failed on the section just left has nothing to
            // say about this one — the banner was outliving the section it was
            // about, over prose nobody asked to hear.
            speaker.clearMessage()
        }
        note()
    }

    /// The lens opens over the prose; the section behind it is never swapped.
    /// The read-aloud does stop — the sheet is opened by someone who did not
    /// follow the section, and a voice still reading it underneath does not help.
    func open(_ lens: AltKey) {
        guard let chunk else { return }
        speaker.stop()
        session.store.noteLens(lens)
        self.lens = LensRequest(lens: lens, chunk: chunk, context: lensContext(lens, chunk))
    }

    func toggleReadAloud() { speaker.toggle(spoken, api: api) }

    /// The one thing the back arrow has to do besides pop: a clip parked in its
    /// own sleep would otherwise keep speaking over the map.
    func stopReadAloud() { speaker.stop() }

    /// Handing to the next phase is the only thing this screen writes.
    func finish() {
        guard passed else { return }
        speaker.stop()
        note()
        session.advance()
    }

    /// How far the reading got, written where the map can read it: the spiral
    /// refuses to tick Consume off a pass left part-way through, and "3 de 5"
    /// is the same two numbers. Mirrors the web's `ConsumeProgress`.
    private func note(passed chunk: String? = nil) {
        seenTotal = max(seenTotal, landed)
        session.store.note(
            reading: node.id, idx: index, total: seenTotal,
            // Reaching the last section is not finishing the pass: `finished`
            // is what `readingPhaseIndex` ticks Consume off by, so writing it
            // on arrival marked the reading done for a learner who had not
            // answered its check — and the way back in became "Refazer",
            // which throws the whole pass away. Mirrors the web, where only
            // `finishConsume` (the recap's CTA, past the check) sets it.
            // `writing` matters for the same reason the dock reads it: the
            // last section *in hand* is not the last one while the stream is
            // still going.
            finished: !chunks.isEmpty && index >= chunks.count - 1 && !writing && passed,
            passed: chunk
        )
    }

    /// The lens context: the section on screen, so the model view walks *this*
    /// material rather than the concept in general.
    private func lensContext(_ lens: AltKey, _ chunk: ConsumeChunk) -> [String: JSONValue] {
        var context = session.context
        context["lens"] = .string(lens.rawValue)
        context["kicker"] = .string(chunk.kicker)
        context["sectionBody"] = .array(chunk.body.map { .string($0) })
        context["takeaway"] = .string(chunk.takeaway)
        return context
    }
}
