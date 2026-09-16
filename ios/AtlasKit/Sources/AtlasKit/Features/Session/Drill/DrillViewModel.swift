import Observation
import SwiftUI

/// Drill's state: the same small call, made over and over, and how long each
/// one took.
///
/// Its own model, and the clock is why. No other rung in the catalogue can tell
/// a learner who *knows* the answer from one who re-derives it correctly every
/// time — so this one holds a timer, reports a pace, and names the reps that
/// were right and slow.
@Observable
@MainActor
final class DrillViewModel {
    private(set) var session: DrillSession
    private(set) var writing = true
    private(set) var message = ""
    /// What the clock reads, redrawn about ten times a second while a rep is
    /// open. Its own property rather than a `TimelineView` in the body: the
    /// elapsed time is the phase's signal, and a view model owns the screen's
    /// derived values.
    private(set) var elapsed: TimeInterval = 0

    private let pass: SessionViewModel
    private var ticker: Task<Void, Never>?

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = DrillSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: DrillContent? { pass.store.reps(node) }
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Escrevendo as repetições…") : message
    }

    var current: DrillRep? { content?.reps[safe: session.index] }
    var hit: Int? { current.flatMap { session.hits[$0.id] } }
    var settled: Bool { hit != nil }
    var reported: Bool { session.done }

    var total: Int { content?.reps.count ?? 0 }
    var score: Int { content.map(session.score) ?? 0 }
    var labored: [DrillRep] { content.map(session.labored) ?? [] }
    var automatic: Bool { content.map(session.automatic) ?? false }
    var passed: Bool { content.map(session.passed) ?? false }

    /// The clock, to one decimal — seconds, because a millisecond count on a
    /// phone reads as noise rather than as pace.
    var clock: String { Self.seconds(elapsed) }
    var pace: String { Self.seconds(content.map(session.median) ?? 0) }

    static func seconds(_ interval: TimeInterval) -> String {
        String(format: "%.1f", interval)
    }

    /// Amber past the target: the learner should be able to see the call going
    /// from automatic to derived while they are making it.
    var clockTint: Color { elapsed > drillTarget ? Palette.amberInk : Palette.drillInk }

    var rail: [Color?] {
        guard let content else { return [] }
        return content.reps.map { rep in
            guard let hit = session.hits[rep.id] else { return nil }
            return hit == rep.answerIndex ? NodeState.mastered.color : NodeState.shaky.color
        }
    }

    func mark(_ index: Int) -> ChoiceMark {
        guard let current, let hit else { return .unmarked }
        if index == current.answerIndex { return .right }
        return index == hit ? .wrong : .unmarked
    }

    func answer(_ index: Int) {
        guard let content else { return }
        stopClock()
        withAnimation(Motion.snap) { session.answer(index, content) }
    }

    func next() {
        guard let content else { return }
        withAnimation(Motion.snap) { session.next(content) }
        if !session.done { startClock() }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.drill(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "escrever as repetições"))
        }
        writing = false
        // The clock starts when the first rep is actually on screen, not when
        // the phase was opened: the seconds spent waiting on a generation are
        // not the learner deriving anything.
        if content != nil {
            session = DrillSession(nodeId: node.id)
            startClock()
        }
    }

    /// Stop the clock on the way out. A ticker left running keeps a timer
    /// awake behind the map for as long as the app is.
    func leave() { stopClock() }

    private func startClock() {
        stopClock()
        elapsed = 0
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, !Task.isCancelled else { return }
                elapsed = Date.now.timeIntervalSince(session.openedAt)
            }
        }
    }

    private func stopClock() {
        ticker?.cancel()
        ticker = nil
    }

    /// The rung closes on correctness at the same two-thirds bar as its
    /// siblings. Speed is measured, reported, and named in the closing copy —
    /// it is not the gate. See `DrillSession.passed`.
    func advance() {
        stopClock()
        pass.advance(passed: passed)
    }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
