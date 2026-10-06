import SwiftUI

// The phase catalogue: what a phase is, which phases exist, and which of them a
// node actually runs. The port of `lib/curriculum/phases.ts`.
//
// Phase used to be *derived from mastery state* here too — a fixed six-tuple
// indexed by `phaseIndex(state, reviewed)` — which is why every node on every
// map ran the same ladder whether it was a definition, a procedure or a causal
// chain. Now the node carries its own plan and state is derived from what the
// learner has finished (`stateFromPlan`, in `Calibration.swift`).

/// What kind of thing a concept is — which is what decides how it should be
/// practised. Merrill's component taxonomy, with Process folded into Principle.
///
/// The kind names what the learner must be able to *do*, not the subject area:
/// "fotossíntese" and "como um projeto de lei vira lei" are both `principle`.
/// Anything ambiguous resolves to `concept`, which is what every node was
/// before kinds existed — so a bad pick degrades to the old behaviour rather
/// than to nonsense.
public enum NodeKind: String, Codable, Sendable, CaseIterable {
    case fact, concept, procedure, principle
}

/// A kind off the wire, or `concept` for anything this build does not know.
/// Never a throw: a map built by a newer server must still draw here.
public func asNodeKind(_ raw: String?) -> NodeKind {
    NodeKind(rawValue: raw ?? "") ?? .concept
}

/// How much the learner's goal rests on a concept, and so the bar it is held
/// to: `core` is mastered (a city), `working` is used (a town), `peripheral`
/// is recognised (a village). Mirrors `NodeImportance` in `cells.ts`; anything
/// unknown reads as `core`.
public enum NodeImportance: String, Codable, Sendable, CaseIterable {
    case core, working, peripheral
}

/// How hard a concept is for a newcomer holding its prerequisites — drawn as
/// relief beside the city. Mirrors `NodeDifficulty`; unknown reads as `medium`.
public enum NodeDifficulty: String, Codable, Sendable, CaseIterable {
    case easy, medium, hard
}

/// The phase catalogue, in canonical order. Every node's plan is a
/// *subsequence* of this list, which is what keeps a phase index monotone and
/// the rail left-to-right whatever plan a node is on.
///
/// The raw values are the web's `PhaseId` — what `phases_done` and `phase_plan`
/// carry on the wire — and not the product label, which is `label` below.
/// `Retained` is the one place the two differ, and it differed silently until
/// the ledger started round-tripping through this enum.
public enum Phase: String, Codable, CaseIterable, Sendable, Identifiable {
    case consume, explain, discriminate, provenance, socratic, steelman, predict, trace
    case feynman, perform, drill, produce, connect, crucible, recall, retain
    public var id: String { rawValue }
}

public extension Phase {
    /// A phase's product label — English in both languages, by design
    /// (AGENTS.md §Copy). Everything a learner reads *around* it is translated.
    var label: String {
        switch self {
        case .consume: "Consume"
        case .explain: "Explain"
        case .discriminate: "Discriminate"
        case .provenance: "Provenance"
        case .socratic: "Socratic"
        case .steelman: "Steelman"
        case .predict: "Predict"
        case .trace: "Trace"
        case .feynman: "Feynman"
        case .perform: "Perform"
        case .drill: "Drill"
        case .produce: "Produce"
        case .connect: "Connect"
        case .crucible: "Crucible"
        case .recall: "Recall"
        case .retain: "Retained"
        }
    }

    /// The signal this phase extracts that no other one can. A candidate that
    /// adds no new signal is a setting, not a phase — the rule is pinned by a
    /// test on the web and stated here so the two lists cannot drift apart.
    var signal: String {
        switch self {
        case .consume: "exposure"
        case .explain: "explanation design"
        case .discriminate: "boundary"
        case .provenance: "evidence quality"
        case .socratic: "reasoning under questioning"
        case .steelman: "holding a contested position"
        case .predict: "forecast before the answer"
        case .trace: "following a mechanism step by step"
        case .feynman: "unaided production"
        case .perform: "execution under real conditions"
        case .drill: "speed and automaticity"
        case .produce: "real-time production"
        case .connect: "elaborative encoding"
        case .crucible: "transfer"
        case .recall: "unaided retrieval"
        case .retain: "durability"
        }
    }

    /// The generated kind this phase renders — what has to be ready before it
    /// opens. Retido reads review cards, which are drafted per node rather than
    /// per phase, so it names none.
    var kind: String? { self == .retain ? nil : rawValue }

    /// The phase colour, carried by the CTA's tint and the header kicker and
    /// nothing else. Socratic and Feynman share one — they are the same half of
    /// the spiral, and the design draws them in the same blue.
    var tint: Color {
        switch self {
        case .consume: Palette.accent
        case .socratic, .feynman: NodeState.learning.color
        case .explain: Palette.explainInk
        case .discriminate: Palette.discriminateInk
        case .provenance: Palette.provenanceInk
        case .steelman: Palette.steelmanInk
        case .produce: Palette.produceInk
        case .predict: Palette.predictInk
        case .trace: Palette.traceInk
        case .perform: Palette.performInk
        case .drill: Palette.drillInk
        case .recall: Palette.recallInk
        case .connect: Palette.connectInk
        case .crucible: Palette.crucibleInk
        case .retain: NodeState.mastered.color
        }
    }

    /// What the phase asks the learner to do, in one line — the drawer lists the
    /// names, and twelve English product names say nothing on their own.
    var blurb: LocalizedStringKey {
        switch self {
        case .consume: "Ler a explicação, seção por seção"
        case .explain: "Ver como explicar isso a outra pessoa"
        case .discriminate: "Separar casos verdadeiros dos que só parecem"
        case .provenance: "Pesar de onde vem uma afirmação"
        case .socratic: "Responder perguntas que constroem a ideia"
        case .steelman: "Defender os dois lados de uma disputa"
        case .predict: "Prever o resultado antes de vê-lo"
        case .trace: "Seguir o mecanismo passo a passo"
        case .feynman: "Explicar com suas palavras, sem apoio"
        case .perform: "Executar num caso real"
        case .drill: "Decidir rápido, até virar automático"
        case .produce: "Dizer em voz alta, em tempo real"
        case .connect: "Ligar ao que você já sabe"
        case .crucible: "Aplicar num problema que nunca viu"
        case .recall: "Lembrar sem olhar"
        case .retain: "Revisar no momento certo para não esquecer"
        }
    }

    /// The header kicker the design writes above the node's name.
    var kicker: LocalizedStringKey {
        switch self {
        case .consume: "Consume · leitura"
        case .explain: "Explain · como explicar"
        case .discriminate: "Discriminate · fronteira"
        case .provenance: "Provenance · a fonte"
        case .socratic: "Socratic · sessão"
        case .steelman: "Steelman · os dois lados"
        case .predict: "Predict · previsão"
        case .trace: "Trace · cadeia"
        case .feynman: "Feynman · ensine de volta"
        case .perform: "Perform · execução"
        case .drill: "Drill · ritmo"
        case .produce: "Produce · em voz alta"
        case .connect: "Connect · elaboração"
        case .crucible: "Crisol · aplicação"
        case .recall: "Recall · memória"
        case .retain: "Retido · revisão"
        }
    }

    /// The gentle push back when a learner taps a phase ahead of the one they
    /// are owed. Mirrors `PHASE_SKIP_NUDGE_PT` — it names the phase they'd be
    /// skipping, not the one they tapped.
    var skipNudge: LocalizedStringKey {
        switch self {
        case .consume: "Você ainda não leu isso — quer ler?"
        case .explain: "Você ainda não viu como explicar isso — quer ver?"
        case .discriminate: "Você ainda não distinguiu isso dos vizinhos — quer tentar?"
        case .provenance: "Você ainda não pesou a fonte disso — quer tentar?"
        case .socratic: "Você ainda não raciocinou sobre isso — quer tentar?"
        case .steelman: "Você ainda não defendeu os dois lados disso — quer tentar?"
        case .predict: "Você ainda não previu isso — quer tentar?"
        case .trace: "Você ainda não percorreu isso passo a passo — quer tentar?"
        case .feynman: "Você ainda não ensinou isso de volta — quer tentar?"
        case .perform: "Você ainda não executou isso num caso real — quer tentar?"
        case .drill: "Você ainda não fez essas decisões no ritmo — quer tentar?"
        case .produce: "Você ainda não disse isso em voz alta — quer tentar?"
        case .connect: "Você ainda não ligou isso ao seu mapa — quer tentar?"
        case .crucible: "Você ainda não aplicou isso em um contexto novo — quer tentar?"
        case .recall: "Você ainda não recuperou isso de memória — quer tentar?"
        case .retain: "Isso ainda não está na sua rotação de revisão — quer adicionar?"
        }
    }
}

/// Which phases a node of each kind actually runs.
///
/// Resolved once at map-build time and *stored* on the node (`nodes.phase_plan`),
/// never recomputed — editing this table ships a new ladder for maps built
/// after it, and cannot rewrite a run already in progress. This client never
/// builds a map, so it reads the stored plan and falls back here only for a
/// node whose row predates the column.
///
/// Why they differ: a fact has nothing to reason from — tell it from its
/// neighbours, drill it, wire it, retrieve it cold. A concept is a
/// classification, so discriminating instances is the whole job. A procedure is
/// executed — watch it run, run it, run it fast, choose it under pressure. A
/// principle is a mechanism — forecast it, walk its causal chain, explain it.
/// Explain sits behind the reading on every kind: how to put it across to
/// someone else, before Feynman asks for that explanation unaided.
public let phasePlans: [NodeKind: [Phase]] = [
    .fact: [.consume, .explain, .discriminate, .drill, .connect, .recall, .retain],
    .concept: [.consume, .explain, .discriminate, .socratic, .feynman, .connect, .crucible, .recall, .retain],
    .procedure: [.consume, .explain, .trace, .feynman, .perform, .drill, .connect, .crucible, .retain],
    .principle: [.consume, .explain, .socratic, .predict, .trace, .feynman, .connect, .crucible, .retain],
]

/// The pre-catalogue ladder, and the `phase_plan` every row built before it was
/// defaulted to by the migration. Kept as its own name so a backfill check has
/// something explicit to assert against.
public let legacyPhasePlan: [Phase] = [
    .consume, .socratic, .feynman, .connect, .crucible, .retain,
]

/// The phases of a plan that actually gate mastery — everything but Retain,
/// which is closed by weeks of review history rather than by a session.
/// The two-thirds bar five phases pass on — ⌈2n/3⌉ in integers, the same
/// count `Math.ceil(n * (2 / 3))` gives on the web for every n that matters.
public func twoThirds(_ count: Int) -> Int { (2 * count + 2) / 3 }

public func planGates(_ plan: [Phase]) -> [Phase] {
    plan.filter { $0 != .retain }
}

/// The gate that proves a concept cold: the Crucible wherever the plan has
/// one, else its last gate. Mirrors `proofGate` in `phases.ts`.
public func proofGate(_ plan: [Phase]) -> Phase {
    plan.contains(.crucible) ? .crucible : (lastGate(plan) ?? .consume)
}

/// The gate that proves a node last. Never Explain: it models an explanation
/// rather than proving anything. Mirrors `lastGate` in `phases.ts`.
public func lastGate(_ plan: [Phase]) -> Phase? {
    planGates(plan.filter { $0 != .explain }).last
}

/// The ledger after `phase` closes. Under a "prove it" challenge, passing the
/// proof gate credits every gate before it; otherwise the phase is appended.
/// Retain never enters the ledger. Mirrors `ledgerAfter` in `calibration.ts`.
public func ledgerAfter(
    _ plan: [Phase], _ prev: [Phase], _ phase: Phase, challenged: Bool, clean: Bool = false
) -> [Phase] {
    let gates = planGates(plan)
    if challenged && phase == proofGate(plan) {
        return prev + gates.filter { !prev.contains($0) }
    }
    let next = prev.contains(phase) ? prev : prev + [phase]
    guard clean, let at = gates.firstIndex(of: phase) else { return next }
    // Earned skips (W3.2): a harder phase passed clean on the first try is the
    // proof an easier unfinished gate before it exists to build.
    let before = gates.prefix(at)
    return next + (credits[phase] ?? []).filter { before.contains($0) && !next.contains($0) }
}

/// Which easier gates a clean first-try pass credits. Mirrors `CREDITS`.
public let credits: [Phase: [Phase]] = [
    .feynman: [.socratic],
    .perform: [.trace],
]

/// Which phases each node has finished, in completion order — the record
/// mastery state is *derived* from. A parallel map rather than a field on the
/// node, so finishing a phase doesn't rewrite the graph, and for the same
/// reason `shakyReasons` and `reviewedNodes` are parallel maps.
public typealias PhasesDoneMap = [String: [Phase]]

public extension ConceptNode {
    /// The plan this node runs: its stored one, else its kind's. A node with
    /// neither is one a client invented this tick (a spawned gap), and gap nodes
    /// render no spiral at all.
    var plan: [Phase] {
        if let stored = phasePlan, !stored.isEmpty { return stored }
        return resolvePlan(kind ?? .concept, domain ?? .general, importance ?? .core, difficulty ?? .medium)
    }

    /// Minutes of work this node still owes: its cell's budget, in proportion
    /// to the gates it has not finished yet. Mirrors `minutesLeft` in `replan.ts`.
    func minutesLeft(_ done: [Phase]) -> Int {
        let gates = planGates(plan)
        let whole = gates.reduce(0) { $0 + $1.minutes }
        guard whole > 0 else { return 0 }
        let owed = gates.filter { !done.contains($0) }.reduce(0) { $0 + $1.minutes }
        let budget = cellBudget(importance ?? .core, difficulty ?? .medium)
        let share = Double(budget * owed) / Double(whole)
        // A core node never promises less than its phases take (W3.6);
        // working and peripheral phases are cut to their budget already.
        // Mirrors `DIFFICULTY_PACE` in `replan.ts`.
        let pace: Double = switch difficulty ?? .medium {
        case .easy: 0.75
        case .medium: 1
        case .hard: 1.25
        }
        let floor = (importance ?? .core) == .core ? Double(owed) * pace : 0
        return Int(max(share, floor).rounded())
    }
}

public extension Phase {
    /// Rough minutes of focused work per phase — `PHASE_MINUTES` in
    /// `replan.ts`. Retain is the shared review queue, budgeted on its own.
    /// ponytail: estimates until real session-length analytics exist (#23).
    var minutes: Int {
        switch self {
        case .consume, .steelman, .perform, .crucible: 10
        case .socratic, .feynman, .produce: 8
        case .provenance: 6
        case .predict, .trace, .connect, .recall: 5
        case .explain, .discriminate: 4
        case .drill: 3
        case .retain: 0
        }
    }
}

/// Does closing the last gate master this node, or does it still owe earlier
/// ones? A learner who jumped ahead passes the Crucible and stays Learning, and
/// the closing copy has to say which of the two happened.
public func lastGateMasters(_ node: ConceptNode, _ done: [Phase], closing phase: Phase) -> Bool {
    planGates(node.plan).allSatisfy { $0 == phase || done.contains($0) }
}
