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
    var current: Int { phaseIndex(state, reviewed: store.reviewed.contains(node.id)) }

    var isLocked: Bool { current < 0 }
    var actionTitle: String { isLocked ? "Bloqueado" : "Começar · \(Phase.allCases[current].rawValue)" }
    var actionTint: Color { isLocked ? Palette.inkGhost : Phase.allCases[max(0, current)].tint }

    var prerequisites: [(String, NodeState)] {
        store.graph.prerequisites(of: node.id).map { ($0.label, store.display[$0.id] ?? .unknown) }
    }

    var headline: String {
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
