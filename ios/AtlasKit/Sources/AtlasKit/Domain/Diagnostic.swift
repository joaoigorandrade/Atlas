import Foundation
import SwiftUI

// The onboarding form and the placement ladder — a mirror of the diagnostic
// half of `lib/curriculum/calibration.ts`. Logic only: what a graded answer
// writes to the map, and how hard the next question is pitched.

public enum GoalKind: String, Codable, Sendable, CaseIterable {
    case exam, project, mastery, pareto

    /// The design draws these as a 2×2 grid, so the labels are the short ones.
    var label: LocalizedStringKey {
        switch self {
        case .exam: "Passar na prova"
        case .pareto: "Top 20%"
        case .mastery: "Dominar tudo"
        case .project: "Construir um projeto"
        }
    }
}

/// What the welcome screen collects. `paretoPct` is only sent for the Pareto
/// goal — the server honours the offered shares and nothing else.
public struct OnboardingForm: Sendable {
    public var topic = ""
    public var goal: GoalKind = .exam
    public var interests = ""
    public var target = 15
    public var paretoPct = 20

    public init() {}
}

/// The daily-target minutes the streak is counted in. Same four as the web's
/// `DAILY_TARGETS` — a fifth would be a different streak unit.
public let dailyTargets = [10, 15, 20, 30]

public enum DiagnosticDifficulty: String, Codable, Sendable, CaseIterable {
    case easy, medium, hard

    var label: LocalizedStringKey {
        switch self {
        case .easy: "Fácil"
        case .medium: "Média"
        case .hard: "Difícil"
        }
    }
}

/// How many placement questions a build asks. Fixed rather than derived: the
/// questions arrive one at a time, so both the rail and "pergunta i de N" need
/// the total before the last one exists.
public let diagnosticCount = 5

/// One generated placement probe. `nodeId` names the concept the answer writes
/// back to; `gap` is the sub-concept a genuine miss splits out under it.
public struct DiagnosticQuestion: Decodable, Sendable {
    public let tag: String
    public let q: String
    public let note: String
    public let nodeId: String
    public let difficulty: DiagnosticDifficulty
    public let opts: [Option]
    public let correctIndex: Int
    public let gap: GapSpec?

    public struct Option: Decodable, Sendable { public let label: String }
}

/// What a graded answer writes to the map.
public enum DiagnosticEffect: Sendable { case mastered, shaky }

/// One step harder after a correct answer, one easier after a miss, clamped at
/// the ends — the ENEM-style staircase.
public func stepDifficulty(_ current: DiagnosticDifficulty, correct: Bool) -> DiagnosticDifficulty {
    let ladder = DiagnosticDifficulty.allCases
    let next = (ladder.firstIndex(of: current) ?? 1) + (correct ? 1 : -1)
    return ladder[min(ladder.count - 1, max(0, next))]
}

/// A miss on a question *strictly easier* than the hardest one already answered
/// correctly reads as a slip, not a gap — it writes back as known and spawns
/// nothing. Strictly easier, not "no harder": one right and one wrong at the
/// same level is a coin flip, and the write it triggers is not recoverable.
public func diagnosticEffect(
    _ difficulty: DiagnosticDifficulty,
    correct: Bool,
    maxCorrect: DiagnosticDifficulty?
) -> DiagnosticEffect {
    if correct { return .mastered }
    let ladder = DiagnosticDifficulty.allCases
    let rank = { (d: DiagnosticDifficulty) in ladder.firstIndex(of: d) ?? 0 }
    guard let maxCorrect, rank(difficulty) < rank(maxCorrect) else { return .shaky }
    return .mastered
}

/// The mastery write. A correct answer (or a discounted slip) prunes the
/// concept *and its whole prerequisite chain* — knowing something is evidence
/// for everything it stands on. A genuine miss touches only the concept: the
/// chain below it is the likeliest place the reason is hiding, and pruning it
/// would hide that for good.
public func applyDiagnosticEffect(
    _ states: StateMap,
    _ effect: DiagnosticEffect,
    nodeId: String,
    edges: [ConceptEdge]
) -> StateMap {
    var next = states
    guard effect == .mastered else {
        next[nodeId] = .shaky
        return next
    }
    for id in ancestors(of: nodeId, edges) { next[id] = .mastered }
    return next
}

/// Every ancestor of `id` along prerequisite edges, including itself.
public func ancestors(of id: String, _ edges: [ConceptEdge]) -> Set<String> {
    var reverse: [String: [String]] = [:]
    for edge in edges { reverse[edge.to, default: []].append(edge.from) }
    var seen: Set<String> = [id]
    var stack = [id]
    while let current = stack.popLast() {
        for parent in reverse[current] ?? [] where seen.insert(parent).inserted {
            stack.append(parent)
        }
    }
    return seen
}
