import Observation
import SwiftUI

/// What the node drawer says about one concept: the state it displays as, how
/// far through the spiral it is, and the one action available. Reads the store,
/// writes only the "já sei isso" skip.
@Observable
@MainActor
final class NodeDetailViewModel {
    let node: ConceptNode
    let store: AtlasStore

    /// Opening the drawer is the clearest statement of intent there is:
    /// whatever phase this node is owed is about to be started, so it is
    /// written now rather than after the tap.
    func warm() {
        if let action { store.warmUp(action, for: node) }
    }

    init(node: ConceptNode, store: AtlasStore) {
        self.node = node
        self.store = store
    }

    var state: NodeState { store.display[node.id] ?? .unknown }

    /// A lacuna is not a map topic: no six-phase spiral, no green CTA. It is
    /// one targeted Socratic pass hanging off its parent, and it reads that
    /// way — `NodeDetail.tsx:182`.
    var isGap: Bool { state == .gap }

    /// The phases this node actually runs. Read once here rather than per row:
    /// every reading below is an index into *this* list, and the four kinds no
    /// longer run the same one.
    var plan: [Phase] { node.plan }

    /// What the learner has finished on this node, in completion order.
    var done: [Phase] { store.phasesDone[node.id] ?? [] }

    /// How far into its own plan the node is. A real review behind the node is
    /// what completes the spiral — being Mastered alone leaves Retido owed.
    ///
    /// Nothing corrects this with the reading record any more. That correction
    /// existed because the index was derived from *state*, which said Feynman on
    /// the strength of two sections read; a plan-derived index has nothing to
    /// correct, because Consume enters the ledger when the pass finishes.
    var current: Int {
        phaseIndex(plan, done, state: state, reviewed: store.reviewed.contains(node.id))
    }

    /// Only Desconhecido locks the drawer. A gap also has no phase index, but
    /// it has its own way in — the repair pass below.
    var isLocked: Bool { state == .unknown }

    /// The phase the node is owed, or nil when the ladder is finished and the
    /// only thing left is the review queue. `primaryPhase` rather than an index:
    /// a Shaky node is owed its plan's *last gate* again, not the first rung it
    /// has not ticked.
    var owed: Phase? {
        guard !isLocked else { return nil }
        // Nothing left to open is not "no action": it is the review queue, which
        // is the rung Retido names and which `NodeDetailView.open` routes to the
        // Review tab rather than into a pass.
        return primaryPhase(plan, done, state: state) ?? (plan.contains(.retain) ? .retain : nil)
    }

    /// The phase the primary action opens. A gap's is the repair pass; every
    /// other state's is whatever it is owed.
    var action: Phase? {
        if isGap { return .socratic }
        // A mastered node with nothing due has no review to open: the Review tab
        // would say "nada vencendo" about everything but this concept. What it
        // can do is prove it again, at the gate its plan ends on.
        if state == .mastered, owed == .retain, !hasDueCard { return proofGate(plan) }
        return owed
    }

    /// This node's own cards — what "Revisar agora" can honestly promise.
    private var nodeCards: [StoredCard] { store.cards.filter { $0.nodeId == node.id } }
    var hasDueCard: Bool { AtlasStore.due(nodeCards) > 0 }

    /// When this concept next comes back for review, if it has a card scheduled.
    var nextReview: String? {
        guard state == .mastered, !hasDueCard else { return nil }
        let dates = nodeCards.compactMap { card -> Date? in
            guard case .string(let due)? = card.fsrs.fields?["due"] else { return nil }
            return ISODate.parse(due)
        }
        guard let next = dates.min() else { return nil }
        let when = next.formatted(.relative(presentation: .named))
        return String(localized: "Próxima revisão \(when).")
    }

    /// The web's five verbs, not one — a Shaky node whose last application
    /// *failed* is not being invited to "Começar" (`NodeDetail.tsx:54-60`).
    var actionTitle: LocalizedStringKey {
        // A part-read node's primary action is to get back into the reading,
        // not to start something new.
        if state == .learning, store.reading(node.id)?.finished == false { return "Retomar a leitura" }
        return switch state {
        // The phase the plan opens on, as `action` opens it — not a name.
        case .frontier: "Começar · \(action?.label ?? Phase.consume.label)"
        // Named after the phase the button actually opens. A fixed "Feynman"
        // here was a label for one of the three phases `.learning` can owe:
        // a node whose reading is done but never handed off is owed Socratic,
        // and the row list beside the button said so while the button did not.
        case .learning: "Continuar · \(action?.label ?? Phase.feynman.label)"
        // Named after the gate this node's own plan ends on. A fixed "Crucible"
        // promised a phase a `fact` never runs.
        case .shaky: "Tentar de novo · \(action?.label ?? Phase.crucible.label)"
        case .mastered: action == .retain ? "Revisar agora" : "Refazer · \(action?.label ?? Phase.crucible.label)"
        case .gap: "Corrigir esta lacuna"
        case .unknown: "Bloqueado"
        }
    }
    var actionTint: Color { isGap ? NodeState.gap.color : (action?.tint ?? Palette.inkGhost) }

    /// One row of the spiral, prepared here rather than mapped per redraw.
    struct PhaseRow: Identifiable {
        let phase: Phase
        let done: Bool
        let isCurrent: Bool
        /// Tapped ahead of what the node is owed — the nudge, not the pass.
        let isAhead: Bool
        let tint: Color
        var id: Phase { phase }
    }

    var rows: [PhaseRow] {
        let current = current, state = state, finished = done
        let reviewed = store.reviewed.contains(node.id)
        return plan.enumerated().map { index, phase in
            // Read off the *ledger*, not off the position. "Everything before
            // the current rung" was the same claim while the ladder was walked
            // strictly in order — it is not now: a learner can open any rung the
            // drawer offers, so a phase closed out of order showed as still
            // owed, which is the one thing the record exists to settle. Retido
            // is the exception it always was: review history closes it.
            let done = phase == .retain ? reviewed : finished.contains(phase)
            let isCurrent = index == current
            return PhaseRow(
                phase: phase, done: done, isCurrent: isCurrent,
                // A rung already closed is never "ahead": tapping it is a redo,
                // and the nudge would ask whether to skip something finished.
                isAhead: index > current && !done,
                tint: done ? NodeState.mastered.color : (isCurrent ? state.color : Palette.inkGhost)
            )
        }
    }

    private var skipRaw: Phase?
    private var skipUnder: NodeState?
    /// A phase tapped ahead of the one the node is owed, waiting on the nudge.
    /// Dropped when the state moves under it — `NodeDetail.tsx:199` resets on
    /// exactly the same change, and a nudge about a phase you no longer owe is
    /// a question about nothing.
    var pendingSkip: Phase? {
        get { skipUnder == state ? skipRaw : nil }
        set { skipRaw = newValue; skipUnder = state }
    }

    /// Why this node is Instável, in its own words. Nil for every other state —
    /// and for a Shaky node written before the reason was recorded, where the
    /// honest answer is to say nothing rather than to guess at a moment.
    var shakyLine: LocalizedStringKey? {
        guard state == .shaky else { return nil }
        // The gate the line sends them back to is the one its CTA opens.
        return store.shakyReasons[node.id]?.line(gate: proofGate(plan))
    }

    var prerequisites: [(ConceptNode, NodeState)] {
        let shown = store.display
        return store.graph.prerequisites(of: node.id).map { ($0, shown[$0.id] ?? .unknown) }
    }

    /// The node this gap was split out of — a dashed edge pointing in. Empty
    /// for everything that isn't a gap, since nothing else has one.
    var spawnedFrom: [(ConceptNode, NodeState)] {
        let shown = store.display, index = store.graph.byId
        return store.graph.edges
            .compactMap { $0.to == node.id && $0.dashed ? index[$0.from] : nil }
            .map { ($0, shown[$0.id] ?? .unknown) }
    }

    var headline: LocalizedStringKey { state.headline }

    /// "Meta: dominar · Difícil · ~38 min restantes" — the bar the node is held
    /// to, named as a goal rather than a bare verb, its difficulty and the work
    /// it still owes (`settlementLine` / `minutesLine` on the web).
    /// Nil on a gap: a sub-point of its parent has no rank or relief of its own.
    var cost: String? {
        guard !isGap else { return nil }
        let owed = state == .mastered ? 0 : node.minutesLeft(done)
        let relief = switch node.difficulty ?? .medium {
        case .easy: String(localized: "Fácil")
        case .medium: String(localized: "Média")
        case .hard: String(localized: "Difícil")
        }
        let bar = switch node.importance ?? .core {
        case .core: String(localized: "Meta: dominar")
        case .working: String(localized: "Meta: usar")
        case .peripheral: String(localized: "Meta: reconhecer")
        }
        return [
            bar,
            relief,
            owed > 0 ? String(localized: "~\(owed) min restantes") : nil,
        ].compactMap(\.self).joined(separator: " · ")
    }

    /// A reading known end to end leads with proving it (W3.4).
    var proving: Bool {
        provesOnSight(plan, done, state: state, reading: store.reading(node.id),
                      shaky: store.shakyReasons[node.id])
    }
    var proofLabel: String { proofGate(plan).label }

    /// "Já sei isso — provar": not the honour system. Opens the proof gate, and
    /// only a first-try pass credits the whole plan (`ledgerAfter`).
    func prove() -> Phase { store.armChallenge(node) }

    /// Any ordinary way into a phase ends a pending challenge.
    func disarm() { store.challenge = nil }
}
