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

    /// What the lens promises, said before the beats land — the sheet is opened
    /// by someone who is stuck, and a spinner over a bare title tells them
    /// nothing about what is coming. Mirrors `lensNote`.
    var note: LocalizedStringKey {
        switch self {
        case .simpler: "A mesma ideia, com as palavras mais simples possíveis."
        case .example: "Um caso concreto, resolvido passo a passo."
        case .analogy: "Uma comparação com algo que você já conhece."
        case .deeper: "O que está por trás — para quem já entendeu o básico."
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
    public struct Edge: Decodable, Sendable {
        public let from: String
        public let to: String
        /// Three words at most, and the prompt asks for it — so it is drawn on
        /// the arrow rather than generated, paid for and thrown away.
        public let label: String?

        public init(from: String, to: String, label: String? = nil) {
            self.from = from
            self.to = to
            self.label = label
        }
    }
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

    /// A check the learner can actually get right, or nil.
    ///
    /// The server refuses to write anything else (`validatePrediction`), but
    /// `consume` is generated on the device, where no validator runs: a check
    /// with no correct option is a gate that never opens, on a screen whose
    /// only exit is the back arrow. An unusable check leaves the section
    /// ungated, exactly like the pre-check content the model type already
    /// tolerates.
    var usable: ConsumePrediction? {
        opts.count >= 2 && opts.filter(\.correct).count == 1 ? self : nil
    }
}

/// How many sections a reading pass may run to — the mirror of
/// `CONSUME_SECTION_BOUNDS` (`lib/curriculum/consume.ts`).
///
/// The prompts were ported to the device; this bound was not, and it is the
/// half that says when a pass is *finished*. Without it a stream that died
/// after one section was indistinguishable from a concept that only needed
/// one, so a truncated reading was cached, uploaded and re-served as a whole
/// pass — see `WarmCache.fill(_:atLeast:live:)`.
public enum ConsumeSectionBounds {
    public static let min = 2
    public static let max = 6
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
    /// Absent on sections cached before checks existed, and on sections whose
    /// check came back unanswerable — both stay ungated rather than deadlocked.
    public var check: ConsumePrediction? { written?.usable }

    /// The check as the model wrote it. Read through `check`, which is the only
    /// thing the screen gates on.
    private let written: ConsumePrediction?

    private enum CodingKeys: String, CodingKey {
        case id, kicker, body, example, takeaway, cite, diagram, figure
        case written = "check"
    }
}

/// One beat of a model view — revealed in turn, never all at once.
///
/// Both halves are optional on the wire because a beat is written label-first:
/// a redraw carrying a label and no prose yet is exactly what the lens sheet is
/// meant to paint rather than sit blank through.
public struct ConsumeModelBeat: Decodable, Sendable {
    public let label: String
    public let text: String

    public init(label: String, text: String) {
        self.label = label
        self.text = text
    }

    public init(from decoder: any Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        label = try fields.decodeIfPresent(String.self, forKey: .label) ?? ""
        text = try fields.decodeIfPresent(String.self, forKey: .text) ?? ""
    }

    private enum CodingKeys: String, CodingKey { case label, text }
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

/// How long a rubric may be — `FEYNMAN_BEAT_BOUNDS`. Two rows is a complete
/// rubric for a concept that genuinely has two things to say; one row is a
/// stream that died. Without the floor here a truncated rubric was filed as a
/// whole one, the learner was told they were done, and the sub-points the model
/// never wrote could never become gaps.
public enum FeynmanBeatBounds {
    public static let min = 2
    public static let max = 4
}

/// The targeted micro-pass that closes one sub-point — one probe, one right
/// answer, and the misconception a real learner holds here written out in their
/// own voice. Every generation pays for one of these per beat
/// (`validateFeynmanBeat` fails without it), so a client that doesn't draw it
/// is buying the phase's only remediation loop and throwing it away.
public struct FeynmanFix: Decodable, Sendable {
    public struct Reply: Decodable, Sendable, Identifiable {
        public let label: String
        public let correct: Bool
        /// What the naive student says back when this one is picked.
        public let response: String
        public var id: String { label }
    }
    public let probe: String
    public let replies: [Reply]
}

public struct FeynmanBeat: Decodable, Sendable, Identifiable {
    public let id: String
    /// The sub-point being tested — never shown before they teach.
    public let subPoint: String
    /// What a solid explanation has to convey. The judge's rubric.
    public let mustConvey: [String]
    /// The one-probe corrective the Gap Report opens on this row. Optional so a
    /// row written before the field existed still decodes — the report simply
    /// offers no fix for it rather than blanking the whole rubric.
    public let fix: FeynmanFix?
    /// The red gap sub-node this beat writes back when left unresolved.
    public let gap: GapSpec
}

/// A beat's verdict: explained, hand-waved, or wrong. The judge's own three
/// words, and the one vocabulary the report, the map write-back and the saved
/// pass all speak.
public enum TeachVerdict: String, Codable, Sendable {
    case good, skipped, confused

    /// Green explained it, grey skipped it, red got it wrong — `VERDICT_COLOR`.
    public var color: Color {
        switch self {
        case .good: NodeState.mastered.color
        case .confused: NodeState.gap.color
        case .skipped: NodeState.unknown.color
        }
    }

    /// The verdict in words. Colour alone is invisible to VoiceOver and
    /// indistinguishable to a colour-blind learner.
    public var label: String {
        switch self {
        case .good: String(localized: "Bem explicado")
        case .confused: String(localized: "Errado · confuso")
        case .skipped: String(localized: "Pulado · enrolado")
        }
    }

    /// A row still owed — what writes back to the map as a red sub-node.
    public var isGap: Bool { self != .good }
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

/// A teach-back as the row holds it — the browser's own `FeynmanSession`, so a
/// pass parked on a phone reopens in a browser and back again. Every key the
/// browser writes is carried, including the three this client never draws
/// (`fixing`, `fixRuledOut`, `fixReaction`), because dropping one on save is
/// how a mid-fix pass reopens broken over there.
///
/// This is the phase that asks the most of the learner — five to fifteen
/// minutes of writing — and it was the only one that forgot it happened.
public struct FeynmanSnapshot: Codable, Sendable {
    public var nodeId: String
    public var started: Bool
    public var scaffolded: Bool
    /// The learner's own explanation, whole, as they taught it.
    public var explanation: String
    /// The naive student's reaction to it.
    public var response: String
    public var pending: Bool
    /// Verdict per beat id — `good` once a fix has closed the row.
    public var verdicts: [String: TeachVerdict]
    /// The words that earned each gap, per beat id.
    public var quotes: [String: String]
    public var jargon: [String]
    /// The previous pass's verdicts, kept across "teach it again" so the second
    /// report can show the delta — the one place the loop is visible working.
    public var previous: [String: TeachVerdict]?
    /// The explanation has been judged: the Gap Report is what reopens.
    public var reported: Bool
    public var fixing: String?
    public var fixRuledOut: [String]
    public var fixReaction: String?

    public init(
        nodeId: String, started: Bool = true, scaffolded: Bool = false,
        explanation: String = "", response: String = "", pending: Bool = false,
        verdicts: [String: TeachVerdict] = [:], quotes: [String: String] = [:],
        jargon: [String] = [], previous: [String: TeachVerdict]? = nil,
        reported: Bool = false, fixing: String? = nil,
        fixRuledOut: [String] = [], fixReaction: String? = nil
    ) {
        self.nodeId = nodeId; self.started = started; self.scaffolded = scaffolded
        self.explanation = explanation; self.response = response; self.pending = pending
        self.verdicts = verdicts; self.quotes = quotes; self.jargon = jargon
        self.previous = previous; self.reported = reported; self.fixing = fixing
        self.fixRuledOut = fixRuledOut; self.fixReaction = fixReaction
    }
}

/// How many rows a pass ended owing — the number the second-pass delta compares.
/// A row the judge never ruled on counts: silence about a sub-point the learner
/// never mentioned is exactly the finding this phase exists for.
public func feynmanGapCount(_ verdicts: [String: TeachVerdict], _ beats: [FeynmanBeat]) -> Int {
    beats.filter { (verdicts[$0.id] ?? .skipped).isGap }.count
}

/// Every sub-point explained well, nothing wrong or skipped. A phase that
/// cannot be won is a phase learners stop taking seriously.
public func feynmanClean(_ verdicts: [String: TeachVerdict], _ beats: [FeynmanBeat]) -> Bool {
    !beats.isEmpty && beats.allSatisfy { verdicts[$0.id] == .good }
}

/// The judge's rows, read against the rubric it was handed. A row it did not
/// rule on is a skip, not a pass — the server validator refuses such a payload
/// today, and this is the client not depending on that.
public func feynmanVerdicts(
    _ judgement: FeynmanJudgement, _ beats: [FeynmanBeat]
) -> (verdicts: [String: TeachVerdict], quotes: [String: String]) {
    let ruled = Dictionary(judgement.verdicts.map { ($0.i, $0) }, uniquingKeysWith: { first, _ in first })
    var verdicts: [String: TeachVerdict] = [:]
    var quotes: [String: String] = [:]
    for (index, beat) in beats.enumerated() {
        let row = ruled[index]
        verdicts[beat.id] = row.flatMap { TeachVerdict(rawValue: $0.verdict) } ?? .skipped
        if let quote = row?.quote?.trimmed, !quote.isEmpty { quotes[beat.id] = quote }
    }
    return (verdicts, quotes)
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
    /// One offered memory aid — list-like content only.
    public struct Mnemonic: Decodable, Sendable, Identifiable {
        /// Acronym · Method of loci · Vivid image.
        public let kind: String
        public let title: String
        /// The aid itself, editable before the learner accepts it.
        public let body: String
        public var id: String { "\(kind)|\(title)" }
    }
    public let centerId: String
    public let centerLabel: String
    /// The auto-detected encoding — `conceptual` or `list-like`. Absent in a
    /// payload written before this client read it, which reads as conceptual.
    public let encoding: String?
    /// The detector's plain-language rationale.
    public let detectNote: String
    public let center: Point
    public let cands: [ElaborationLink]
    /// The ordered items a mnemonic organizes (list-like only).
    public let items: [String]?
    /// The offered aids (list-like only).
    public let mnemonics: [Mnemonic]?

    /// Whether this node's material is genuinely enumerable — the one thing the
    /// mnemonic half of the phase turns on.
    public var isListLike: Bool { encoding == "list-like" && !(mnemonics ?? []).isEmpty }
}

/// Screen 17's pass, parked. Field for field the browser's `ConnectSession`,
/// because the two clients resume the same elaboration off the same column —
/// including the two mnemonic fields, which only list-like content ever fills.
public struct ConnectSnapshot: Codable, Sendable {
    public var nodeId: String
    /// The candidate whose linking prompt is open, or nil.
    public var active: String?
    /// What the learner has written, per candidate id.
    public var drafts: [String: String]
    /// Which links they have confirmed as true.
    public var linked: [String: Bool]
    /// Index into `content.mnemonics` — list-like only.
    public var mnemonicPick: Int?
    public var mnemonicDraft: String
    public var mnemonicAccepted: Bool

    public init(
        nodeId: String, active: String? = nil, drafts: [String: String] = [:],
        linked: [String: Bool] = [:], mnemonicPick: Int? = nil,
        mnemonicDraft: String = "", mnemonicAccepted: Bool = false
    ) {
        self.nodeId = nodeId; self.active = active; self.drafts = drafts
        self.linked = linked; self.mnemonicPick = mnemonicPick
        self.mnemonicDraft = mnemonicDraft; self.mnemonicAccepted = mnemonicAccepted
    }
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
