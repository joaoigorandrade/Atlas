import Foundation

// Rationing the heavy phases (W3.1) — the port of `rationing.ts`. A Steelman
// needs a live dispute, a Crucible a framing worth transferring into, a
// Discriminate a class with members, a Connect two neighbours; and a node's
// cell caps how many gates it runs at all. The map writes the evidence per
// node; `resolvePlan` applies it once.

/// What the map found per node. Every field optional: absent is "no evidence"
/// and rations nothing, which is every map built before the flags.
public struct PlanEvidence: Sendable {
    public var contested: Bool?
    public var transferable: Bool?
    public var individual: Bool?
    public var neighbours: Int?

    public init(contested: Bool? = nil, transferable: Bool? = nil,
                individual: Bool? = nil, neighbours: Int? = nil) {
        self.contested = contested; self.transferable = transferable
        self.individual = individual; self.neighbours = neighbours
    }
}

/// The most gates a mastered node of each difficulty may run.
public func gateCap(_ difficulty: NodeDifficulty) -> Int {
    switch difficulty {
    case .easy: 5
    case .medium: 7
    case .hard: .max
    }
}

/// Which gates a node keeps first when its cell caps them, per kind. Mirrors
/// `GATE_PRIORITY` in `rationing.ts` — a domain's own rung ranks high.
private let gatePriority: [NodeKind: [Phase]] = [
    .fact: [.consume, .produce, .recall, .drill, .discriminate, .connect],
    .concept: [.consume, .produce, .provenance, .discriminate, .feynman, .perform, .crucible,
               .steelman, .recall, .trace, .socratic, .predict, .drill, .connect],
    .procedure: [.consume, .produce, .perform, .trace, .feynman, .drill, .crucible,
                 .provenance, .steelman, .predict, .discriminate, .connect],
    .principle: [.consume, .produce, .provenance, .predict, .feynman, .trace, .perform, .crucible,
                 .steelman, .socratic, .drill, .connect],
]

func gateRank(_ kind: NodeKind, _ phase: Phase) -> Int {
    gatePriority[kind]?.firstIndex(of: phase) ?? 99
}

/// Apply the evidence and the cap to a mastered node's wanted phases.
func ration(_ want: Set<Phase>, _ kind: NodeKind, _ difficulty: NodeDifficulty,
            _ evidence: PlanEvidence) -> [Phase] {
    var want = want
    if evidence.contested == false { want.remove(.steelman) }
    if evidence.transferable == false { want.remove(.crucible) }
    if evidence.individual == true { want.remove(.discriminate) }
    if let n = evidence.neighbours, n < 2 { want.remove(.connect) }
    let gates = Phase.allCases.filter { want.contains($0) && $0 != .retain }
    let keep = Set(gates.sorted { gateRank(kind, $0) < gateRank(kind, $1) }.prefix(gateCap(difficulty)))
    return Phase.allCases.filter { $0 == .retain ? want.contains($0) : keep.contains($0) }
}
