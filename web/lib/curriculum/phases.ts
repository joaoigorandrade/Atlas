// The phase catalogue: what a phase is, which phases exist, and which of them
// a node actually runs.
//
// State is derived from what the learner has finished on the node's plan
// (`stateFromPlan` in `calibration.ts`), never stored as a literal.

import { asDifficulty, type NodeImportance } from "./cells";
import { asDomain } from "./domains";

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
 * The one ladder every node runs, in order (docs/PLAN-FLOW.md). There used to
 * be sixteen phases chosen per kind × domain × cell; the pivot to a single
 * flow kept these four and made each excellent instead.
 */
export const PHASE_ORDER = ["consume", "explain", "perform", "retain"] as const;

export type PhaseId = (typeof PHASE_ORDER)[number];

/** Every node's plan — stored on the node like any plan, so a future change
 *  to the ladder still cannot re-cut a run in progress. */
export const LADDER: readonly PhaseId[] = PHASE_ORDER;

/** Stamp the one ladder on a map's nodes at build, so it is frozen on the node
 *  like any stored plan (`nodes.phase_plan`). */
export function withLadder<T extends { phasePlan?: readonly PhaseId[] }>(
  nodes: T[],
): T[] {
  return nodes.map((n) => ({ ...n, phasePlan: LADDER }));
}

/**
 * A phase's identity. `label` is product vocabulary and stays English in both
 * languages (AGENTS.md §"Both languages, always"); everything a learner reads
 * *around* it is translated. A phase's `/api/generate` kind is its `PhaseId`.
 */
export const PHASE_DEFS: Record<PhaseId, { label: string; signal: string }> = {
  consume: { label: "Consume", signal: "exposure" },
  explain: { label: "Explain", signal: "explanation design" },
  perform: { label: "Perform", signal: "execution under real conditions" },
  retain: { label: "Retained", signal: "durability" },
};

/** The phases of a plan that actually gate a node — everything but Retain,
 *  which is closed by weeks of review history rather than by a session. */
export function planGates(plan: readonly PhaseId[]): readonly PhaseId[] {
  return plan.filter((p) => p !== "retain");
}

/** The gate that proves a concept cold — what "I already know this" opens. */
export function proofGate(plan: readonly PhaseId[]): PhaseId {
  return lastGate(plan) ?? "consume";
}

/** The gate that proves a node last. Never Explain: it models an explanation
 *  rather than proving anything. */
export function lastGate(plan: readonly PhaseId[]): PhaseId | undefined {
  return planGates(plan.filter((p) => p !== "explain")).at(-1);
}

/**
 * Which phases each node has finished, in completion order — the record that
 * mastery state is *derived* from (`stateFromPlan`). A parallel map rather than
 * a field on the node, so finishing a phase doesn't rewrite the graph, and for
 * the same reason `shakyReasons` and `reviewedNodes` are parallel maps.
 */
export type PhasesDoneMap = Record<string, readonly PhaseId[]>;

/**
 * A node's parked sessions for the phases built *after* the catalogue, keyed
 * by phase id (`nodes.phase_progress`). The four pre-catalogue phases keep
 * their own `*_progress` columns; everything new lands here, so a phase is a
 * key rather than an eight-file hand edit plus a migration.
 *
 * `unknown` because each phase's session shape is its own — the phase's
 * reducer is the only thing that knows how to read its slot back.
 */
export type PhaseProgress = Partial<Record<PhaseId, unknown>>;

/**
 * Every axis the map generation tags a node with, read leniently. Every node is
 * something to use (`working`); difficulty is the only cell axis left.
 *
 * Defaulted, never failed: one bad discriminator must not cost a whole map.
 */
export function nodeAxes(raw: Record<string, unknown>) {
  return {
    kind: asNodeKind(raw.kind),
    domain: asDomain(raw.domain),
    importance: "working" as NodeImportance,
    difficulty: asDifficulty(raw.difficulty),
  };
}

/** The plan a node runs. Every node runs the one ladder; the argument stays so
 *  callers keep reading "this node's plan" rather than a global. */
export function phasePlan(_node?: unknown): readonly PhaseId[] {
  return LADDER;
}

/**
 * The gentle skip flag: what's still unfinished when the learner jumps past
 * the recommended next phase. Keyed by the phase being skipped over.
 */
export const PHASE_SKIP_NUDGE: Record<PhaseId, string> = {
  consume: "You haven't read this yet — want to?",
  explain: "You haven't seen how to explain this yet — want to?",
  perform: "You haven't run this on a real case yet — want to?",
  retain: "This isn't in your review rotation yet — want to?",
};

const PHASE_SKIP_NUDGE_PT: Record<PhaseId, string> = {
  consume: "Você ainda não leu isso — quer ler?",
  explain: "Você ainda não viu como explicar isso — quer ver?",
  perform: "Você ainda não executou isso num caso real — quer tentar?",
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
