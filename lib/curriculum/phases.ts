// The phase catalogue: what a phase is, which phases exist, and which of them
// a node actually runs.
//
// Phase used to be *derived from mastery state* — a fixed six-tuple indexed by
// `phaseIndex(state, reviewed)` — which is why every node on every map ran the
// same ladder whether it was a definition, a procedure or a causal chain. Now
// the node carries its own plan and state is derived from what the learner has
// finished (`stateFromPlan` in `calibration.ts`).

import { DOMAIN_PLAN, asDomain, type Domain } from "./domains";

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
 * This list holds only phases that are *built*, which is now all twelve of
 * them. Each was inserted here at its canonical position by the release that
 * implemented it, so `PHASE_PLAN` was never inconsistent with what existed and
 * the "every phase has a home" invariant stayed meaningful throughout. A
 * thirteenth would arrive the same way, and only if it extracts a signal none
 * of these twelve already does.
 */
export const PHASE_ORDER = [
  "consume",
  "discriminate",
  "provenance",
  "socratic",
  "steelman",
  "predict",
  "trace",
  "feynman",
  "perform",
  "drill",
  "produce",
  "connect",
  "crucible",
  "recall",
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
  discriminate: { label: "Discriminate", signal: "boundary" },
  provenance: { label: "Provenance", signal: "evidence quality" },
  socratic: { label: "Socratic", signal: "reasoning under questioning" },
  steelman: { label: "Steelman", signal: "holding a contested position" },
  predict: { label: "Predict", signal: "forecast before the answer" },
  trace: { label: "Trace", signal: "following a mechanism step by step" },
  feynman: { label: "Feynman", signal: "unaided production" },
  perform: { label: "Perform", signal: "execution under real conditions" },
  drill: { label: "Drill", signal: "speed and automaticity" },
  produce: { label: "Produce", signal: "real-time production" },
  connect: { label: "Connect", signal: "elaborative encoding" },
  crucible: { label: "Crucible", signal: "transfer" },
  recall: { label: "Recall", signal: "unaided retrieval" },
  retain: { label: "Retained", signal: "durability" },
};

/**
 * Which phases a node of each kind actually runs.
 *
 * Resolved once at map-build time and *stored* on the node (`nodes.phase_plan`),
 * never recomputed — editing this table ships a new ladder for maps built after
 * it, and cannot rewrite a run already in progress.
 *
 * These are the four target ladders, complete — every phase they name exists.
 *
 *   fact       consume · discriminate · drill · connect · recall · retain
 *   concept    consume · discriminate · socratic · feynman · connect ·
 *              crucible · recall · retain
 *   procedure  consume · trace · feynman · perform · drill · connect ·
 *              crucible · retain
 *   principle  consume · socratic · predict · trace · feynman · connect ·
 *              crucible · retain
 *
 * Why they differ: a fact has nothing to reason from — tell it from its
 * neighbours, drill it, wire it, retrieve it cold. A concept is a
 * classification, so discriminating instances is the whole job. A procedure is
 * executed — watch it run, run it, run it fast, choose it under pressure. A
 * principle is a mechanism — forecast it, walk its causal chain, explain it.
 *
 * Three invariants, each pinned by a test in `tests/curriculum.test.ts`:
 *   1. every plan is a subsequence of PHASE_ORDER
 *   2. `consume` and `retain` are in every plan (the warm chain needs a known
 *      first and last; the part-read case needs Consume at index 0)
 *   3. every phase has at least one home — one that doesn't is dead code
 */
export const PHASE_PLAN: Record<NodeKind, readonly PhaseId[]> = {
  // Nothing to reason from: tell it from its neighbours, wire it into the map,
  // retrieve it cold, keep it alive.
  fact: ["consume", "discriminate", "drill", "connect", "recall", "retain"],
  // A concept IS a classification, so telling instances from near-misses is
  // not a warm-up for the ladder — it is the thing being learned.
  concept: [
    "consume",
    "discriminate",
    "socratic",
    "feynman",
    "connect",
    "crucible",
    "recall",
    "retain",
  ],
  // A procedure is executed, not argued with — no Socratic pass, and no Recall
  // either: reciting its steps from memory is the rehearsal a procedure most
  // easily fakes. Watch it run, say what each step is for, run it yourself on
  // a real case, then run it fast.
  procedure: [
    "consume",
    "trace",
    "feynman",
    "perform",
    "drill",
    "connect",
    "crucible",
    "retain",
  ],
  // A principle is a mechanism, so the test is whether it FORECASTS: say what
  // happens before being shown, then explain why it had to.
  principle: [
    "consume",
    "socratic",
    "predict",
    "trace",
    "feynman",
    "connect",
    "crucible",
    "retain",
  ],
};

/** The phases of a plan that actually gate mastery — everything but Retain,
 *  which is closed by weeks of review history rather than by a session. */
export function planGates(plan: readonly PhaseId[]): readonly PhaseId[] {
  return plan.filter((p) => p !== "retain");
}

/** The gate that proves a concept cold: the Crucible (transfer into a framing
 *  never taught) wherever the plan has one, else the plan's last gate. What
 *  "I already know this" sends the learner to. */
export function proofGate(plan: readonly PhaseId[]): PhaseId {
  return plan.includes("crucible") ? "crucible" : (planGates(plan).at(-1) ?? "consume");
}

/** The pre-catalogue ladder, and the `phase_plan` every row built before it was
 *  defaulted to by the migration. Kept as its own name so the backfill check
 *  has something explicit to assert against — it is also, unchanged, what
 *  `concept` and `principle` still run. */
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
 * How much the learner's goal rests on a concept. `core` is a hub or a
 * capstone; `support` is needed to *use*, not to master. Decides how DEEP the
 * ladder goes. Missing reads as `core`, which is what every node was before.
 */
export type NodeImportance = "core" | "support";

/**
 * How hard a concept is for a newcomer who already holds its prerequisites.
 * Decides how much GUIDANCE the ladder gives, and how long it should take.
 * Missing reads as `medium`, which is what every node was before.
 */
export type NodeDifficulty = "easy" | "medium" | "hard";

export function asImportance(raw: unknown): NodeImportance {
  return raw === "support" ? "support" : "core";
}

export function asDifficulty(raw: unknown): NodeDifficulty {
  return raw === "easy" || raw === "hard" ? raw : "medium";
}

/**
 * Every axis the map generation tags a node with, read leniently.
 *
 * Defaulted, never failed: one bad discriminator must not cost a whole map.
 * Each default — `concept`, `general`, `core`, `medium` — is exactly how every
 * node behaved before that axis existed, so a bad pick degrades to the old
 * ladder rather than to nonsense.
 */
export function nodeAxes(raw: Record<string, unknown>) {
  return {
    kind: asNodeKind(raw.kind),
    domain: asDomain(raw.domain),
    importance: asImportance(raw.importance),
    difficulty: asDifficulty(raw.difficulty),
  };
}

/** Proof and transfer — the rungs that buy depth rather than working use.
 *  Only a concept the goal rests on pays for them. */
const DEPTH_PHASES: ReadonlySet<PhaseId> = new Set([
  "feynman",
  "connect",
  "crucible",
  "drill",
  "steelman",
]);

/**
 * The ladder a node runs, before anything is stored.
 *
 * The `(kind, domain)` merge is a *filter over `PHASE_ORDER`* rather than a
 * concatenation, which is what makes invariant 1 hold by construction: whatever
 * the two tables ask for, the result comes back in canonical order with no
 * duplicates, so it cannot stop being a subsequence. A `plan` rule bypasses the
 * kind entirely — see `DOMAIN_PLAN` for why that is a different thing from
 * adding rungs.
 *
 * Then the two cost axes only ever *remove* rungs, so every invariant survives
 * them: importance decides depth (a support concept drops `DEPTH_PHASES`),
 * difficulty decides guidance (Socratic questioning is dropped for an easy
 * concept, and for a support one unless it is hard). Neither can touch
 * Consume or Retain. Defaults reproduce the pre-axes ladder exactly.
 */
export function resolvePlan(
  kind: NodeKind,
  domain: Domain,
  importance: NodeImportance = "core",
  difficulty: NodeDifficulty = "medium",
): readonly PhaseId[] {
  const base = PHASE_PLAN[kind];
  const rule = DOMAIN_PLAN[domain];
  const want = new Set<PhaseId>(
    !rule ? base : "plan" in rule ? rule.plan : [...base, ...rule.add],
  );
  const support = importance === "support";
  if (support) for (const p of DEPTH_PHASES) want.delete(p);
  if (difficulty === "easy" || (support && difficulty !== "hard"))
    want.delete("socratic");
  return PHASE_ORDER.filter((p) => want.has(p));
}

/** The plan a node runs: its stored one, else the one its axes resolve to. A
 *  node with neither is one the client invented this tick (a spawned gap), and
 *  gap nodes render no spiral at all. */
export function phasePlan(node: {
  phasePlan?: readonly PhaseId[];
  kind?: NodeKind;
  domain?: Domain;
  importance?: NodeImportance;
  difficulty?: NodeDifficulty;
}): readonly PhaseId[] {
  return node.phasePlan?.length
    ? node.phasePlan
    : resolvePlan(
        node.kind ?? "concept",
        node.domain ?? "general",
        node.importance,
        node.difficulty,
      );
}

/**
 * The gentle skip flag: what's still unfinished when the learner jumps past
 * the recommended next phase. Keyed by the phase being skipped over.
 */
export const PHASE_SKIP_NUDGE: Record<PhaseId, string> = {
  consume: "You haven't read this yet — want to?",
  discriminate: "You haven't told this apart from its neighbours yet — want to?",
  provenance: "You haven't weighed the source on this yet — want to?",
  socratic: "You haven't reasoned this out yet — want to?",
  steelman: "You haven't argued both sides of this yet — want to?",
  predict: "You haven't forecast this yet — want to?",
  trace: "You haven't walked this through step by step yet — want to?",
  feynman: "You haven't taught this back yet — want to?",
  perform: "You haven't run this on a real case yet — want to?",
  drill: "You haven't made these calls at speed yet — want to?",
  produce: "You haven't said this out loud yet — want to?",
  connect: "You haven't linked this into your map yet — want to?",
  crucible: "You haven't applied this in a novel context yet — want to?",
  recall: "You haven't retrieved this cold yet — want to?",
  retain: "This isn't in your review rotation yet — want to?",
};

const PHASE_SKIP_NUDGE_PT: Record<PhaseId, string> = {
  consume: "Você ainda não leu isso — quer ler?",
  discriminate: "Você ainda não distinguiu isso dos vizinhos — quer tentar?",
  provenance: "Você ainda não pesou a fonte disso — quer tentar?",
  socratic: "Você ainda não raciocinou sobre isso — quer tentar?",
  steelman: "Você ainda não defendeu os dois lados disso — quer tentar?",
  predict: "Você ainda não previu isso — quer tentar?",
  trace: "Você ainda não percorreu isso passo a passo — quer tentar?",
  feynman: "Você ainda não ensinou isso de volta — quer tentar?",
  perform: "Você ainda não executou isso num caso real — quer tentar?",
  drill: "Você ainda não fez essas decisões no ritmo — quer tentar?",
  produce: "Você ainda não disse isso em voz alta — quer tentar?",
  connect: "Você ainda não ligou isso ao seu mapa — quer tentar?",
  crucible: "Você ainda não aplicou isso em um contexto novo — quer tentar?",
  recall: "Você ainda não recuperou isso de memória — quer tentar?",
  retain: "Isso ainda não está na sua rotação de revisão — quer adicionar?",
};

/** Language-aware phase-skip nudge. */
export function phaseSkipNudge(phase: PhaseId, lang: Language = "en"): string {
  return (lang === "pt-BR" ? PHASE_SKIP_NUDGE_PT : PHASE_SKIP_NUDGE)[phase];
}

/**
 * Does closing Crucible master this node, or does it still owe earlier gates?
 *
 * Crucible is the last gate in every plan but not the only one, and
 * `stateFromPlan` lifts a node only when all of them are done — so a learner
 * who jumped ahead passes the Crucible and stays Learning. The Crucible's
 * closing copy has to say which of the two happened. Retain is excluded for
 * the same reason `planGates` excludes it: review history closes it, not a
 * session.
 */
export function crucibleMasters(
  nodes: readonly {
    id: string;
    kind?: NodeKind;
    domain?: Domain;
    phasePlan?: readonly PhaseId[];
  }[],
  nodeId: string | undefined,
  phasesDone: PhasesDoneMap,
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return true;
  const done = phasesDone[node.id] ?? [];
  return phasePlan(node).every(
    (p) => p === "retain" || p === "crucible" || done.includes(p),
  );
}

/** A phase's product label — English in both languages, by design. */
export function phaseLabel(phase: PhaseId): string {
  return PHASE_DEFS[phase].label;
}
