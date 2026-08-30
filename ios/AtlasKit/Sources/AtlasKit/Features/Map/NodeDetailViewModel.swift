import Observation
import SwiftUI

/// What the node drawer says about one concept: the state it displays as, how
/// far through the spiral it is, and the one action available. Reads the store,
/// writes only the "já sei isso" skip.
@Observable
@MainActor
final class NodeDetailViewModel {
    let node: ConceptNode
    private let store: AtlasStore

    init(node: ConceptNode, store: AtlasStore) {
        self.node = node
        self.store = store
    }

    var state: NodeState { store.display[node.id] ?? .unknown }

    /// A lacuna is not a map topic: no six-phase spiral, no green CTA. It is
    /// one targeted Socratic pass hanging off its parent, and it reads that
    /// way — `NodeDetail.tsx:182`.
    var isGap: Bool { state == .gap }

    /// A real review behind the node is what completes the spiral — being
    /// Mastered alone leaves Retido still owed.
    /// Corrected by the reading record: a node goes Learning the moment a
    /// session opens on it, and the state alone would tick off Consume and
    /// Socratic for that (`readingPhaseIndex`).
    var current: Int {
        readingPhaseIndex(state, reviewed: store.reviewed.contains(node.id), store.reading(node.id))
    }

    /// Only Desconhecido locks the drawer. A gap also has no phase index, but
    /// it has its own way in — the repair pass below.
    var isLocked: Bool { state == .unknown }
    /// `phaseIndex` answers 6 for a node that has been reviewed — one past the
    /// last phase, because the spiral is *finished*, not because there is a
    /// seventh. Clamping here is what keeps that from indexing off `allCases`.
    var owed: Phase? {
        current < 0 ? nil : Phase.allCases[min(current, Phase.allCases.count - 1)]
    }

    /// The phase the primary action opens. A gap's is the repair pass; every
    /// other state's is whatever it is owed.
    var action: Phase? { isGap ? .socratic : owed }

    /// The web's five verbs, not one — a Shaky node whose last application
    /// *failed* is not being invited to "Começar" (`NodeDetail.tsx:54-60`).
    var actionTitle: LocalizedStringKey {
        // A part-read node's primary action is to get back into the reading,
        // not to start something new.
        if state == .learning, store.reading(node.id)?.finished == false { return "Retomar a leitura" }
        return switch state {
        case .frontier: "Começar · Consume"
        case .learning: "Continuar · Feynman"
        case .shaky: "Tentar de novo · Crucible"
        case .mastered: "Revisar agora"
        case .gap: "Corrigir esta lacuna"
        case .unknown: "Bloqueado"
        }
    }
    var actionTint: Color { isGap ? NodeState.gap.color : (owed?.tint ?? Palette.inkGhost) }

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
        let current = current, state = state
        return Phase.allCases.enumerated().map { index, phase in
            let done = current >= 0 && index < current
            let isCurrent = index == current
            return PhaseRow(
                phase: phase, done: done, isCurrent: isCurrent, isAhead: index > current,
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
        return store.shakyReasons[node.id]?.line
    }

    var prerequisites: [(String, NodeState)] {
        let shown = store.display
        return store.graph.prerequisites(of: node.id).map { ($0.label, shown[$0.id] ?? .unknown) }
    }

    /// The node this gap was split out of — a dashed edge pointing in. Empty
    /// for everything that isn't a gap, since nothing else has one.
    var spawnedFrom: [(String, NodeState)] {
        let shown = store.display, index = store.graph.byId
        return store.graph.edges
            .compactMap { $0.to == node.id && $0.dashed ? index[$0.from] : nil }
            .map { ($0.label, shown[$0.id] ?? .unknown) }
    }

    var headline: LocalizedStringKey {
        switch state {
        case .frontier: "Fronteira · pronto"
        case .learning: "Aprendendo"
        case .shaky: "Instável"
        case .mastered: "Dominado"
        case .gap: "Lacuna"
        // `STATE_LABEL_PT` names the state; the CTA below already says
        // "Bloqueado", which is the *consequence* of it.
        case .unknown: "Desconhecido"
        }
    }

    func skip() { store.states[node.id] = .mastered }
}
