import Foundation

// The cell: a node's importance × difficulty. Importance sets the bar — master,
// use, recognise — and so which phases run; difficulty sets the budget under
// that bar. Mirrors `lib/curriculum/cells.ts`; the server clamps a map into the
// cells its goal allows, so this client only reads them.

/// Minutes a node should cost, whole ladder, by cell — `CELL_BUDGET`.
/// ponytail: starting estimates, tuned from `nodes.phase_seconds`.
public func cellBudget(_ importance: NodeImportance, _ difficulty: NodeDifficulty) -> Int {
    switch (importance, difficulty) {
    case (.core, .easy): 20
    case (.core, .medium): 35
    case (.core, .hard): 50
    case (.working, .easy): 8
    case (.working, .medium): 12
    case (.working, .hard): 18
    case (.peripheral, .easy): 4
    case (.peripheral, .medium), (.peripheral, .hard): 6
    }
}

/// The one applied rung that proves a `working` node — `appliedRung` in `cells.ts`.
/// The domain goes first where it replaces the kind's ladder outright.
public func appliedRung(_ full: [Phase], _ kind: NodeKind, _ domain: Domain) -> Phase? {
    let byDomain: [Phase] = switch domain {
    case .performative: [.produce]
    case .craft: [.perform]
    default: []
    }
    let byKind: [Phase] = switch kind {
    case .fact: [.drill, .discriminate, .recall]
    case .concept: [.discriminate, .predict]
    case .procedure: [.perform, .trace, .drill]
    case .principle: [.predict, .trace]
    }
    return (byDomain + byKind).first { full.contains($0) }
}
