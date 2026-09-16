import Observation
import SwiftUI

/// Discriminate's state: one case at a time, committed before it is revealed,
/// and the boundary report the run ends on.
///
/// Its own model rather than a shared one with the three phases that also
/// commit-then-reveal. What it holds is the thing the others do not have: which
/// near-misses were waved through, because over-inclusion is this phase's own
/// failure and its own half of the gate.
@Observable
@MainActor
final class DiscriminateViewModel {
    private(set) var session: DiscriminateSession
    private(set) var writing = true
    private(set) var message = ""

    private let pass: SessionViewModel

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = DiscriminateSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: DiscriminateContent? { pass.store.cases(node) }
    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Separando casos e quase-casos…") : message
    }

    var current: DiscriminateCase? { content?.cases[safe: session.index] }
    /// The reading they committed to on the open case, or nil while it is open.
    var called: Int? { current.flatMap { session.calls[$0.id] } }
    var settled: Bool { called != nil }
    /// The run is over and the report is what is on screen.
    var reported: Bool { session.done }

    var total: Int { content?.cases.count ?? 0 }
    var score: Int { content.map(session.score) ?? 0 }
    var overIncluded: [DiscriminateCase] { content.map(session.falsePositives) ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }

    /// One capsule per case: green for a case read correctly, amber for a miss,
    /// hollow for one not reached. The rail is the only progress this screen has.
    var rail: [Color?] {
        guard let content else { return [] }
        return content.cases.map { item in
            guard let call = session.calls[item.id] else { return nil }
            return call == item.answerIndex ? NodeState.mastered.color : NodeState.shaky.color
        }
    }

    /// How one reading should draw, once the case is settled. Before that every
    /// option is unmarked — the verdict is not on screen while they choose.
    func mark(_ index: Int) -> ChoiceMark {
        guard let current, let called else { return .unmarked }
        if index == current.answerIndex { return .right }
        return index == called ? .wrong : .unmarked
    }

    func call(_ index: Int) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.call(index, content) }
    }

    func next() {
        guard let content else { return }
        withAnimation(Motion.enter) { session.next(content) }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.discriminate(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "separar os casos"))
        }
        writing = false
    }

    /// Leave for the next rung of the plan. The rung closes only on a run that
    /// cleared the gate — two thirds of the cases *and* at most one near-miss
    /// waved through.
    func advance() { pass.advance(passed: passed) }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}
