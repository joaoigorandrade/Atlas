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

    /// Where the learner got to in this node's reading pass, if they opened one.
    private var progress: ConsumeProgress? { store.consumeProgress[node.id] }

    /// A real review behind the node is what completes the spiral — being
    /// Mastered alone leaves Retido still owed. The reading record gets the last
    /// word where it has one: a pass left part-way through is still on Consume,
    /// whatever the mastery state alone would say.
    var current: Int {
        readingPhaseIndex(state, reviewed: store.reviewed.contains(node.id), progress: progress)
    }

    /// "3 de 5 lidas", drawn on the Consume row — the one place "you're
    /// part-way through this" belongs. Nil unless there is a real, unfinished
    /// pass behind the node.
    var reading: LocalizedStringKey? {
        guard let progress, progress.unfinished else { return nil }
        let (read, total) = progress.reading
        let line: LocalizedStringKey = "\(read) de \(total) lidas"
        return line
    }

    var isLocked: Bool { current < 0 }
    /// `phaseIndex` answers 6 for a node that has been reviewed — one past the
    /// last phase, because the spiral is *finished*, not because there is a
    /// seventh. Clamping here is what keeps that from indexing off `allCases`.
    var owed: Phase? {
        isLocked ? nil : Phase.allCases[min(current, Phase.allCases.count - 1)]
    }
    /// A part-read node's primary action is to get back into the reading, not
    /// to start something new.
    var actionTitle: LocalizedStringKey {
        if reading != nil { return "Retomar a leitura" }
        return owed.map { "Começar · \($0.rawValue)" } ?? "Bloqueado"
    }
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
