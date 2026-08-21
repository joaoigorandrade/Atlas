import Foundation
import SwiftUI

// What the five session phases decode off `/api/generate`. Mirrors the parts of
// `lib/curriculum/{consume,socratic,feynman,connect,crucible}.ts` a screen
// actually renders — a field nothing draws is a field that can't drift, so it
// isn't declared here. Unknown keys are ignored by `Codable`, which is what
// makes that safe.

// MARK: - Consume (screen 14)

/// The four lenses under a section. Tapping one opens a model view over the
/// section — the same material walked through a beat at a time.
public enum AltKey: String, Codable, Sendable, CaseIterable, Identifiable {
    public var id: String { rawValue }

    case simpler, example, analogy, deeper

    var label: LocalizedStringKey {
        switch self {
        case .simpler: "Mais simples"
        case .example: "Exemplo"
        case .analogy: "Analogia"
        case .deeper: "Aprofundar"
        }
    }
}

/// A worked example, rendered inline under the prose.
public struct ConsumeExample: Decodable, Sendable {
    public let title: String
    public let steps: [String]
}

/// A schematic figure: labelled boxes wired by directed arrows.
public struct ConsumeFigure: Decodable, Sendable {
    public struct Node: Decodable, Sendable, Identifiable { public let id: String; public let label: String }
    public struct Edge: Decodable, Sendable { public let from: String; public let to: String }
    public let nodes: [Node]
    public let edges: [Edge]
}

/// Longest-path layer per figure node. Cycle-safe — the relaxation is capped at
/// the node count — so a model-authored loop can't hang the renderer. Mirrors
/// `figureLayers` in `lib/curriculum/consume.ts`.
public func figureLayers(_ figure: ConsumeFigure) -> [String: Int] {
    var layer = Dictionary(uniqueKeysWithValues: figure.nodes.map { ($0.id, 0) })
    for _ in figure.nodes.indices {
        var moved = false
        for edge in figure.edges {
            let want = (layer[edge.from] ?? 0) + 1
            if want > (layer[edge.to] ?? 0), layer[edge.to] != nil {
                layer[edge.to] = want
                moved = true
            }
        }
        if !moved { break }
    }
    return layer
}

/// The comprehension check that closes a section. Continue is gated on it.
public struct ConsumePrediction: Decodable, Sendable {
    public struct Option: Decodable, Sendable { public let label: String; public let correct: Bool }
    public let q: String
    public let opts: [Option]
    public let right: String
    public let wrong: String
}

public struct ConsumeChunk: Decodable, Sendable, Identifiable {
    public let id: String
    /// Segment label, e.g. "1 · O que é".
    public let kicker: String
    /// The explanation itself — several paragraphs, on screen the moment the
    /// section is.
    public let body: [String]
    public let example: ConsumeExample?
    public let takeaway: String
    /// Further reading, when the model had an honest work to name.
    public let cite: String?
    public let diagram: String?
    public let figure: ConsumeFigure?
    /// Absent on sections cached before checks existed — those stay ungated.
    public let check: ConsumePrediction?
}

/// One beat of a model view — revealed in turn, never all at once.
public struct ConsumeModelBeat: Decodable, Sendable {
    public let label: String
    public let text: String
}

// MARK: - Socratic (screen 15)

public struct SocraticStep: Decodable, Sendable, Identifiable {
    public struct Reply: Decodable, Sendable {
        public let label: String
        /// `correct` · `near` · `wrong` · `lost`.
        public let quality: String
    }
    public let id: String
    public let move: String
    /// The probing question the tutor opens the step with.
    public let prompt: String
    public let replies: [Reply]
    /// Raised-help scaffold, and the reference the judge grades against.
    public let hint: String
    public let tell: String
    /// A held-back probe: written, but only spent by a struggling learner.
    public let spare: Bool?
}

/// How many probes a written pass *plans* to run — its core steps, spares held
/// back. Mirrors `socraticPlan` in `lib/curriculum/feynman.ts`.
public func socraticPlan(_ steps: [SocraticStep]) -> Int {
    let core = steps.filter { $0.spare != true }.count
    return core > 0 ? core : max(steps.count, 1)
}

public struct SocraticJudgement: Decodable, Sendable {
    public let quality: String
    public let response: String
    public let misconception: String?

    /// `correct` closes the step, `lost` drops the act and closes it too;
    /// `near`/`wrong` earn help and another try on the same probe.
    var closesStep: Bool { quality == "correct" || quality == "lost" }
}

// MARK: - Feynman (screen 16)

public struct FeynmanBeat: Decodable, Sendable, Identifiable {
    public let id: String
    /// The sub-point being tested — never shown before they teach.
    public let subPoint: String
    /// What a solid explanation has to convey. The judge's rubric.
    public let mustConvey: [String]
    /// The red gap sub-node this beat writes back when left unresolved.
    public let gap: GapSpec
}

public struct FeynmanJudgement: Decodable, Sendable {
    public struct Row: Decodable, Sendable {
        public let i: Int
        /// `good` · `skipped` · `confused`.
        public let verdict: String
        public let quote: String?
    }
    public let verdicts: [Row]
    public let response: String
    /// Terms they used but never unpacked.
    public let jargon: [String]?
}

// MARK: - Connect (screen 17)

/// A candidate prior node to link to — a real node the learner already owns.
public struct ElaborationLink: Decodable, Sendable, Identifiable {
    public let id: String
    public let label: String
    /// Placement in the 560×440 concept-web canvas.
    public let x: Double
    public let y: Double
    /// The relationship draft pulled from the map — accepted or rewritten.
    public let rel: String
}

public struct ElaborationContent: Decodable, Sendable {
    public struct Point: Decodable, Sendable { public let x: Double; public let y: Double }
    public let centerId: String
    public let centerLabel: String
    /// The detector's plain-language rationale.
    public let detectNote: String
    public let center: Point
    public let cands: [ElaborationLink]
}

// MARK: - Crucible (screen 18)

/// One problem on the ladder — a framing the learner was never handed.
public struct CrucibleProblem: Decodable, Sendable {
    public let tag: String
    public let q: String
    /// A nudge that reframes without giving it away.
    public let hint: String
    public let placeholder: String
}

/// One row of the transfer diagnostic — which sub-concept moved frames.
public struct TransferRow: Decodable, Sendable {
    /// `good` (carried over) or `red` (didn't).
    public let verdict: String
    public let text: String
}

public struct CrucibleContent: Decodable, Sendable {
    public let centerId: String
    public let centerLabel: String
    /// The sub-concept a first-attempt failure writes back to the map.
    public let gap: GapSpec
    /// [0] the novel transfer, [1] the scaffolded re-attempt.
    public let problems: [CrucibleProblem]
    /// The 30-second re-explanation aimed straight at the gap.
    public let reExplain: String
}

public struct CrucibleJudgement: Decodable, Sendable {
    /// `pass` (transfer confirmed) or `partial`.
    public let outcome: String
    public let transfer: [TransferRow]
    public let gapLabel: String?
    public let gapReason: String?
    public let reExplain: String?

    var passed: Bool { outcome == "pass" }
}
