import SwiftUI

// Screen 20 — what the learner actually knows, held against what they felt they
// knew. Mirrors the reading half of `lib/curriculum/calibration.ts`; the
// samples come from the confidence tap before every review card is flipped and
// from the Crucible's own tap before the problem is revealed (screen 18) —
// both through `recordCalib`.

/// One reading: stated confidence against first-try performance, both 0–100.
public struct CalibSample: Codable, Sendable, Identifiable {
    public let id: String
    public var felt: Int
    public var real: Int
}

/// How a reading sits against the diagonal.
public enum CalibVerdict: Sendable {
    case over, under, ok

    var label: LocalizedStringKey {
        switch self {
        case .over: "Excesso de confiança"
        case .under: "Falta de confiança"
        case .ok: "Bem calibrado"
        }
    }

    var tint: Color {
        switch self {
        case .over: NodeState.shaky.color
        case .under: NodeState.learning.color
        case .ok: NodeState.mastered.color
        }
    }

    /// Overconfident first, then under, then the well-calibrated — the order
    /// the per-node breakdown reads in.
    var rank: Int {
        switch self {
        case .over: 0
        case .under: 1
        case .ok: 2
        }
    }
}

/// How far felt must lead or lag real to leave the well-calibrated band.
public let calibThreshold = 12

/// A sample resolved with its verdict and the node's name, ready to render.
public struct CalibItem: Sendable, Identifiable {
    public let id: String
    public let label: String
    public let felt: Int
    public let real: Int
    /// felt − real: positive is overconfident.
    public var diff: Int { felt - real }
    public var verdict: CalibVerdict {
        diff > calibThreshold ? .over : (diff < -calibThreshold ? .under : .ok)
    }
}

/// The readings, resolved against the map and sorted for the breakdown:
/// the worst overconfidence leads, because that is the one to act on.
public func calibItems(_ samples: [CalibSample], _ graph: ConceptGraph) -> [CalibItem] {
    samples
        .map { sample in
            CalibItem(
                id: sample.id,
                label: graph.nodes.first { $0.id == sample.id }?.label ?? sample.id,
                felt: sample.felt,
                real: sample.real
            )
        }
        .sorted {
            $0.verdict.rank != $1.verdict.rank
                ? $0.verdict.rank < $1.verdict.rank
                : abs($0.diff) > abs($1.diff)
        }
}

// MARK: - The phase ledger's derivations

/// The mastery state a node's *record of finished phases* implies.
///
/// This is the inversion. State used to be the input and phase the derived
/// value, which is why the ladder had to be the same six rungs for every node
/// and why `mastered` was reachable only by passing the Crucible. Now the node
/// stores what was done and state falls out of it, so a six-phase plan with no
/// Crucible in it reaches `mastered` the same way an eight-phase one does.
///
/// `frontier` is not produced here and never stored — it stays derived from
/// prerequisites by `displayStates`. A node with nothing done is `unknown`,
/// which is what displays as frontier once its prereqs are met.
///
/// - Parameters:
///   - shaky: how the last gate failed, if it did. Keeps a finished plan Shaky.
///   - started: work that has begun but finished no phase — a part-read Consume
///     pass. Without it a learner who read two sections and left would drop back
///     to displaying as frontier, and that progress is real.
public func stateFromPlan(
    _ plan: [Phase], _ done: [Phase] = [],
    shaky: ShakyReason? = nil, started: Bool = false
) -> NodeState {
    // Retain is the one rung mastery does not wait on. It is not something the
    // learner *does* in a session — it is weeks of review history — so a node
    // goes green when the last real gate closes and only then starts earning
    // Retido ✓. Requiring it here would mean no node was ever mastered until it
    // had been reviewed, which is not what green has meant.
    if planGates(plan).allSatisfy(done.contains) { return shaky != nil ? .shaky : .mastered }
    if shaky != nil { return .shaky }
    return !done.isEmpty || started ? .learning : .unknown
}

/// Which phase of its own plan a node is on — an index into `plan`, `-1` when
/// locked, and `plan.count` when the spiral is closed. That past-the-end value
/// is load-bearing: the rail draws every rung ticked rather than one current.
///
/// Mastered alone doesn't grant Retido ✓ — `reviewed` (real review history: a
/// card for this node graded good or better) is what completes the spiral, so a
/// `mastered` node that has never been reviewed sits *on* the last rung rather
/// than past it.
public func phaseIndex(
    _ plan: [Phase], _ done: [Phase] = [], state: NodeState, reviewed: Bool = false
) -> Int {
    if state == .unknown || state == .gap { return -1 }
    // Retain is finished by review history, not by a session, so `reviewed` is
    // what ticks that rung off. Everything else is ticked off by having been done.
    let next = plan.firstIndex { $0 == .retain ? !reviewed : !done.contains($0) }
    return next ?? plan.count
}

/// The phase a node's primary CTA opens — and therefore the one it must name.
/// Label and action both read this, or the button promises a phase it doesn't
/// open, which is what a fixed per-state label ("Continuar · Feynman") did the
/// moment plans stopped being one shared six-tuple.
///
/// `nil` means nothing is left to open and the CTA is the review queue. Shaky
/// is the exception to "first unfinished phase": every shaky line says
/// re-attempt the last gate, so a full ledger re-opens it.
public func primaryPhase(_ plan: [Phase], _ done: [Phase] = [], state: NodeState) -> Phase? {
    if let next = plan.first(where: { $0 != .retain && !done.contains($0) }) { return next }
    return state == .shaky ? planGates(plan).last : nil
}

// `readingPhaseIndex` is gone. It existed to correct a *state*-derived index
// with the reading record — state alone said Feynman on the strength of two
// sections read, so the reading pass had to argue its way back to Consume. With
// the plan-derived index there is nothing to correct: Consume enters
// `phasesDone` when the pass finishes, so a part-read node's first unfinished
// phase already *is* Consume. The one thing the reading record still decides is
// whether a node with nothing finished looks started, which is `stateFromPlan`'s
// `started` flag.
