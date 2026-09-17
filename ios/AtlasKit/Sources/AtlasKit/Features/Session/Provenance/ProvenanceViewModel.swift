import Observation
import SwiftUI

/// Provenance's state: one source held open, and claims ruled against it one at
/// a time.
///
/// Its own model rather than a shared one with the phases that also
/// commit-then-reveal. What it holds is the thing the others do not have: which
/// claims the learner took the source's word for, because reading a document as
/// a record of what happened — rather than as an act by an interested party —
/// is this phase's own failure and its own half of the gate.
///
/// No judge anywhere in it. Every claim ships its own ruling, so the whole pass
/// costs one generation and grades on the device.
@Observable
@MainActor
final class ProvenanceViewModel {
    private(set) var session: ProvenanceSession
    private(set) var writing = true
    private(set) var message = ""

    private let pass: SessionViewModel

    init(session pass: SessionViewModel) {
        self.pass = pass
        session = ProvenanceSession(nodeId: pass.node.id)
    }

    var node: ConceptNode { pass.node }
    var content: ProvenanceContent? { pass.store.sourceReading(node) }
    /// Nothing landed and nothing is coming.
    var failed: Bool { !writing && content == nil }
    var waitingCopy: String {
        message.isEmpty ? String(localized: "Procurando uma fonte…") : message
    }

    var current: ProvenanceClaim? { content?.claims[safe: session.index] }
    /// The ruling they committed to on the open claim, or nil while it is open.
    var ruled: ProvenanceRuling? { current.flatMap { session.rulings[$0.id] } }
    var settled: Bool { ruled != nil }
    /// The run is over and the report is what is on screen.
    var reported: Bool { session.done }

    var total: Int { content?.claims.count ?? 0 }
    var score: Int { content.map(session.score) ?? 0 }
    var overtrusted: [ProvenanceClaim] { content.map(session.overtrusted) ?? [] }
    var passed: Bool { content.map(session.passed) ?? false }

    /// One capsule per claim: green for a ruling that held, amber for a miss,
    /// hollow for one not reached.
    var rail: [Color?] {
        guard let content else { return [] }
        return content.claims.map { item in
            guard let call = session.rulings[item.id] else { return nil }
            return call == item.ruling ? NodeState.mastered.color : NodeState.shaky.color
        }
    }

    /// How one ruling should draw, once the claim is settled. Before that every
    /// option is unmarked — the answer is not on screen while they choose.
    func mark(_ ruling: ProvenanceRuling) -> ChoiceMark {
        guard let current, let ruled else { return .unmarked }
        if ruling == current.ruling { return .right }
        return ruling == ruled ? .wrong : .unmarked
    }

    func rule(_ ruling: ProvenanceRuling) {
        guard let content else { return }
        withAnimation(Motion.standard) { session.rule(ruling, content) }
    }

    func next() {
        guard let content else { return }
        withAnimation(Motion.enter) { session.next(content) }
    }

    func load() async {
        writing = true
        message = ""
        if let error = await pass.store.provenance(node) {
            message = ErrorCopy.sentence(for: error, doing: String(localized: "achar a fonte"))
        }
        writing = false
    }

    /// Leave for the next rung. The rung closes only on a run that cleared the
    /// gate — two thirds of the claims *and* at most one taken at its word.
    func advance() { pass.advance(passed: passed) }

    var handOffLabel: LocalizedStringKey { pass.handOffLabel }
    var handOffTint: Color { pass.handOffTint }
}

public extension ProvenanceRuling {
    /// What the learner taps. The distinction the whole phase turns on has to
    /// be readable in three words.
    var label: String {
        switch self {
        case .asserts: String(localized: "A fonte afirma")
        case .proves: String(localized: "A fonte prova")
        case .neither: String(localized: "Nenhum dos dois")
        }
    }
}
