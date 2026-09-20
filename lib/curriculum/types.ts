// The concept-map vocabulary, mastery-state machine, and the pure session
// engines (Socratic, Feynman, Connect, Crucible, Retain reducers).
// All *content* — the graph, the diagnostic, and every phase's material — is
// generated per topic by the AI through `/api/generate` (OpenRouter); this
// module holds only types, tokens, and logic. Nothing domain-specific lives
// here anymore.

import type { Language } from "@/lib/i18n";
import type { Domain } from "./domains";
import { phaseLabel, planGates, type NodeKind, type PhaseId } from "./phases";

export type NodeState =
  "unknown" | "frontier" | "learning" | "shaky" | "mastered" | "gap";

/**
 * A node's stored progress. `frontier` is never stored — it is derived:
 * an `unknown` node whose prerequisites have all been learned displays as
 * frontier, otherwise it displays as locked-unknown.
 */
export type ProgressState = Exclude<NodeState, "frontier">;

export interface ConceptNode {
  id: string;
  label: string;
  /** One sentence on what this concept actually is — what the detail rail says
   *  about the topic itself, in place of copy about its mastery state. Written
   *  by the map generation; a gap node carries the reason it was split out.
   *  Optional: a run persisted before summaries existed has none, and the rail
   *  falls back to the state line. */
  summary?: string;
  /** Seed progress state (generated maps start everything `unknown`). */
  state: ProgressState;
  /** What kind of thing this concept is — which decides how it's practised.
   *  Written by the map generation; absent on a run built before kinds
   *  existed, and everything treats a missing kind as `concept`, which is
   *  exactly what every node was then. */
  kind?: NodeKind;
  /** What settles a claim about this concept — the second axis, orthogonal to
   *  `kind`. Written by the map generation; absent on a run built before
   *  domains existed, and everything treats a missing domain as `general`,
   *  which is exactly what every node behaved as then. */
  domain?: Domain;
  /** The phases this node runs, resolved from `kind` and `domain` at map-build
   *  time and
   *  frozen here. Stored rather than recomputed so shipping a new catalogue
   *  can't rewrite a run already in progress.
   *
   *  Which of them the learner has *finished* is not here: that's progress,
   *  and it lives in the parallel `PhasesDoneMap` beside `shakyReasons` and
   *  `reviewedNodes`, so completing a phase doesn't rewrite the graph. */
  phasePlan?: readonly PhaseId[];
  /** Generation (topological depth) — controls staged reveal during the diagnostic. */
  g: number;
  /** Week the node first lit up (0 = placement diagnostic) — drives the momentum replay. */
  week: number;
  x: number;
  y: number;
  gap?: boolean;
}

/** [from, to, dashed?] — direction is prerequisite → dependent. */
export type ConceptEdge = readonly [string, string, boolean?];

/**
 * The live graph. It arrives from the AI (`/api/generate`, kind "curriculum")
 * during onboarding, and re-planning (Phase 1) restructures it — spawning gap
 * sub-nodes from failures — so the app holds it as state.
 */
export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

/** The pre-generation placeholder the app boots with. */
export function emptyGraph(): ConceptGraph {
  return { nodes: [], edges: [] };
}

/**
 * How a generated map travels: a laid-out node that carries its own
 * prerequisites, rather than a graph with a separate edge list.
 *
 * The map streams one concept at a time (see `generateMapStream`), and
 * `framesToPayload` can only assemble *flat* payload parts — so the progressive
 * list can't live at `graph.nodes` and the edges can't be a second list that
 * only makes sense once both are complete. Hanging each node's prereqs off the
 * node itself makes every frame independently meaningful: the partial map on
 * screen after three concepts is a real graph, not three orphans.
 */
export interface MapNode extends ConceptNode {
  /** Ids of the concepts this one depends on. Always already-emitted nodes —
   *  the generator drops forward references, which is what makes a cycle
   *  structurally impossible. */
  prereqs: string[];
}

/**
 * Derive the graph a streamed (or cached) node list describes.
 *
 * `prereqs` is stripped on the way out: what lands in app state — and from
 * there in the persisted `RunSnapshot.graph` — stays a plain `ConceptNode`, so
 * the snapshot shape is unchanged. Prereqs pointing outside the list are
 * dropped, which is what lets this run over a *partial* list mid-stream.
 */
export function graphFromMapNodes(mapNodes: MapNode[]): ConceptGraph {
  const ids = new Set(mapNodes.map((n) => n.id));
  const nodes: ConceptNode[] = [];
  const edges: ConceptEdge[] = [];
  for (const { prereqs, ...node } of mapNodes) {
    nodes.push(node);
    for (const from of prereqs)
      if (ids.has(from) && from !== node.id) edges.push([from, node.id]);
  }
  return { nodes, edges };
}

export const STATE_COLOR: Record<NodeState, string> = {
  unknown: "#b3ada2",
  frontier: "#c99a2e",
  learning: "#5b7fbf",
  shaky: "#bd7038",
  mastered: "#4c8b63",
  gap: "#c1574a",
};

export const STATE_LABEL: Record<NodeState, string> = {
  unknown: "Unknown",
  frontier: "Frontier · ready",
  learning: "Learning",
  shaky: "Shaky",
  mastered: "Mastered",
  gap: "Gap",
};

/** The label names the *state*; the consequence of a locked node ("Bloqueado.
 *  Resolva os pré-requisitos…") belongs to STATE_CONFIDENCE_PT, and the iOS
 *  node drawer says it on the CTA. Both clients read these six words — a
 *  surface that wants different ones is drifting, not localising. */
const STATE_LABEL_PT: Record<NodeState, string> = {
  unknown: "Desconhecido",
  frontier: "Fronteira · pronto",
  learning: "Aprendendo",
  shaky: "Instável",
  mastered: "Dominado",
  gap: "Lacuna",
};

/** Language-aware state label. */
export function stateLabel(state: NodeState, lang: Language = "en"): string {
  return (lang === "pt-BR" ? STATE_LABEL_PT : STATE_LABEL)[state];
}

/** Calibration/metacognition copy shown in the node detail rail per state. */
export const STATE_CONFIDENCE: Record<NodeState, string> = {
  mastered:
    "Understood, retained, and applied in a novel context. This is real mastery — keep it alive in Review.",
  frontier:
    "Prerequisites met. This is your edge — the right place to start. Begin with a short Consume pass.",
  learning:
    "Understanding is forming. Teach it back next to surface the parts you're still hand-waving.",
  shaky:
    "You feel solid here, but your last application failed. That's fluency, not mastery — re-attempt {gate}.",
  unknown: "Locked. Clear the prerequisites below and this lights up on your frontier.",
  gap: "Spawned from a detected failure. A targeted Socratic pass closes just this sub-point.",
};

const STATE_CONFIDENCE_PT: Record<NodeState, string> = {
  mastered:
    "Compreendido, retido e aplicado em um contexto novo. Isso é domínio de verdade — mantenha-o vivo na Revisão.",
  frontier:
    "Pré-requisitos cumpridos. Esta é sua fronteira — o lugar certo para começar. Comece com uma leitura curta no Consumir.",
  learning:
    "A compreensão está se formando. Ensine de volta em seguida para revelar as partes que você ainda está enrolando.",
  shaky:
    "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente {gate} de novo.",
  unknown:
    "Bloqueado. Resolva os pré-requisitos abaixo e isso se acende na sua fronteira.",
  gap: "Originado de uma falha detectada. Uma passagem Socrática direcionada fecha só esse subponto.",
};

/**
 * The phase a "go prove it" line points at: the node's last gate. That is the
 * Crucible on every plan that has one, and Connect on a plan that stops there
 * — the copy used to name the Crucible unconditionally, which promised a
 * phase a `fact` never runs. `phaseLabel` is English in both languages by
 * design (AGENTS.md §"Both languages, always").
 */
function gate(plan?: readonly PhaseId[]): string {
  return phaseLabel(planGates(plan ?? []).at(-1) ?? "crucible");
}

/** Language-aware state-confidence copy. `plan` names the gate the Shaky line
 *  sends the learner back to; the state legend passes none and gets the
 *  default, since it is describing the state, not a node. */
export function stateConfidence(
  state: NodeState,
  lang: Language = "en",
  plan?: readonly PhaseId[],
): string {
  return (lang === "pt-BR" ? STATE_CONFIDENCE_PT : STATE_CONFIDENCE)[state].replaceAll(
    "{gate}",
    gate(plan),
  );
}

/** How a node became Shaky — selects an honest confidence line (#14). */
export type ShakyReason =
  | "connect-complete"
  | "diagnostic-hesitation"
  | "crucible-fail"
  | "review-miss"
  | "socratic-told";

export const SHAKY_REASON_COPY: Record<ShakyReason, string> = {
  "connect-complete": "Understood and connected — now prove it transfers in {gate}.",
  "diagnostic-hesitation":
    "You hesitated on this in the placement diagnostic — it's probably fragile. A {gate} attempt shows whether it holds.",
  "crucible-fail":
    "You feel solid here, but your last application failed. That's fluency, not mastery — re-attempt {gate}.",
  "review-miss":
    "A review card on this slipped — retention is softening. Re-attempt {gate} to firm it back up.",
  "socratic-told":
    "You got here, but the questioning had to hand you most of it. Worth another reading before {gate}.",
};

const SHAKY_REASON_COPY_PT: Record<ShakyReason, string> = {
  "connect-complete":
    "Compreendido e conectado — agora prove que isso se transfere em {gate}.",
  "diagnostic-hesitation":
    "Você hesitou nisso no diagnóstico de posicionamento — provavelmente é frágil. Uma tentativa em {gate} mostra se resiste.",
  "crucible-fail":
    "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente {gate} de novo.",
  "review-miss":
    "Um cartão de revisão disso escorregou — a retenção está amolecendo. Tente {gate} de novo para firmar de novo.",
  "socratic-told":
    "Você chegou lá, mas a sondagem teve que te entregar quase tudo. Vale uma releitura antes de {gate}.",
};

/** The Shaky confidence line, honest about how the node got there. */
export function shakyLine(
  reason: ShakyReason | undefined,
  lang: Language = "en",
  plan?: readonly PhaseId[],
): string {
  return (lang === "pt-BR" ? SHAKY_REASON_COPY_PT : SHAKY_REASON_COPY)[
    reason ?? "crucible-fail"
  ].replaceAll("{gate}", gate(plan));
}

// The phase catalogue — `PhaseId`, `PHASE_DEFS`, `PHASE_PLAN`, the skip nudge —
// lives in `./phases`, and the node's own plan is a field on `ConceptNode`
// below. It used to be a fixed six-tuple here, indexed by mastery state.
