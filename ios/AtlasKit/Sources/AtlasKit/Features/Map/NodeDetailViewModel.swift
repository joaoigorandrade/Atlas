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

    /// A real review behind the node is what completes the spiral — being
    /// Mastered alone leaves Retido still owed.
    ///
    /// The reading gets the last word where it has one: a node left part-way
    /// through its pass is Learning, and the state alone would tick Consume
    /// *and* Socratic off on the strength of two sections read.
    var current: Int {
        readingPhaseIndex(
            state,
            reviewed: store.reviewed.contains(node.id),
            progress: store.consumeProgress[node.id]
        )
    }

    var isLocked: Bool { current < 0 }
    /// `phaseIndex` answers 6 for a node that has been reviewed — one past the
    /// last phase, because the spiral is *finished*, not because there is a
    /// seventh. Clamping here is what keeps that from indexing off `allCases`.
    var owed: Phase? {
        isLocked ? nil : Phase.allCases[min(current, Phase.allCases.count - 1)]
    }
    var actionTitle: LocalizedStringKey { owed.map { "Começar · \($0.rawValue)" } ?? "Bloqueado" }
    var actionTint: Color { owed?.tint ?? Palette.inkGhost }

    var prerequisites: [(String, NodeState)] {
        let shown = store.display
        return store.graph.prerequisites(of: node.id).map { ($0.label, shown[$0.id] ?? .unknown) }
    }

    var headline: LocalizedStringKey {
        switch state {
        case .frontier: "Fronteira · pronto"
        case .learning: "Aprendendo"
        case .shaky: "Instável · revisar"
        case .mastered: "Dominado"
        case .gap: "Lacuna"
        case .unknown: "Bloqueado"
        }
    }

    func skip() { store.states[node.id] = .mastered }
}
