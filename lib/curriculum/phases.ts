// The phase catalogue: what a phase is, which phases exist, and which of them
// a node actually runs.
//
// Phase used to be *derived from mastery state* — a fixed six-tuple indexed by
// `phaseIndex(state, reviewed)` — which is why every node on every map ran the
// same ladder whether it was a definition, a procedure or a causal chain. Now
// the node carries its own plan and state is derived from what the learner has
// finished (`stateFromPlan` in `calibration.ts`).

import type { Language } from "@/lib/i18n";

/**
 * What kind of thing a concept is — which is what decides how it should be
 * practised. Merrill's component taxonomy, with Process folded into Principle.
 *
 * The kind names what the learner must be able to *do*, not the subject area:
 * "photosynthesis" and "how a bill becomes law" are both `principle`. Anything
 * ambiguous resolves to `concept`, which is what every node was before kinds
 * existed — so a bad pick degrades to the old behaviour rather than to nonsense.
 */
export type NodeKind = "fact" | "concept" | "procedure" | "principle";

export const NODE_KINDS = ["fact", "concept", "procedure", "principle"] as const;

export function asNodeKind(raw: unknown): NodeKind {
  return (NODE_KINDS as readonly string[]).includes(raw as string)
    ? (raw as NodeKind)
    : "concept";
}

/**
 * The phase catalogue, in canonical order. Every node's plan is a *subsequence*
 * of this list, which is what keeps a phase index monotone and the rail
 * left-to-right whatever plan a node is on.
 *
 * A phase earns its place by extracting a signal no other phase can (see
 * `PHASE_DEFS[id].signal`). A candidate that adds no new signal is a setting,
 * not a phase.
 *
 * This list holds only phases that are *built*. The catalogue is growing to
 * twelve, and each new one is inserted here at its canonical position by the
 * release that implements it — so `PHASE_PLAN` is never inconsistent with what
 * exists, and the "every phase has a home" invariant stays meaningful. The
 * full target order, with the unbuilt ones marked:
 *
 *   consume · discriminate† · socratic · predict† · trace† · feynman ·
 *   perform† · drill† · connect · crucible · recall† · retain
 */
export const PHASE_ORDER = [
  "consume",
  "socratic",
  "feynman",
  "connect",
  "crucible",
  "retain",
] as const;

export type PhaseId = (typeof PHASE_ORDER)[number];

/**
 * A phase's identity. `label` is product vocabulary and stays English in both
 * languages (AGENTS.md §"Both languages, always"); everything a learner reads
 * *around* it is translated.
 *
 * There is deliberately no `enter` here: the enter functions are closures over
 * `useSpiral`'s refs and can't be hoisted out of the hook. `useSpiral` builds
 * its own `Record<PhaseId, (node) => void>` and dispatches through that.
 *
 * There is also no generation `kind`: a phase's `/api/generate` kind is always
 * its own `PhaseId`, so a second field would only be a second thing to keep in
 * step.
 */
export const PHASE_DEFS: Record<PhaseId, { label: string; signal: string }> = {
  consume: { label: "Consume", signal: "exposure" },
  socratic: { label: "Socratic", signal: "reasoning under questioning" },
  feynman: { label: "Feynman", signal: "unaided production" },
  connect: { label: "Connect", signal: "elaborative encoding" },
  crucible: { label: "Crucible", signal: "transfer" },
  retain: { label: "Retained", signal: "durability" },
};

/**
 * Which phases a node of each kind actually runs.
 *
 * Resolved once at map-build time and *stored* on the node (`nodes.phase_plan`),
 * never recomputed — editing this table ships a new ladder for maps built after
 * it, and cannot rewrite a run already in progress.
 *
 * All four rows are identical today, and that is the point: the catalogue ships
 * before the phases that make the rows differ, so nothing a learner sees moves.
 * Each release adds its phase to the rows whose kind wants it.
 *
 * Three invariants, each pinned by a test in `tests/curriculum.test.ts`:
 *   1. every plan is a subsequence of PHASE_ORDER
 *   2. `consume` and `retain` are in every plan (the warm chain needs a known
 *      first and last; `readingPhaseIndex` needs Consume at index 0)
 *   3. every phase has at least one home — one that doesn't is dead code
 */
export const PHASE_PLAN: Record<NodeKind, readonly PhaseId[]> = {
  fact: PHASE_ORDER,
  concept: PHASE_ORDER,
  procedure: PHASE_ORDER,
  principle: PHASE_ORDER,
};

/** Today's ladder, and the `phase_plan` every pre-catalogue row was defaulted
 *  to by the migration. Kept as its own name so the backfill check and the
 *  "R0 is a no-op" test assert against something explicit. */
export const LEGACY_PHASE_PLAN: readonly PhaseId[] = [
  "consume",
  "socratic",
  "feynman",
  "connect",
  "crucible",
  "retain",
];

/**
 * Which phases each node has finished, in completion order — the record that
 * mastery state is *derived* from (`stateFromPlan`). A parallel map rather than
 * a field on the node, so finishing a phase doesn't rewrite the graph, and for
 * the same reason `shakyReasons` and `reviewedNodes` are parallel maps.
 */
export type PhasesDoneMap = Record<string, readonly PhaseId[]>;

/** The plan a node runs: its stored one, else its kind's. A node with neither
 *  is one the client invented this tick (a spawned gap), and gap nodes render
 *  no spiral at all. */
export function phasePlan(node: {
  phasePlan?: readonly PhaseId[];
  kind?: NodeKind;
}): readonly PhaseId[] {
  return node.phasePlan?.length ? node.phasePlan : PHASE_PLAN[node.kind ?? "concept"];
}

/**
 * The gentle skip flag: what's still unfinished when the learner jumps past
 * the recommended next phase. Keyed by the phase being skipped over.
 */
export const PHASE_SKIP_NUDGE: Record<PhaseId, string> = {
  consume: "You haven't read this yet — want to?",
  socratic: "You haven't reasoned this out yet — want to?",
  feynman: "You haven't taught this back yet — want to?",
  connect: "You haven't linked this into your map yet — want to?",
  crucible: "You haven't applied this in a novel context yet — want to?",
  retain: "This isn't in your review rotation yet — want to?",
};

const PHASE_SKIP_NUDGE_PT: Record<PhaseId, string> = {
  consume: "Você ainda não leu isso — quer ler?",
  socratic: "Você ainda não raciocinou sobre isso — quer tentar?",
  feynman: "Você ainda não ensinou isso de volta — quer tentar?",
  connect: "Você ainda não ligou isso ao seu mapa — quer tentar?",
  crucible: "Você ainda não aplicou isso em um contexto novo — quer tentar?",
  retain: "Isso ainda não está na sua rotação de revisão — quer adicionar?",
};

/** Language-aware phase-skip nudge. */
export function phaseSkipNudge(phase: PhaseId, lang: Language = "en"): string {
  return (lang === "pt-BR" ? PHASE_SKIP_NUDGE_PT : PHASE_SKIP_NUDGE)[phase];
}

/** A phase's product label — English in both languages, by design. */
export function phaseLabel(phase: PhaseId): string {
  return PHASE_DEFS[phase].label;
}
