import Foundation

// ---- Phase · Predict (forecast before the answer) --------------------------
// A situation the principle governs, and one question: what happens? Said
// before being shown, and committed — a forecast you can read off the screen is
// not a forecast.
//
// Only a `principle` runs this. The test of having a mechanism is whether it
// forecasts; a concept classifies, a fact is had, and a procedure's forecast is
// just running it, which is Perform.
//
// What Predict grades that nothing else does: the learner states a confidence
// before committing, so a wrong forecast held confidently is separated from a
// wrong one held loosely. That reading feeds the same calibration curve the
// Crucible's confidence tap does. Mirrors `lib/curriculum/predict.ts`.

/// How sure the learner is, taken before the outcome is revealed. Held against
/// what actually happened, this is a calibration reading.
public let predictConfidence = [35, 65, 90]

public struct PredictSetup: Decodable, Sendable, Identifiable {
    public let id: String
    /// The situation, with whatever the forecast turns on. Never hints at the
    /// outcome.
    public let situation: String
    /// Candidate outcomes — the right one, plus what a learner forecasts when
    /// they hold the relation backwards or drop a condition.
    public let outcomes: [String]
    public let answerIndex: Int
    /// The causal chain that made this outcome the one that had to happen.
    /// Revealed only after the commit.
    public let because: String
}

public struct PredictContent: Decodable, Sendable {
    public let nodeId: String
    public let nodeLabel: String
    public let setups: [PredictSetup]
}

public struct PredictSession: Sendable {
    public let nodeId: String
    public var index = 0
    /// Committed forecast per setup id.
    public var forecasts: [String: Int] = [:]
    /// Confidence stated before committing, per setup id (an index into
    /// `predictConfidence`). Absent while the current setup is unrated.
    public var sureness: [String: Int] = [:]
    public var done = false

    public init(nodeId: String) { self.nodeId = nodeId }

    /// Only before the forecast is in. Afterwards it would be a rating of a
    /// result already seen, which is not calibration.
    public mutating func sure(_ level: Int, _ content: PredictContent) {
        guard let item = content.setups[safe: index], forecasts[item.id] == nil else { return }
        sureness[item.id] = level
    }

    public mutating func commit(_ outcome: Int, _ content: PredictContent) {
        guard let item = content.setups[safe: index], forecasts[item.id] == nil else { return }
        forecasts[item.id] = outcome
    }

    public mutating func next(_ content: PredictContent) {
        guard let item = content.setups[safe: index], forecasts[item.id] != nil else { return }
        index += 1
        done = index >= content.setups.count
    }

    public func score(_ content: PredictContent) -> Int {
        content.setups.filter { forecasts[$0.id] == $0.answerIndex }.count
    }

    /// Forecasts held confidently and still wrong — the reading Predict exists
    /// to surface. A mechanism you trust and that does not hold is worse than
    /// one you were unsure of, and the closing panel says so.
    public func overconfident(_ content: PredictContent) -> [PredictSetup] {
        content.setups.filter {
            forecasts[$0.id] != nil && forecasts[$0.id] != $0.answerIndex
                && (sureness[$0.id] ?? 0) >= predictConfidence.count - 1
        }
    }

    /// Felt-vs-real pairs for the calibration curve: what they said they knew,
    /// against whether the forecast actually held.
    public func calibration(_ content: PredictContent) -> [(felt: Int, real: Int)] {
        content.setups.compactMap { setup in
            guard let level = sureness[setup.id], let felt = predictConfidence[safe: level] else { return nil }
            return (felt, forecasts[setup.id] == setup.answerIndex ? 90 : 20)
        }
    }

    /// Predict's gate: two thirds forecast correctly. Confidence is measured and
    /// reported, never gated on — being unsure and right is a good forecast.
    public func passed(_ content: PredictContent) -> Bool {
        guard !content.setups.isEmpty else { return done }
        return score(content) >= Int((Double(content.setups.count) * 2 / 3).rounded(.up))
    }
}
