// The concept-map vocabulary, mastery-state machine, and the pure session
// engines (Socratic, Feynman, Connect, Crucible, Retain reducers).
// All *content* — the graph, the diagnostic, and every phase's material — is
// generated per topic by the AI through `/api/generate` (OpenRouter); this
// module holds only types, tokens, and logic. Nothing domain-specific lives
// here anymore.

import type { Language } from "@/lib/i18n";

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
    "You feel solid here, but your last application failed. That's fluency, not mastery — re-attempt the Crucible.",
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
    "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente o Crisol de novo.",
  unknown:
    "Bloqueado. Resolva os pré-requisitos abaixo e isso se acende na sua fronteira.",
  gap: "Originado de uma falha detectada. Uma passagem Socrática direcionada fecha só esse subponto.",
};

/** Language-aware state-confidence copy. */
export function stateConfidence(state: NodeState, lang: Language = "en"): string {
  return (lang === "pt-BR" ? STATE_CONFIDENCE_PT : STATE_CONFIDENCE)[state];
}

/** How a node became Shaky — selects an honest confidence line (#14). */
export type ShakyReason =
  "connect-complete" | "diagnostic-hesitation" | "crucible-fail" | "review-miss";

export const SHAKY_REASON_COPY: Record<ShakyReason, string> = {
  "connect-complete":
    "Understood and connected — now prove it transfers in the Crucible.",
  "diagnostic-hesitation":
    "You hesitated on this in the placement diagnostic — it's probably fragile. A Crucible attempt shows whether it holds.",
  "crucible-fail":
    "You feel solid here, but your last application failed. That's fluency, not mastery — re-attempt the Crucible.",
  "review-miss":
    "A review card on this slipped — retention is softening. Re-attempt the Crucible to firm it back up.",
};

const SHAKY_REASON_COPY_PT: Record<ShakyReason, string> = {
  "connect-complete":
    "Compreendido e conectado — agora prove que isso se transfere no Crisol.",
  "diagnostic-hesitation":
    "Você hesitou nisso no diagnóstico de posicionamento — provavelmente é frágil. Uma tentativa no Crisol mostra se resiste.",
  "crucible-fail":
    "Você se sente seguro aqui, mas sua última aplicação falhou. Isso é fluência, não domínio — tente o Crisol de novo.",
  "review-miss":
    "Um cartão de revisão disso escorregou — a retenção está amolecendo. Tente o Crisol de novo para firmar de novo.",
};

/** The Shaky confidence line, honest about how the node got there. */
export function shakyLine(
  reason: ShakyReason | undefined,
  lang: Language = "en",
): string {
  return (lang === "pt-BR" ? SHAKY_REASON_COPY_PT : SHAKY_REASON_COPY)[
    reason ?? "crucible-fail"
  ];
}

export const PHASES = [
  "Consume",
  "Socratic",
  "Feynman",
  "Connect",
  "Crucible",
  "Retained",
] as const;

export type Phase = (typeof PHASES)[number];

/**
 * The gentle skip flag: what's still unfinished when the learner jumps past
 * the recommended next phase. Keyed by the phase being skipped over.
 */
export const PHASE_SKIP_NUDGE: Record<Phase, string> = {
  Consume: "You haven't read this yet — want to?",
  Socratic: "You haven't reasoned this out yet — want to?",
  Feynman: "You haven't taught this back yet — want to?",
  Connect: "You haven't linked this into your map yet — want to?",
  Crucible: "You haven't applied this in a novel context yet — want to?",
  Retained: "This isn't in your review rotation yet — want to?",
};

const PHASE_SKIP_NUDGE_PT: Record<Phase, string> = {
  Consume: "Você ainda não leu isso — quer ler?",
  Socratic: "Você ainda não raciocinou sobre isso — quer tentar?",
  Feynman: "Você ainda não ensinou isso de volta — quer tentar?",
  Connect: "Você ainda não ligou isso ao seu mapa — quer tentar?",
  Crucible: "Você ainda não aplicou isso em um contexto novo — quer tentar?",
  Retained: "Isso ainda não está na sua rotação de revisão — quer adicionar?",
};

/** Language-aware phase-skip nudge. */
export function phaseSkipNudge(phase: Phase, lang: Language = "en"): string {
  return (lang === "pt-BR" ? PHASE_SKIP_NUDGE_PT : PHASE_SKIP_NUDGE)[phase];
}
