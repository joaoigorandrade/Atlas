import SwiftUI

// Screen 20 — what the learner actually knows, held against what they felt they
// knew. Mirrors the reading half of `lib/curriculum/calibration.ts`; the
// samples come from the confidence tap before every review card is flipped.
// ponytail: Review is the only hook so far — the Crucible's own tap is part of
// screen 18, and feeds the same `recordCalib` the day it lands.

/// One reading: stated confidence against first-try performance, both 0–100.
public struct CalibSample: Sendable, Identifiable {
    public let id: String
    public var felt: Int
    public var real: Int
}

/// How a reading sits against the diagonal.
public enum CalibVerdict: Sendable {
    case over, under, ok

    var label: String {
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
