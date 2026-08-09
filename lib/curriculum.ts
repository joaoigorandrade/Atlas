// The concept-map vocabulary, mastery-state machine, and the pure session
// engines (Socratic, Feynman, Connect, Crucible, Retain reducers).
// All *content* — the graph, the diagnostic, and every phase's material — is
// generated per topic by the AI through `/api/generate` (OpenRouter); this
// module holds only types, tokens, and logic. Nothing domain-specific lives
// here anymore.

import type { Language } from "@/lib/i18n";

export type NodeState =
  | "unknown"
  | "frontier"
  | "learning"
  | "shaky"
  | "mastered"
  | "gap";

/**
 * A node's stored progress. `frontier` is never stored — it is derived:
 * an `unknown` node whose prerequisites have all been learned displays as
 * frontier, otherwise it displays as locked-unknown.
 */
export type ProgressState = Exclude<NodeState, "frontier">;

export interface ConceptNode {
  id: string;
  label: string;
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
    for (const from of prereqs) if (ids.has(from) && from !== node.id) edges.push([from, node.id]);
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
  unknown:
    "Locked. Clear the prerequisites below and this lights up on your frontier.",
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
  | "connect-complete"
  | "diagnostic-hesitation"
  | "crucible-fail"
  | "review-miss";

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

// ---- Phase 2 · Consume (the Learn view) ------------------------------------
// The segmented, dual-coded reading content for a Consume session. Each
// node's sections are generated on entry (kind "consume").
//
// Consume is the *reading* phase: the material is the point. Sections carry
// several paragraphs of real explanation plus a worked example, all shown on
// arrival — nothing is held hostage behind a question. The only question in a
// section is the comprehension check that closes it; retrieval practice proper
// belongs to Socratic, Feynman and Crucible.

/** The four lenses offered under each revealed chunk. Tapping one opens a
 *  *model view* over the section — the same material walked through one beat
 *  at a time — rather than swapping the prose underneath the learner. */
export type AltKey = "simpler" | "example" | "analogy" | "deeper";

export const ALT_CONTROLS: ReadonlyArray<[AltKey, string]> = [
  ["simpler", "Simpler"],
  ["example", "Example"],
  ["analogy", "Analogy"],
  ["deeper", "Go deeper"],
];

/** The lens keys alone — the server validates a request's `lens` against this,
 *  so a fifth control added above is legal everywhere at once. */
export const ALT_KEYS: readonly AltKey[] = ALT_CONTROLS.map(([key]) => key);

const ALT_CONTROLS_PT: ReadonlyArray<[AltKey, string]> = [
  ["simpler", "Mais simples"],
  ["example", "Exemplo"],
  ["analogy", "Analogia"],
  ["deeper", "Aprofundar"],
];

/** Language-aware lens controls. */
export function altControls(lang: Language = "en"): ReadonlyArray<[AltKey, string]> {
  return lang === "pt-BR" ? ALT_CONTROLS_PT : ALT_CONTROLS;
}

/** A key term pre-taught before the paragraph that first uses it. */
export interface ConsumeTerm {
  /** The term itself — shown on the pill and used as its inline key. */
  t: string;
  /** Its pre-taught definition, revealed inline on tap. */
  d: string;
}

/** A multiple-choice question with verdict copy — the shape behind each
 *  section's closing comprehension check. */
export interface ConsumePrediction {
  q: string;
  opts: ReadonlyArray<{ label: string; correct: boolean }>;
  /** Verdict copy after a right / wrong answer. */
  right: string;
  wrong: string;
}

/** A worked example, rendered inline under the prose — part of the material,
 *  not an on-demand rewrite the learner has to go looking for. */
export interface ConsumeExample {
  /** What this example demonstrates. */
  title: string;
  /** The worked steps, in order. */
  steps: string[];
}

/** A schematic figure: labeled boxes wired by directed arrows. */
export interface ConsumeFigure {
  nodes: ReadonlyArray<{ id: string; label: string }>;
  edges: ReadonlyArray<{ from: string; to: string; label?: string }>;
}

/** Longest-path layer per figure node; cycle-safe (relaxation capped at node
 *  count) so a model-authored loop can't hang the renderer. */
export function figureLayers(fig: ConsumeFigure): Map<string, number> {
  const layer = new Map(fig.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < fig.nodes.length; pass++) {
    let moved = false;
    for (const e of fig.edges) {
      const want = (layer.get(e.from) ?? 0) + 1;
      if (want > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, want);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return layer;
}

export interface ConsumeChunk {
  id: string;
  /** Segment label, e.g. "1 · What it is". */
  kicker: string;
  terms: ConsumeTerm[];
  /** The explanation itself — several paragraphs of real material, on screen
   *  the moment the section is. */
  body: string[];
  /** The worked example that follows the prose. */
  example: ConsumeExample;
  /** The one line to carry out of this section. */
  takeaway: string;
  /**
   * One real work to go read next on this section's material.
   *
   * Deliberately *not* framed as a citation of the prose above, and rendered
   * as "further reading". A model-authored source string under a claim reads
   * as verification the app cannot perform — an invented chapter number looks
   * more authoritative than no reference at all, which is the opposite of the
   * trust it was meant to buy. A pointer to a canonical work is honest, useful,
   * and doesn't imply the sentence above was checked against it.
   */
  cite: string;
  /** Caption for the diagram beside the prose. Absent when the section isn't
   *  structural enough to earn one — a definition or comparison doesn't need
   *  an invented box-and-arrow graph. */
  diagram?: string;
  /** The diagram itself — a small box-and-arrow graph. Absent on chunks
   *  generated before figures existed, or when the content wasn't diagram-
   *  shaped; the prose gets the full column back either way. */
  figure?: ConsumeFigure;
  /** The mini-Socratic aside opened from "ask about this passage". */
  ask: string;
  /** Adaptive-modality rewrites of this chunk, keyed by control — the model
   *  view's predecessor, which swapped the prose in place. Nothing renders it
   *  any more; the field survives because rows cached before the model view
   *  still carry it, and `migrateConsume` mines it for a takeaway. */
  alt?: Record<AltKey, string>;
  /** The comprehension check that closes this section: it appears once the
   *  learner reaches the end of the reading, and the section's Continue is
   *  gated on getting it right. Absent on chunks cached before checks
   *  existed — those sections stay ungated. */
  check?: ConsumePrediction;
}

/**
 * What survives a Consume session.
 *
 * The reading pass is the longest surface in Atlas — eight to fifteen minutes
 * — so where the learner got to has to outlive the screen. This is the half
 * that persists (one record per node, in the run snapshot); the live
 * `ConsumeSession` is this plus the transient UI bits (which term pill is
 * open, which passage panel is up) that nobody needs restored.
 *
 * It is also the evidence later surfaces read: the map's "3 of 5 read", the
 * phase spiral's refusal to tick Consume off on a partial pass, and the
 * closing recap all derive from these fields rather than re-deriving progress
 * from the cached chunks.
 */
export interface ConsumeProgress {
  /** Deepest section revealed so far. */
  idx: number;
  /** The lens last opened over each chunk — a record of what this learner
   *  reached for, not a rendering instruction. `null` is still in the type
   *  because rows persisted before lenses opened a model view stored one to
   *  mean "reverted to the original prose"; nothing writes it any more. */
  variant: Record<string, AltKey | null>;
  /** Sections collapsed to their takeaway alone. */
  collapsed: Record<string, boolean>;
  /** The end-of-section comprehension checks, keyed by chunk id. Persisted
   *  with the rest of the progress rather than held for the session: a check
   *  already passed has to stay passed when the learner comes back, or
   *  resuming would re-gate sections they demonstrably read. A wrong pick is
   *  kept too, so the miss can still be named. */
  checks: Record<string, { oi: number; correct: boolean }>;
  /** `chunkId:term` keys the learner expanded — the recap lists them back. */
  termsSeen: string[];
  /** Sections in the pass as last seen. With `idx`, the honest "3 of 5" — a
   *  pass still streaming when the learner left has a smaller total than the
   *  finished one, so this is stored rather than assumed. */
  total: number;
  /** The last section was reached at least once. */
  finished: boolean;
  /** Socratic was actually opened on this node. A finished reading that the
   *  learner walked away from is still only a finished *reading* — see
   *  `readingPhaseIndex`. */
  handedOff: boolean;
}

export const emptyConsumeProgress = (): ConsumeProgress => ({
  idx: 0,
  variant: {},
  collapsed: {},
  checks: {},
  termsSeen: [],
  total: 0,
  finished: false,
  handedOff: false,
});

/** Sections read out of sections there are — never claiming past what exists,
 *  and never short-changing a finished pass whose `total` arrived late. */
export function readingProgress(p: ConsumeProgress): { read: number; total: number } {
  const total = Math.max(p.total, p.idx + 1);
  return { read: p.finished ? total : Math.min(p.idx + 1, total), total };
}

/**
 * How often the learner has opened each lens (§6: "the app
 * learns which representation lands for this learner and leads with it next
 * time"). Run-wide, not per node — the point is a preference that carries.
 */
export type ModalityTally = Partial<Record<AltKey, number>>;

/** Picks before a tally counts as a preference. One curious tap on "Analogy"
 *  must not rewrite every section the learner opens after it. */
export const MODALITY_PREFERENCE_MIN = 3;

/** The modality this learner keeps choosing, or null while it's still a habit
 *  rather than a preference. Ties resolve to the first in `ALT_CONTROLS`
 *  order, so the answer is stable rather than dependent on object key order. */
export function preferredModality(tally: ModalityTally): AltKey | null {
  let best: AltKey | null = null;
  let bestCount = MODALITY_PREFERENCE_MIN - 1;
  for (const [key] of ALT_CONTROLS) {
    const count = tally[key] ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

// ---- the model view (kind: "model") ----------------------------------------
// What a lens control opens *over* a section. The four controls used to
// rewrite the prose in place, which cost the learner the passage they were
// reading; a model view leaves the section where it is and walks the same
// material through, one beat at a time.
//
// Generated per (section, lens) on demand rather than four-per-section up
// front: a learner opens one lens on the section that didn't land, not twenty
// across the pass.

/** How many beats one model view walks through. Mirrors the validator's bound
 *  (not the number the prompt asks for), since `Job.shape` uses it to decide
 *  whether a streamed set is complete enough to cache. */
export const MODEL_BEAT_BOUNDS = { min: 3, max: 5 } as const;

/** One beat of a model view — revealed in turn, never all at once. */
export interface ConsumeModelBeat {
  /** 2-4 words naming this beat; the marker on the view's rail. */
  label: string;
  /** The beat itself: 1-3 sentences of this lens's walk through the section. */
  text: string;
}

/** What each lens promises the learner, shown under the model view's title. */
const LENS_NOTE: Record<AltKey, string> = {
  simpler: "The same idea, stripped to its plainest form.",
  example: "A second worked case, one move at a time.",
  analogy: "Something you already understand, mapped onto this.",
  deeper: "The rigorous layer under the reading.",
};

const LENS_NOTE_PT: Record<AltKey, string> = {
  simpler: "A mesma ideia, reduzida à forma mais simples.",
  example: "Um segundo caso resolvido, um passo por vez.",
  analogy: "Algo que você já entende, mapeado sobre isto.",
  deeper: "A camada rigorosa por baixo da leitura.",
};

/** Language-aware lens note. */
export function lensNote(key: AltKey, lang: Language = "en"): string {
  return (lang === "pt-BR" ? LENS_NOTE_PT : LENS_NOTE)[key];
}

// ---- Phase 3a · Socratic (during learning) --------------------------------
// The learner *constructs* the idea through guided questioning. The AI is
// contingent (hint when near, teach when lost), and — the single most
// important behavior — anti-sycophantic: it catches wrong reasoning and
// surfaces it gently, never smoothing it over. Scaffolding fades as the
// learner answers unaided. Content ships the Linear Transformations pass so
// the probe → reply → catch → advance mechanic is real.

/** The scaffolding dial, least help → most. Falls toward Silent with mastery. */
export const HELP_LABELS = ["Silent", "Hint", "Guide", "Show me"] as const;
export type HelpLevel = 0 | 1 | 2 | 3;

const HELP_LABELS_PT = ["Silencioso", "Dica", "Guiar", "Mostre-me"] as const;

/** Language-aware scaffolding-dial labels. */
export function helpLabels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? HELP_LABELS_PT : HELP_LABELS;
}

/** Warmer = more help. The dial and its active cell read this. */
export const HELP_COLOR: Record<HelpLevel, string> = {
  0: STATE_COLOR.mastered, // Silent — the learner is carrying it
  1: STATE_COLOR.learning, // Hint
  2: STATE_COLOR.frontier, // Guide
  3: STATE_COLOR.shaky, // Show me — dropped to direct instruction
};

/** The classic Socratic moves, tagged on each probe so the intent is legible. */
export type SocraticMove =
  | "Clarify"
  | "Challenge the assumption"
  | "Probe the reasoning"
  | "Probe the implications";

/**
 * How true a reply is. `correct` advances; `near` earns a hint and another
 * try; `wrong` gets caught (anti-sycophancy); `lost` drops the act and teaches.
 */
export type ReplyQuality = "correct" | "near" | "wrong" | "lost";

export interface SocraticReply {
  label: string;
  quality: ReplyQuality;
  /** The AI's honest, contingent response to this reply. */
  response: string;
}

export interface SocraticStep {
  id: string;
  move: SocraticMove;
  /** The probing question the AI opens the step with. */
  prompt: string;
  replies: SocraticReply[];
  /** Raised-help scaffold ("I'm stuck") — a nudge that doesn't give it away. */
  hint: string;
  /** Direct instruction for "Just tell me" — drops the Socratic act entirely. */
  tell: string;
  /** A held-back probe. The pass plans its core steps (`socraticPlan`) and only
   *  reaches for these when weak understanding buys one — so the length of a
   *  pass follows the learner, not a constant. */
  spare?: boolean;
}

/** One line of the Socratic transcript. */
export interface SocraticTurn {
  role: "ai" | "learner";
  text: string;
  /** Present on AI probes: the Socratic move being made. */
  move?: SocraticMove;
  /** Colors the AI bubble: a caught error, an affirmation, or direct teaching. */
  tone?: "neutral" | "catch" | "affirm" | "teach";
  /** The verdict landed but its wording is still being written (the judge
   *  streams the two separately). The view shows the bubble as still-writing;
   *  `stream` fills it in. At most one turn is pending at a time. */
  pending?: boolean;
}

/** How a finished step was resolved — earns the ending differently. */
export type StepResolution = "unaided" | "hint" | "told";

/** The live state of one Socratic session — held by AtlasApp, read by the view. */
export interface SocraticSession {
  nodeId: string;
  step: number;
  help: HelpLevel;
  log: SocraticTurn[];
  /** Reply labels already ruled out on this step (caught wrong / spent hints). */
  ruledOut: string[];
  /** "Just tell me" uses — repeated use flags a prerequisite gap. */
  tells: number;
  /** How every *finished* step resolved, oldest first — the record `socraticOutcome`
   *  reads to decide whether the pass earned an unqualified "understood". */
  resolutions: StepResolution[];
  /** Any scaffolding spent on the step in progress (stuck, a caught near/wrong) —
   *  turns an eventual correct into "hint" instead of "unaided". Resets per step. */
  stepAssisted: boolean;
  /**
   * How many steps this session will run. Held explicitly rather than read off
   * `steps.length`, because the steps stream in one at a time: deriving the
   * last step from the array would end the session as soon as the learner
   * answered step 1, while steps 2-4 were still being written.
   */
  total: number;
  /** True when the next step exists in the plan but hasn't been written yet.
   *  The view shows that it's coming; `hydrate` clears it when it lands. */
  awaitingNext: boolean;
  done: boolean;
}

/** Clamp a help level into the dial's range. */
function clampHelp(n: number): HelpLevel {
  return Math.max(0, Math.min(3, n)) as HelpLevel;
}

/** Push a step's opening probe onto the log and reset the per-step gates.
 *  A step that hasn't streamed in yet parks the session instead of throwing. */
function openStep(
  session: SocraticSession,
  step: number,
  steps: SocraticStep[],
): SocraticSession {
  const s = steps[step];
  if (!s)
    return { ...session, step, ruledOut: [], stepAssisted: false, awaitingNext: true };
  return {
    ...session,
    step,
    ruledOut: [],
    stepAssisted: false,
    awaitingNext: false,
    log: [...session.log, { role: "ai", text: s.prompt, move: s.move }],
  };
}

/** A fresh session, opened on its first probe. Starts mid-dial, at Hint.
 *  `total` is the number of steps the pass *plans* to run: more than has
 *  arrived when it opens on a stream, and fewer than are written when the pass
 *  came with spares (`socraticPlan`) for a struggling learner to buy. */
export function socraticStart(
  nodeId: string,
  steps: SocraticStep[],
  total = steps.length,
): SocraticSession {
  const first = steps[0];
  return {
    nodeId,
    step: 0,
    help: 1,
    ruledOut: [],
    tells: 0,
    resolutions: [],
    stepAssisted: false,
    total: Math.max(1, total),
    awaitingNext: !first,
    done: false,
    log: first ? [{ role: "ai", text: first.prompt, move: first.move }] : [],
  };
}

const STUCK_TEXT: Record<Language, string> = {
  en: "I'm stuck — more help.",
  "pt-BR": "Estou travado — mais ajuda.",
};
const TELL_TEXT: Record<Language, string> = {
  en: "Just tell me.",
  "pt-BR": "Só me conte.",
};

const REPLY_TONE: Record<ReplyQuality, SocraticTurn["tone"]> = {
  correct: "affirm",
  near: "neutral",
  wrong: "catch",
  lost: "teach",
};

export type SocraticAction =
  | { type: "reply"; index: number }
  | { type: "stuck" }
  | { type: "tell" }
  /** The scaffolding dial, set by hand rather than only fading with mastery (#B). */
  | { type: "setHelp"; level: HelpLevel }
  /** The learner just sent their answer — it joins the transcript at once and
   *  the tutor's bubble opens still-writing beside it, ahead of the verdict. */
  | { type: "answer"; text: string }
  /** A free-text answer, already judged server-side (#25). `response` may be
   *  empty when only the verdict has streamed in — mark it `pending` and send
   *  `stream` with the wording when it lands. */
  | {
      type: "judged";
      answer: string;
      quality: ReplyQuality;
      response: string;
      pending?: boolean;
    }
  /** The judge's wording for the turn currently marked pending. `pending` stays
   *  true for the token-by-token drafts, so every later draft still finds the
   *  turn it is filling; the final one clears it. */
  | { type: "stream"; text: string; pending?: boolean }
  /** More steps have streamed in — open the one the session is parked on.
   *  `total` re-caps the pass when a stream ended short of the plan. */
  | { type: "hydrate"; total?: number };

/**
 * The contingent tutor, as a pure transition. Correct answers advance and let
 * scaffolding fade; near answers earn a hint and another try; wrong answers get
 * caught and raise help; "lost"/"just tell me" drop the act and teach. This is
 * where the anti-sycophancy lives — a wrong reply is surfaced, never advanced.
 */
export function socraticReducer(
  session: SocraticSession,
  action: SocraticAction,
  steps: SocraticStep[],
  lang: Language = "en",
): SocraticSession {
  // Before the `done` guard on purpose: the verdict that finished the session
  // is exactly the one whose wording is still arriving.
  if (action.type === "stream") {
    if (!session.log.some((t) => t.pending)) return session;
    return {
      ...session,
      log: session.log.map((t) =>
        t.pending
          ? { ...t, text: action.text, pending: action.pending ? true : undefined }
          : t,
      ),
    };
  }
  // The dial is a control, not a verdict — it works even on a finished pass.
  if (action.type === "setHelp") {
    return { ...session, help: clampHelp(action.level) };
  }
  if (session.done) return session;

  // More steps arrived. Re-cap the pass if the stream ended short of the plan,
  // then open the step the session is parked on — or finish, if that step was
  // the one that never came.
  if (action.type === "hydrate") {
    // With no steps in hand yet (a resumed session reopening on an empty
    // stream) there is no real evidence the plan came up short — trust the
    // requested/saved total instead of clamping it down to `step + 1`.
    // `action.total` is a cap, not a set: it closes a pass whose stream came up
    // short, but never overrides probes the session bought on the way — the
    // written spares run past the plan on purpose.
    const planned = Math.min(session.total, action.total ?? Infinity);
    const total = steps.length
      ? Math.max(1, Math.min(planned, Math.max(steps.length, session.step + 1)))
      : Math.max(1, planned);
    const capped = { ...session, total };
    if (!capped.awaitingNext) return capped;
    if (capped.step >= total) return { ...capped, awaitingNext: false, done: true };
    return openStep(capped, capped.step, steps);
  }

  const step = steps[session.step];
  // Nothing to act on until the parked step lands.
  if (!step) return session;

  // Advancing earns the ending: three unaided answers running end the pass
  // early (#D); two straight assisted ones buy another probe out of the spares
  // — again and again, while spares last — otherwise it runs to `total`.
  const advance = (base: SocraticSession, resolution: StepResolution): SocraticSession => {
    const resolutions = [...base.resolutions, resolution];
    let total = base.total;
    if (
      resolutions.length >= 3 &&
      total > resolutions.length &&
      resolutions.slice(-3).every((r) => r === "unaided")
    ) {
      total = resolutions.length;
    }
    // Weak understanding buys probes — one per two assisted steps running, for
    // as long as the plan wrote spares to spend. Not the single spare slot
    // `steps.length` used to allow: a learner still working at it keeps
    // earning questions.
    //
    // Two told-outright steps running buy nothing. That learner isn't
    // reasoning their way anywhere and more probes would only be more to click
    // through; `socraticOutcome` flags them back to the reading instead.
    const recent = resolutions.slice(-2);
    if (
      resolutions.length >= 2 &&
      total < steps.length &&
      recent.every((r) => r !== "unaided") &&
      recent.some((r) => r === "hint")
    ) {
      total += 1;
    }
    const finished = session.step >= total - 1;
    const next = { ...base, resolutions, total };
    return finished ? { ...next, done: true } : openStep(next, session.step + 1, steps);
  };

  switch (action.type) {
    case "stuck": {
      return {
        ...session,
        help: clampHelp(session.help + 1),
        stepAssisted: true,
        ruledOut: [...session.ruledOut],
        log: [
          ...session.log,
          { role: "learner", text: STUCK_TEXT[lang] },
          { role: "ai", text: step.hint, tone: "teach" },
        ],
      };
    }
    case "tell": {
      const base: SocraticSession = {
        ...session,
        help: 3,
        tells: session.tells + 1,
        log: [
          ...session.log,
          { role: "learner", text: TELL_TEXT[lang] },
          { role: "ai", text: step.tell, tone: "teach" },
        ],
      };
      return advance(base, "told");
    }
    case "reply": {
      const reply = step.replies[action.index];
      if (!reply || session.ruledOut.includes(reply.label)) return session;
      const logged: SocraticSession = {
        ...session,
        log: [
          ...session.log,
          { role: "learner", text: reply.label },
          { role: "ai", text: reply.response, tone: REPLY_TONE[reply.quality] },
        ],
      };
      if (reply.quality === "correct" || reply.quality === "lost") {
        // Correct fades the scaffolding; a "lost" reply was just taught, so
        // help ticks up before we move on.
        const help =
          reply.quality === "correct"
            ? clampHelp(session.help - 1)
            : clampHelp(session.help + 1);
        const resolution: StepResolution =
          reply.quality === "correct" ? (session.stepAssisted ? "hint" : "unaided") : "told";
        return advance({ ...logged, help }, resolution);
      }
      // near → hint and let them try again; wrong → caught, help rises. Both
      // rule the reply out so the learner converges instead of re-picking it.
      return {
        ...logged,
        help:
          reply.quality === "wrong"
            ? clampHelp(session.help + 1)
            : session.help,
        stepAssisted: true,
        ruledOut: [...session.ruledOut, reply.label],
      };
    }
    case "answer": {
      if (session.log.some((t) => t.pending)) return session;
      return {
        ...session,
        log: [
          ...session.log,
          { role: "learner", text: action.text },
          { role: "ai", text: "", pending: true },
        ],
      };
    }
    case "judged": {
      // The contingent tutor on the learner's own words: the server judge
      // classified the free-text answer; the same advance/help rules apply.
      const bubble: SocraticTurn = {
        role: "ai",
        text: action.response,
        tone: REPLY_TONE[action.quality],
        ...(action.pending ? { pending: true } : null),
      };
      // `answer` already opened the pair — the verdict fills that bubble
      // rather than logging the answer a second time.
      const open = session.log.findIndex((t) => t.pending);
      const logged: SocraticSession = {
        ...session,
        log:
          open >= 0
            ? session.log.map((t, i) => (i === open ? bubble : t))
            : [...session.log, { role: "learner", text: action.answer }, bubble],
      };
      if (action.quality === "correct" || action.quality === "lost") {
        const help =
          action.quality === "correct"
            ? clampHelp(session.help - 1)
            : clampHelp(session.help + 1);
        const resolution: StepResolution =
          action.quality === "correct" ? (session.stepAssisted ? "hint" : "unaided") : "told";
        return advance({ ...logged, help }, resolution);
      }
      return {
        ...logged,
        help:
          action.quality === "wrong"
            ? clampHelp(session.help + 1)
            : session.help,
        stepAssisted: true,
      };
    }
    default:
      return session;
  }
}

/** Overall verdict for a finished pass — earns the "understood" hand-off,
 *  a softer "assisted" one, or flags that it wasn't earned at all (#C).
 *  A gap pass closes only on a clean `told === 0` — hint-assisted still
 *  counts as reconstructed, told outright does not. */
export type SocraticOutcome = "unaided" | "assisted" | "flagged";

export function socraticOutcome(session: SocraticSession, gap: boolean): SocraticOutcome {
  const told = session.resolutions.filter((r) => r === "told").length;
  if (gap) return told === 0 ? "unaided" : "flagged";
  if (told >= 2) return "flagged";
  return session.resolutions.every((r) => r === "unaided") ? "unaided" : "assisted";
}

// ---- Phase 3b · Feynman (teach it back) -----------------------------------
// Gap detection through self-explanation. The learner gets a blank page and
// teaches the whole concept to a naive student in their own words — nothing
// prompts them, because what they never think to mention is the finding. The
// judge then diffs that explanation against a rubric they never saw: every
// sub-point green/grey/red, the jargon they leaned on without unpacking, and
// the words that earned each gap. Unresolved gaps write back to the map as red
// Gap sub-nodes quoting the learner, so the phase is the loop's connective
// tissue, not a checklist.

/** A beat's verdict in the Gap Report: explained, skipped/hand-waved, or wrong. */
export type TeachVerdict = "good" | "skipped" | "confused";

/** The visual-diff colors — green = explained well, grey = skipped, red = wrong. */
export const VERDICT_COLOR: Record<TeachVerdict, string> = {
  good: STATE_COLOR.mastered,
  skipped: STATE_COLOR.unknown,
  confused: STATE_COLOR.gap,
};

export const VERDICT_LABEL: Record<TeachVerdict, string> = {
  good: "Explained well",
  skipped: "Skipped · hand-waved",
  confused: "Wrong · confused",
};

const VERDICT_LABEL_PT: Record<TeachVerdict, string> = {
  good: "Bem explicado",
  skipped: "Pulado · enrolado",
  confused: "Errado · confuso",
};

/** Language-aware Gap Report verdict label. */
export function verdictLabel(verdict: TeachVerdict, lang: Language = "en"): string {
  return (lang === "pt-BR" ? VERDICT_LABEL_PT : VERDICT_LABEL)[verdict];
}

/** A single-probe corrective for a gap — the targeted Socratic micro-pass. */
export interface TeachFixReply {
  label: string;
  correct: boolean;
  response: string;
}

/**
 * One sub-point of the concept — a *rubric* row, not a script.
 *
 * The learner is never shown these before they teach: the whole diagnostic
 * value of a teach-back is what they never think to mention, and a sub-point
 * printed above the input is the outline of the answer handed over before the
 * test. They teach the concept end to end in their own words; the judge diffs
 * that monologue against these rows.
 */
export interface FeynmanBeat {
  id: string;
  /** The sub-point being tested — the Gap Report row label. */
  subPoint: string;
  /** What a solid explanation has to convey for this row to count as taught.
   *  The judge's rubric — never a model monologue to grade similarity against. */
  mustConvey: string[];
  /** The targeted Socratic micro-pass "Fix this" opens on just this sub-point. */
  fix: { probe: string; replies: TeachFixReply[] };
  /** The red Gap sub-node this beat writes back to the map when left unresolved. */
  gap: GapSpec;
}

/** The scaffold offered when the learner freezes — never a blank wall. */
export const FEYNMAN_SCAFFOLD =
  "No blank-wall panic. Start with the simplest thing: what problem does this concept actually solve? Teach me that first — the rest pulls itself out.";

const FEYNMAN_SCAFFOLD_PT =
  "Sem pânico de tela em branco. Comece pelo mais simples: que problema esse conceito realmente resolve? Ensine-me isso primeiro — o resto sai sozinho.";

/** Language-aware freeze scaffold. */
export function feynmanScaffold(lang: Language = "en"): string {
  return lang === "pt-BR" ? FEYNMAN_SCAFFOLD_PT : FEYNMAN_SCAFFOLD;
}

/** The live state of one Feynman session — held by AtlasApp, read by the view. */
export interface FeynmanSession {
  nodeId: string;
  /** True once teaching has begun (past the opening prompt). */
  started: boolean;
  /** Whether the stuck-scaffold has been offered. */
  scaffolded: boolean;
  /** The learner's own explanation, as they taught it. */
  explanation: string;
  /** The naive student's reaction to the whole teach-back. */
  response: string;
  /** The reaction is still being written — see `SocraticTurn.pending`. */
  pending: boolean;
  /** Verdict per beat id, diffed out of the explanation (or closed by a fix). */
  verdicts: Record<string, TeachVerdict>;
  /** The learner's own words that earned a gap, per beat id — what the gap
   *  sub-node and the misconception roll-up quote back at them. */
  quotes: Record<string, string>;
  /** Terms they leaned on without ever unpacking — the Feynman rule, checked. */
  jargon: string[];
  /** The previous pass's verdicts, kept across "teach it again" so the second
   *  pass can show the delta — the one place the loop is visible working. */
  previous: Record<string, TeachVerdict> | null;
  /** True once the explanation has been judged — the Gap Report shows. */
  reported: boolean;
  /** A Fix-this micro-pass open on this beat id, or null. */
  fixing: string | null;
  /** Fix replies already caught in the open micro-pass. */
  fixRuledOut: string[];
  /** The naive student's latest reaction inside an open fix, or null. */
  fixReaction: string | null;
}

/** The most core probes a Socratic pass plans — one per move, and the estimate
 *  a streaming pass opens on before its own plan has arrived. A session needs a
 *  length before its last step lands, which is the only reason this is a
 *  constant at all; `socraticPlan` is the real, per-concept count. */
export const SOCRATIC_STEPS = 4;

/** The fewest core probes a concept can be worth — a simple one gets three. */
export const SOCRATIC_MIN_STEPS = 3;

/** Probes written past the core, spent one at a time by a learner who keeps
 *  needing help. Unspent, they cost nothing but the tokens that wrote them. */
export const SOCRATIC_SPARES = 2;

/** The longest a written pass can be — core plus spares. The validator's bound,
 *  and the ceiling a struggling learner can buy up to. */
export const SOCRATIC_MAX_STEPS = SOCRATIC_STEPS + SOCRATIC_SPARES;

/** How many probes a written pass *plans* to run: its core steps, with the
 *  spares held back. The count is the model's call — as many as the concept
 *  needs — so this reads it off the material instead of assuming four. */
export function socraticPlan(steps: SocraticStep[]): number {
  const core = steps.filter((s) => !s.spare).length;
  return core || steps.length || SOCRATIC_STEPS;
}

// ---- misconception memory (across nodes, across sessions) -----------------
// A `SocraticSession` is thrown away when its pass ends, and `socraticProgress`
// deliberately drops finished ones — so every wrong turn the tutor caught used
// to die with the session that caught it. This is the part worth keeping: what
// this learner gets wrong *everywhere*, so the tutor can name the pattern
// instead of meeting the same confusion cold every time.

/** One wrong idea this learner has hit, rolled up run-wide. */
export interface MisconceptionRecord {
  /** The wrong idea itself, short enough to say back to them. */
  label: string;
  /** The concept it was last caught under. */
  node: string;
  count: number;
}

/** The roll-up stays bounded — the tutor only ever reads the top few. */
const MISCONCEPTION_CAP = 24;

/** File a caught misconception, merging it into one this learner has hit before
 *  (case-insensitively) so a repeat becomes a count, not a second entry. */
export function recordMisconception(
  list: MisconceptionRecord[],
  label: string,
  node: string,
): MisconceptionRecord[] {
  const text = label.trim().slice(0, 120);
  if (!text) return list;
  const key = text.toLowerCase();
  const at = list.findIndex((m) => m.label.toLowerCase() === key);
  const next =
    at >= 0
      ? list.map((m, i) => (i === at ? { ...m, node, count: m.count + 1 } : m))
      : [...list, { label: text, node, count: 1 }];
  return next.length > MISCONCEPTION_CAP ? next.slice(-MISCONCEPTION_CAP) : next;
}

/** What the judge is told about this learner: the confusions they keep coming
 *  back to, worst first. Seen once is noise — it earns its name on the repeat,
 *  which is exactly when "you keep confusing X and Y" is a true thing to say. */
export function recurringMisconceptions(
  list: MisconceptionRecord[],
  limit = 3,
): string[] {
  return list
    .filter((m) => m.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((m) => `"${m.label}" — hit ${m.count}× (last under ${m.node})`);
}

/** How many sub-points a teach-back rubric aims for. The beats stream in one
 *  at a time and the judge diffs against whatever arrived, so this is the
 *  prompt's target, not a bound the session depends on. */
export const FEYNMAN_BEATS = 4;

/** A fresh teach-back. `previous` carries a prior pass's verdicts when the
 *  learner is teaching it again, and is null on a first attempt. */
export function feynmanStart(
  nodeId: string,
  previous: Record<string, TeachVerdict> | null = null,
): FeynmanSession {
  return {
    nodeId,
    started: false,
    scaffolded: false,
    explanation: "",
    response: "",
    pending: false,
    verdicts: {},
    quotes: {},
    jargon: [],
    previous,
    reported: false,
    fixing: null,
    fixRuledOut: [],
    fixReaction: null,
  };
}

export type FeynmanAction =
  | { type: "begin" }
  | { type: "scaffold" }
  /** The learner's whole explanation, already diffed server-side into a verdict
   *  per sub-point, the words that earned each gap, and any unpacked jargon. */
  | {
      type: "taught";
      text: string;
      verdicts: Record<string, TeachVerdict>;
      quotes?: Record<string, string>;
      jargon?: string[];
      response: string;
      /** True when only the verdicts have arrived — `stream` fills the wording. */
      pending?: boolean;
    }
  /** The naive student's reaction as it is written. */
  | { type: "stream"; text: string; pending?: boolean }
  | { type: "openFix"; beatId: string }
  | { type: "closeFix" }
  | { type: "fix"; index: number }
  | { type: "teachAgain" };

/**
 * The naive-student engine, as a pure transition. The learner teaches the whole
 * concept in their own words with nothing prompting them → the judge diffs it
 * against the rubric → the Gap Report opens. "Fix this" runs a one-probe
 * corrective that flips a gap to good, and "Teach again" resets for a fresh
 * pass while keeping the last one's verdicts for the delta.
 */
export function feynmanReducer(
  session: FeynmanSession,
  action: FeynmanAction,
  beats: FeynmanBeat[],
): FeynmanSession {
  switch (action.type) {
    case "begin":
      return { ...session, started: true };
    case "scaffold":
      // The freeze-scaffold: reveal the "start with the problem" nudge and drop
      // the learner straight onto the blank page.
      return { ...session, started: true, scaffolded: true };
    case "stream":
      if (!session.pending) return session;
      return { ...session, response: action.text, pending: !!action.pending };
    case "taught": {
      if (session.reported) return session;
      return {
        ...session,
        started: true,
        reported: true,
        explanation: action.text,
        response: action.response,
        pending: !!action.pending,
        // A sub-point the judge never ruled on was never taught: silence is a
        // skip, not a pass. Anything else would grade an unmentioned row good.
        verdicts: Object.fromEntries(
          beats.map((b) => [b.id, action.verdicts[b.id] ?? "skipped"]),
        ),
        quotes: action.quotes ?? {},
        jargon: action.jargon ?? [],
      };
    }
    case "openFix":
      return {
        ...session,
        fixing: action.beatId,
        fixRuledOut: [],
        fixReaction: null,
      };
    case "closeFix":
      return { ...session, fixing: null, fixRuledOut: [], fixReaction: null };
    case "fix": {
      if (!session.fixing) return session;
      const beat = beats.find((b) => b.id === session.fixing);
      const reply = beat?.fix.replies[action.index];
      if (!reply || session.fixRuledOut.includes(reply.label)) return session;
      if (reply.correct) {
        // Gap closed: the sub-point flips to good and won't write back.
        return {
          ...session,
          verdicts: { ...session.verdicts, [beat!.id]: "good" },
          fixing: null,
          fixRuledOut: [],
          fixReaction: null,
        };
      }
      // Caught: surface the correction, rule the wrong answer out, keep trying.
      return {
        ...session,
        fixReaction: reply.response,
        fixRuledOut: [...session.fixRuledOut, reply.label],
      };
    }
    case "teachAgain":
      return {
        ...feynmanStart(session.nodeId, session.verdicts),
        started: true,
        scaffolded: session.scaffolded,
      };
    default:
      return session;
  }
}

/** Beats still red or grey — the gaps that write back to the map as sub-nodes.
 *  Each carries the learner's own words when the judge caught them, so the
 *  Socratic pass the gap opens starts from what they actually said rather than
 *  from a reason written before they said anything. */
export function feynmanGaps(
  session: FeynmanSession,
  beats: FeynmanBeat[],
): GapSpec[] {
  return beats
    .filter(
      (b) =>
        session.verdicts[b.id] === "skipped" ||
        session.verdicts[b.id] === "confused",
    )
    .map((b) => {
      const quote = session.quotes[b.id]?.trim();
      return quote
        ? { ...b.gap, reason: `You said: "${quote}" — ${b.gap.reason}` }
        : b.gap;
    });
}

/** A clean-enough diff: every sub-point explained well, nothing wrong or skipped. */
export function feynmanClean(
  session: FeynmanSession,
  beats: FeynmanBeat[],
): boolean {
  return beats.every((b) => session.verdicts[b.id] === "good");
}

/** How many gaps a pass ended with — the number the second-pass delta compares. */
export function feynmanGapCount(
  verdicts: Record<string, TeachVerdict>,
  beats: FeynmanBeat[],
): number {
  return beats.filter((b) => {
    const v = verdicts[b.id];
    return v === "skipped" || v === "confused";
  }).length;
}

// ---- Phase 4 · Connect (the Elaboration station) --------------------------
// Durable encoding through *elaboration*: the learner wires the new node into
// concepts they already own. The links are real — candidates are pulled from
// this learner's mastered nodes, not generic trivia — so every connection is
// personal and true, and each confirmed link drafts a card for Retain.
//
// The encoding method is *auto-detected*: conceptual material gets elaboration
// and the mnemonic tool stays hidden (a mnemonic there is noise); genuinely
// list-like material — sequences, taxonomies, vocab — unlocks method-of-loci /
// acronym / vivid-association tools instead. Content ships the Linear
// Transformations pass (conceptual, per the design) plus the Gaussian
// Elimination procedure (list-like) so the conditional is real, not decorative.

/** The Connect phase's violet palette (its accent everywhere it appears). */
export const CONNECT_COLOR = {
  accent: "#8c6b9e",
  soft: "#f4eef7",
  border: "rgba(140,107,158,0.35)",
  glow: "rgba(140,107,158,0.26)",
} as const;

/** How the app encodes a node — the auto-detected choice the whole phase turns on. */
export type EncodingKind = "conceptual" | "list-like";

/** A candidate prior node to link to — a real mastered node from the map. */
export interface ElaborationLink {
  /** The prior node's id (must be a mastered node the learner already owns). */
  id: string;
  label: string;
  /** Placement in the 560×440 concept-web canvas. */
  x: number;
  y: number;
  /** The relationship draft pulled from the map — accepted or rewritten. */
  rel: string;
}

/** One offered memory aid, shown only when the content is detected as list-like. */
export interface MnemonicOption {
  /** Method-of-loci · Acronym · Vivid image — the tool kind. */
  kind: string;
  /** The aid's short title (e.g. the acronym itself). */
  title: string;
  /** The generated aid, editable before the learner accepts it. */
  body: string;
}

/** Everything the Connect surface needs for one node's elaboration pass. */
export interface ElaborationContent {
  centerId: string;
  centerLabel: string;
  /** The auto-detected encoding — drives whether the mnemonic tool appears. */
  encoding: EncodingKind;
  /** The detector's plain-language rationale, shown in the method panel. */
  detectNote: string;
  /** The current node's spot in the concept web. */
  center: { x: number; y: number };
  /** Candidate prior nodes to link — drawn from the learner's mastered map. */
  cands: ElaborationLink[];
  /** The ordered/enumerated items a mnemonic organizes (list-like only). */
  items?: string[];
  /** The offered memory aids (list-like only). */
  mnemonics?: MnemonicOption[];
}

/** The three memory aids shown struck-through when the content is conceptual. */
export const MNEMONIC_TOOLS_OFF = ["Memory palace", "Acronym", "Vivid image"] as const;

const MNEMONIC_TOOLS_OFF_PT = ["Palácio da memória", "Acrônimo", "Imagem vívida"] as const;

/** Language-aware struck-through mnemonic tool names. */
export function mnemonicToolsOff(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? MNEMONIC_TOOLS_OFF_PT : MNEMONIC_TOOLS_OFF;
}

/** The live state of one Connect session — held by AtlasApp, read by the view. */
export interface ConnectSession {
  nodeId: string;
  /** The candidate whose linking prompt is open, or null (idle). */
  active: string | null;
  /** The relationship draft per candidate — seeded from the map, then edited. */
  drafts: Record<string, string>;
  /** Which links the learner has confirmed as true. */
  linked: Record<string, boolean>;
  /** The chosen memory aid (index into content.mnemonics), or null (list-like). */
  mnemonicPick: number | null;
  /** The editable mnemonic text — the learner accepts or rewrites the aid. */
  mnemonicDraft: string;
  /** True once the learner accepts the aid — it then drafts its own card. */
  mnemonicAccepted: boolean;
}

export function connectStart(nodeId: string): ConnectSession {
  return {
    nodeId,
    active: null,
    drafts: {},
    linked: {},
    mnemonicPick: null,
    mnemonicDraft: "",
    mnemonicAccepted: false,
  };
}

export type ConnectAction =
  | { type: "select"; id: string }
  | { type: "draft"; id: string; value: string }
  | { type: "confirm"; id: string }
  | { type: "pickMnemonic"; index: number }
  | { type: "draftMnemonic"; value: string }
  | { type: "acceptMnemonic" };

/**
 * The elaboration engine, as a pure transition. Selecting a candidate opens
 * its linking prompt with a draft pulled from the map; confirming links it;
 * for list-like content the learner can pick a memory aid, edit it, and accept
 * it. Everything confirmed here becomes raw material for cards in Retain.
 */
export function connectReducer(
  session: ConnectSession,
  action: ConnectAction,
  content: ElaborationContent,
): ConnectSession {
  switch (action.type) {
    case "select": {
      // Seed the draft from the map's suggested relationship the first time a
      // candidate is opened — the learner accepts or rewrites it.
      const drafts =
        session.drafts[action.id] !== undefined
          ? session.drafts
          : {
              ...session.drafts,
              [action.id]:
                content.cands.find((c) => c.id === action.id)?.rel ?? "",
            };
      return { ...session, active: action.id, drafts };
    }
    case "draft":
      return {
        ...session,
        drafts: { ...session.drafts, [action.id]: action.value },
      };
    case "confirm":
      return { ...session, linked: { ...session.linked, [action.id]: true } };
    case "pickMnemonic": {
      const opt = content.mnemonics?.[action.index];
      if (!opt) return session;
      return {
        ...session,
        mnemonicPick: action.index,
        mnemonicDraft: opt.body,
        mnemonicAccepted: false,
      };
    }
    case "draftMnemonic":
      return { ...session, mnemonicDraft: action.value };
    case "acceptMnemonic":
      return session.mnemonicPick === null
        ? session
        : { ...session, mnemonicAccepted: true };
    default:
      return session;
  }
}

/** How many real links the learner has confirmed. */
export function connectLinkedCount(session: ConnectSession): number {
  return Object.values(session.linked).filter(Boolean).length;
}

/**
 * Two real connections is plenty to move on (the design's advance gate) — but
 * a web that only ever offered one candidate can't produce two, and a gate
 * nobody can pass is a dead end, not a standard.
 */
export function connectReady(
  session: ConnectSession,
  candCount = Infinity,
): boolean {
  return connectLinkedCount(session) >= Math.min(2, Math.max(1, candCount));
}

/** A card drafted from the Connect phase — raw material for the Retain queue. */
export interface ConnectCard {
  /** Stable per (node, source) — re-doing the phase must not duplicate cards. */
  key: string;
  front: string;
  back: string;
  kind: "link" | "mnemonic";
}

const CONNECT_CARD_COPY = {
  en: {
    link: (center: string, cand: string) =>
      `${center} ↔ ${cand}: what’s the connection?`,
    mnemonic: (center: string) => `${center} · what’s the order of the steps?`,
  },
  "pt-BR": {
    link: (center: string, cand: string) =>
      `${center} ↔ ${cand}: qual é a conexão?`,
    mnemonic: (center: string) => `${center} · qual é a ordem dos passos?`,
  },
} as const;

/**
 * The cards this session drafts: one per confirmed link, plus the accepted
 * memory aid when the content is list-like. This is the "tedious step humans
 * skip," done automatically — the phase's write-back into Retain.
 */
export function connectCards(
  session: ConnectSession,
  content: ElaborationContent,
  lang: Language = "en",
): ConnectCard[] {
  const copy = CONNECT_CARD_COPY[lang];
  const cards: ConnectCard[] = content.cands
    .filter((c) => session.linked[c.id])
    // An empty draft falls back to the map's suggested relationship, so a
    // confirmed link never becomes a card with a blank back.
    .map((c) => ({
      key: `${content.centerId}-connect-${c.id}`,
      front: copy.link(content.centerLabel, c.label),
      back: (session.drafts[c.id]?.trim() || c.rel).trim(),
      kind: "link" as const,
    }));
  if (
    content.encoding === "list-like" &&
    session.mnemonicAccepted &&
    session.mnemonicDraft.trim()
  ) {
    cards.push({
      key: `${content.centerId}-connect-mnemonic`,
      front: copy.mnemonic(content.centerLabel),
      back: session.mnemonicDraft.trim(),
      kind: "mnemonic",
    });
  }
  return cards;
}

// ---- Phase 5 · Crucible (application / transfer) — the depth engine --------
// Force the knowledge into a *novel* context it wasn't taught in — the truest
// signal of mastery, far better than card recall. A confidence prompt comes
// first (the calibration hook), then a problem generated to sit at the edge of
// the learner's ability, escalating up a difficulty ladder (deliberate
// practice). Feedback is specific: not right/wrong but *which sub-concept*
// transferred and which didn't. A failure is diagnostically rich — it names the
// sub-concept that didn't transfer, writes it to the map as a red Gap node and
// flips the parent Shaky, then offers a 30-second Socratic re-explanation before
// a recalibrated re-attempt one rung down. Only Crucible success (plus
// retention) grants green. Content ships the Linear Transformations transfer
// problem — a type-designer shear the learner was never handed — so the
// confidence → attempt → diagnostic → re-attempt loop is real, not decorative.

/** The Crucible's deep-rust palette (its accent everywhere it appears). */
export const CRUCIBLE_COLOR = {
  accent: "#a23b34",
  soft: "rgba(162,59,52,0.08)",
  border: "rgba(162,59,52,0.28)",
  glow: "rgba(162,59,52,0.24)",
} as const;

/** The stated-confidence levels captured before the problem is revealed. */
export const CONFIDENCE_LEVELS = [
  "Not sure",
  "Fairly confident",
  "Very confident",
] as const;
export type ConfidenceLevel = 0 | 1 | 2;

const CONFIDENCE_LEVELS_PT = [
  "Não tenho certeza",
  "Bastante confiante",
  "Muito confiante",
] as const;

/** Language-aware pre-problem confidence levels. */
export function confidenceLevels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? CONFIDENCE_LEVELS_PT : CONFIDENCE_LEVELS;
}

/** One rung of the escalating difficulty ladder (deliberate practice). */
export interface CrucibleRung {
  label: string;
}

/** A transfer-diagnostic verdict: a sub-concept that carried over, or didn't. */
export type TransferVerdict = "good" | "red";

/** The visual-diff colors — green = transferred, red = didn't carry over. */
export const TRANSFER_COLOR: Record<TransferVerdict, string> = {
  good: STATE_COLOR.mastered,
  red: STATE_COLOR.gap,
};

/** One row of the transfer diagnostic — which sub-concept moved to the new frame. */
export interface TransferRow {
  verdict: TransferVerdict;
  text: string;
}

/** One problem on the ladder — a framing the learner was never handed. */
export interface CrucibleProblem {
  /** The rung label + framing note shown as a pill above the problem. */
  tag: string;
  q: string;
  /** A nudge that reframes without giving it away (contingent difficulty). */
  hint: string;
  placeholder: string;
  /** A pre-written attempt the learner can drop in (a demo affordance). */
  sample: string;
}

/** Everything the Crucible surface needs for one node's transfer pass. */
export interface CrucibleContent {
  centerId: string;
  centerLabel: string;
  /** Mastered nodes the problem interleaves — retrieval isn't blocked on one idea. */
  draws: string[];
  /** The escalating difficulty ladder shown in the sidebar. */
  rungs: CrucibleRung[];
  /** The precise sub-concept a first-attempt failure writes back to the map. */
  gap: GapSpec;
  /** The problem per rung — [0] the novel transfer, [1] the scaffolded re-attempt. */
  problems: CrucibleProblem[];
  /** The transfer diagnostic shown on submission (what carried over, what didn't). */
  transfer: TransferRow[];
  /** The 30-second Socratic re-explanation aimed straight at the gap. */
  reExplain: string;
}

/** The two stages of a Crucible attempt: state confidence, then work. */
export type CrucibleStage = "confidence" | "work";
/** A submission's result: a first-rung failure, or a transferred re-attempt. */
export type CrucibleOutcome = "partial" | "pass";

/** The live state of one Crucible session — held by AtlasApp, read by the view. */
export interface CrucibleSession {
  nodeId: string;
  stage: CrucibleStage;
  /** Stated confidence before the problem is revealed (the calibration hook). */
  conf: ConfidenceLevel | null;
  /** Current rung of the ladder (0 = novel transfer, 1 = scaffolded re-attempt). */
  rung: number;
  attempt: string;
  submitted: boolean;
  outcome: CrucibleOutcome | null;
  /** The judged transfer diagnostic for THIS attempt (#27) — grounded in what
   *  the learner actually wrote; null until judged. */
  transfer: TransferRow[] | null;
  /** Whether the 30-second Socratic re-explanation is expanded. */
  reExplain: boolean;
}

export function crucibleStart(nodeId: string): CrucibleSession {
  return {
    nodeId,
    stage: "confidence",
    conf: null,
    rung: 0,
    attempt: "",
    submitted: false,
    outcome: null,
    transfer: null,
    reExplain: false,
  };
}

export type CrucibleAction =
  | { type: "confidence"; level: ConfidenceLevel }
  | { type: "attempt"; value: string }
  | { type: "sample" }
  /** The server judge's grading of the actual attempt (#27). `transfer` may be
   *  empty when only the pass/partial verdict has streamed in. */
  | { type: "result"; outcome: CrucibleOutcome; transfer: TransferRow[] }
  /** The diagnostic rows for an already-graded attempt, arriving behind their
   *  verdict. Ignored unless the attempt is submitted, so it can never grade. */
  | { type: "transfer"; transfer: TransferRow[] }
  | { type: "toggleReExplain" }
  | { type: "retry" };

/**
 * The transfer engine, as a pure transition. Stating confidence opens the
 * workspace; the learner attempts, then submits. The first rung fails
 * precisely — the caller writes the named sub-concept back to the map as a red
 * Gap node — and a re-attempt one rung down transfers. The write-back itself
 * (spawning/removing the gap node, flipping mastery) lives in AtlasApp; this
 * reducer only owns the session.
 */
export function crucibleReducer(
  session: CrucibleSession,
  action: CrucibleAction,
  content: CrucibleContent,
): CrucibleSession {
  switch (action.type) {
    case "confidence":
      return { ...session, conf: action.level, stage: "work" };
    case "attempt":
      return { ...session, attempt: action.value };
    case "sample": {
      const prob = crucibleProblem(session, content);
      return prob ? { ...session, attempt: prob.sample } : session;
    }
    case "result":
      // The judge graded the real attempt — pass/partial is earned, not
      // scripted, and the diagnostic rows are grounded in what was written.
      if (session.submitted || !session.attempt.trim()) return session;
      return {
        ...session,
        submitted: true,
        outcome: action.outcome,
        transfer: action.transfer,
      };
    case "transfer":
      return session.submitted ? { ...session, transfer: action.transfer } : session;
    case "toggleReExplain":
      return { ...session, reExplain: !session.reExplain };
    case "retry":
      // Recalibrate down one step and re-open at the confidence gate — the
      // calibration hook fires on every attempt, retries included.
      return {
        ...session,
        stage: "confidence",
        conf: null,
        rung: 1,
        attempt: "",
        submitted: false,
        outcome: null,
        transfer: null,
        reExplain: false,
      };
    default:
      return session;
  }
}

/** The problem for the session's current rung (clamped to the ladder we ship). */
export function crucibleProblem(
  session: CrucibleSession,
  content: CrucibleContent,
): CrucibleProblem | undefined {
  return content.problems[Math.min(session.rung, content.problems.length - 1)];
}

/**
 * Where the ladder sits: the first attempt starts high (a Novel transfer, with
 * the two easier rungs already behind the learner); a re-attempt drops to the
 * Guided-application rung. Rungs before this show done, this one current.
 */
export function crucibleCurrentRung(session: CrucibleSession): number {
  return session.rung === 0 ? 2 : 1;
}

/**
 * The calibration read-back: predicted confidence held against what actually
 * happened. Overconfidence (felt sure, transfer broke) is the thing this phase
 * exists to catch; low confidence that proved real is well-calibrated.
 */
export function crucibleCalib(
  session: CrucibleSession,
  lang: Language = "en",
): string {
  if (lang === "pt-BR") {
    if (session.outcome === "partial") {
      if (session.conf === 2)
        return "Você disse “Muito confiante” — e a transferência na primeira tentativa ainda quebrou. Essa distância entre a sensação e o resultado é exatamente o excesso de confiança que esta fase existe para pegar.";
      if (session.conf === 0)
        return "Você sinalizou baixa confiança, e o ponto instável era real — isso é bem calibrado. Agora feche essa lacuna.";
      return "Você se sentiu razoavelmente confiante, mas um subconceito não se transferiu. Registre a diferença entre se sentir pronto e estar pronto.";
    }
    if (session.outcome === "pass")
      return "Confiança e resultado agora se alinham — isso é domínio calibrado, não fluência.";
    return "";
  }
  if (session.outcome === "partial") {
    if (session.conf === 2)
      return "You said “Very confident” — and the first-try transfer still broke. That distance between the feeling and the result is exactly the overconfidence this phase exists to catch.";
    if (session.conf === 0)
      return "You flagged low confidence, and the shaky spot was real — that’s well-calibrated. Now close it.";
    return "You felt fairly confident, but one sub-concept didn’t transfer. Register the gap between feeling ready and being ready.";
  }
  if (session.outcome === "pass")
    return "Confidence and result now line up — that’s calibrated mastery, not fluency.";
  return "";
}

// ---- Phase 6 · Retain (Review queue / FSRS) — the daily spine -------------
// Keep mastered knowledge alive with optimally-spaced retrieval. This is the
// habit surface — designed for adherence as much as scheduling. Cards are
// auto-generated from the earlier phases (the tedious step humans skip):
// atomic, cloze where apt, varied by type (recall / explain-why / application).
// The queue is honest — framed in *minutes* against the daily target, never a
// wall of cards — and one card shows at a time: confidence tap (the calibration
// hook), flip, grade (feeds FSRS). The alive-loop is the difference from "Anki
// plus a chatbot": a missed card doesn't just reschedule — it triggers a
// 30-second Socratic re-explanation right there and flags its node Shaky on the
// map, so retention failure re-enters Phase 1. Content ships the Linear
// Transformations rotation of cards so the tap → flip → grade → alive-loop is
// real, not decorative.

/** The three card kinds — review isn't only fill-in-the-blank. */
export type ReviewCardType = "recall" | "why" | "apply";

/** Each type's label + accent (recall = learning, why = Connect, apply = Crucible). */
export const REVIEW_TYPE_META: Record<
  ReviewCardType,
  { label: string; color: string }
> = {
  recall: { label: "Recall", color: STATE_COLOR.learning },
  why: { label: "Explain why", color: CONNECT_COLOR.accent },
  apply: { label: "Application", color: CRUCIBLE_COLOR.accent },
};

const REVIEW_TYPE_LABEL_PT: Record<ReviewCardType, string> = {
  recall: "Recordar",
  why: "Explicar por quê",
  apply: "Aplicação",
};

/** Language-aware review-card type label + color. */
export function reviewTypeMeta(
  type: ReviewCardType,
  lang: Language = "en",
): { label: string; color: string } {
  return lang === "pt-BR"
    ? { label: REVIEW_TYPE_LABEL_PT[type], color: REVIEW_TYPE_META[type].color }
    : REVIEW_TYPE_META[type];
}

/** The FSRS grade after reveal — sets the next interval. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** The grade buttons, worst → best, each colored by the state it echoes. */
export const REVIEW_GRADES: ReadonlyArray<{
  key: ReviewGrade;
  label: string;
  color: string;
}> = [
  { key: "again", label: "Again", color: STATE_COLOR.gap },
  { key: "hard", label: "Hard", color: STATE_COLOR.shaky },
  { key: "good", label: "Good", color: STATE_COLOR.learning },
  { key: "easy", label: "Easy", color: STATE_COLOR.mastered },
];

const REVIEW_GRADE_LABEL_PT: Record<ReviewGrade, string> = {
  again: "De novo",
  hard: "Difícil",
  good: "Bom",
  easy: "Fácil",
};

/** Language-aware grade buttons. */
export function reviewGrades(
  lang: Language = "en",
): ReadonlyArray<{ key: ReviewGrade; label: string; color: string }> {
  return lang === "pt-BR"
    ? REVIEW_GRADES.map((g) => ({ ...g, label: REVIEW_GRADE_LABEL_PT[g.key] }))
    : REVIEW_GRADES;
}

/** The pre-flip confidence tap — the calibration hook, least → most solid. */
export const REVIEW_CONFIDENCE = ["Blank", "Shaky", "Solid"] as const;
export type ReviewConfidence = 0 | 1 | 2;

const REVIEW_CONFIDENCE_PT = ["Em branco", "Instável", "Sólido"] as const;

/** Language-aware pre-flip confidence tap labels. */
export function reviewConfidenceLabels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? REVIEW_CONFIDENCE_PT : REVIEW_CONFIDENCE;
}

/** Retention-health forecast tone: due now, softening, or rock-solid. */
export type ForecastTone = "due" | "soft" | "solid";

/** The forecast bar colors — due borrows the accent, soft/solid the states. */
export const FORECAST_COLOR: Record<ForecastTone, string> = {
  due: "#2f6b4f", // color.accent — surfaced now
  soft: STATE_COLOR.shaky,
  solid: STATE_COLOR.mastered,
};

/** One row of the FSRS forecast shown in the sidebar. */
export interface ForecastRow {
  label: string;
  count: string;
  sub: string;
  tone: ForecastTone;
}

/**
 * One review card — atomic, one fact. Cloze cards carry `cloze`/`answer`;
 * others carry a plain `front`. `fails` marks the card whose miss re-enters the
 * loop (flags its node Shaky), and `reExplain` is the 30-second Socratic aside
 * shown right there when it's missed.
 */
export interface ReviewCard {
  id: string;
  type: ReviewCardType;
  /** Which session auto-generated it — the provenance line ("from your … session"). */
  source: string;
  /** The node this card keeps alive; a miss flags it Shaky on the map. */
  node: string;
  /** Cloze halves around the blank (recall cloze cards only). */
  cloze?: [string, string];
  /** The answer filled into the cloze blank. */
  answer?: string;
  /** A plain question front (why / apply cards). */
  front?: string;
  /** The full answer revealed on flip. */
  back: string;
  /** FSRS next-interval per grade — shown on the grade buttons. Supplied by
   *  the scheduler (`intervalLabels`), never by the generator: the generated
   *  card is a draft that `newStoredCard` turns into a real scheduled card. */
  fsrs?: Record<ReviewGrade, string>;
  /** A card whose miss re-enters Phase 1 (writes its node Shaky). */
  fails?: boolean;
  /** The 30-second Socratic re-explanation shown when it's missed. */
  reExplain?: string;
}

/** Everything the Retain surface needs for one day's honest queue. */
export interface RetainContent {
  /** The daily target from onboarding — the queue budget, in minutes. */
  budgetMin: number;
  /** Built from real due dates by `forecastRows`. Absent on the generator's
   *  output, which is a card factory rather than a queue. */
  forecast?: ForecastRow[];
  cards: ReviewCard[];
}

/** The micro-Socratic aside "Explain" opens on any revealed card. */
export const REVIEW_ASIDE =
  "A 30-second Socratic aside: don’t restate the answer — ask what forces it. Which earlier concept makes this true? Trace one concrete example through and watch where the rule takes it.";

const REVIEW_ASIDE_PT =
  "Uma pausa Socrática de 30 segundos: não repita a resposta — pergunte o que a obriga a ser verdadeira. Que conceito anterior torna isso verdadeiro? Percorra um exemplo concreto e veja até onde a regra leva.";

/** Language-aware micro-Socratic aside. */
export function reviewAside(lang: Language = "en"): string {
  return lang === "pt-BR" ? REVIEW_ASIDE_PT : REVIEW_ASIDE;
}

/** The stages of one card: confidence tap → flip → grade, or the fail aside. */
export type RetainStage = "confidence" | "reveal" | "aside" | "failed";

/** The live state of one Retain session — held by AtlasApp, read by the view. */
export interface RetainSession {
  /** Index of the card on screen. */
  idx: number;
  stage: RetainStage;
  /** Confidence tapped before the flip (the calibration hook). */
  conf: ReviewConfidence | null;
  /** Grade recorded per card id — drives the honest-queue progress + budget. */
  done: Record<string, ReviewGrade>;
  /** True once a missed card has flagged its node Shaky on the map. */
  wroteBack: boolean;
  /** True once the queue is cleared — the done-for-today surface. */
  finished: boolean;
}

export function retainStart(): RetainSession {
  return {
    idx: 0,
    stage: "confidence",
    conf: null,
    done: {},
    wroteBack: false,
    finished: false,
  };
}

export type RetainAction =
  | { type: "confidence"; level: ReviewConfidence }
  | { type: "grade"; grade: ReviewGrade }
  | { type: "toggleAside" }
  | { type: "continue" };

/** Move to the next card, or finish the queue when it's the last. */
function retainAdvance(
  session: RetainSession,
  done: Record<string, ReviewGrade>,
  content: RetainContent,
): RetainSession {
  const next = session.idx + 1;
  if (next >= content.cards.length) return { ...session, done, finished: true };
  return { ...session, idx: next, stage: "confidence", conf: null, done };
}

/**
 * The review engine, as a pure transition. Confidence flips the card; a grade
 * feeds FSRS and advances — except "Again", which opens the alive-loop (the
 * fail stage with its instant re-explanation). The map write-back (flagging the
 * node Shaky) is a side effect that lives in AtlasApp, exactly as the Crucible's
 * gap write-back does; this reducer only owns the session.
 */
export function retainReducer(
  session: RetainSession,
  action: RetainAction,
  content: RetainContent,
): RetainSession {
  switch (action.type) {
    case "confidence":
      if (session.stage !== "confidence") return session;
      return { ...session, conf: action.level, stage: "reveal" };
    case "toggleAside":
      if (session.stage !== "reveal" && session.stage !== "aside")
        return session;
      return {
        ...session,
        stage: session.stage === "aside" ? "reveal" : "aside",
      };
    case "grade": {
      if (session.stage !== "reveal" && session.stage !== "aside")
        return session;
      const card = content.cards[session.idx];
      const done = { ...session.done, [card.id]: action.grade };
      // A miss doesn't just reschedule — it opens the alive-loop and flags the
      // node Shaky (the write-back happens in AtlasApp).
      if (action.grade === "again")
        return { ...session, stage: "failed", done, wroteBack: !!card.fails };
      return retainAdvance(session, done, content);
    }
    case "continue":
      // "Schedule re-teach · continue" — leave the fail stage and move on.
      if (session.stage !== "failed") return session;
      return retainAdvance(session, session.done, content);
    default:
      return session;
  }
}

/** The card on screen (clamped to the generated deck). */
export function reviewCard(
  session: RetainSession,
  content: RetainContent,
): ReviewCard {
  return content.cards[Math.min(session.idx, content.cards.length - 1)];
}

/** The honest queue's time math — minutes, never a card count. */
export interface RetainBudget {
  doneCount: number;
  total: number;
  /** Minutes spent so far. */
  spent: number;
  /** Minutes left against the daily target. */
  left: number;
  /** Fill percent of the budget bar. */
  pct: number;
}

export function retainBudget(
  session: RetainSession,
  content: RetainContent,
): RetainBudget {
  const total = Math.max(1, content.cards.length);
  const doneCount = session.finished ? total : Object.keys(session.done).length;
  const perCard = content.budgetMin / total;
  const spent = Math.round(doneCount * perCard);
  const left = Math.max(0, content.budgetMin - spent);
  const pct = Math.min(100, Math.round((spent / content.budgetMin) * 100));
  return { doneCount, total, spent, left, pct };
}

/** The header queue chip — time and cards left, or "Queue clear". */
export function retainQueueLabel(
  session: RetainSession,
  content: RetainContent,
  lang: Language = "en",
): string {
  if (lang === "pt-BR") {
    if (session.finished) return "Fila limpa";
    const { left, total, doneCount } = retainBudget(session, content);
    return `~${left} min restantes · ${total - doneCount} cartões`;
  }
  if (session.finished) return "Queue clear";
  const { left, total, doneCount } = retainBudget(session, content);
  return `~${left} min left · ${total - doneCount} cards`;
}

/**
 * The failure calibration read-back: the confidence tap held against the miss.
 * A "Solid" tap that then missed is the overconfidence Review exists to catch.
 */
export function retainCalib(session: RetainSession, lang: Language = "en"): string {
  if (session.stage !== "failed") return "";
  if (lang === "pt-BR") {
    if (session.conf === 2)
      return "Você tocou “Sólido” antes de virar — e errou. Esse excesso de confiança é exatamente o sinal que a Revisão existe para pegar.";
    if (session.conf === 0)
      return "Você sinalizou em branco, e estava certo. Bem calibrado — agora vamos fechar isso de verdade.";
    return "Você se sentiu instável, e estava. O cartão volta para o início da fila e o nó reentra no ciclo.";
  }
  if (session.conf === 2)
    return "You tapped “Solid” before flipping — and missed it. That over-confidence is the exact signal Review is built to catch.";
  if (session.conf === 0)
    return "You flagged it blank, and it was. Well-calibrated — now let’s close it for real.";
  return "You felt shaky, and it was. The card goes back to the front of the queue and the node re-enters the loop.";
}

// ---- Adherence (§13) — the wrapper that decides whether any of this fires ---
// Spacing is worthless unopened and the spiral only spins on return, so this is
// a first-class system, not polish. The #1 quit trigger is breaking a streak and
// feeling it's ruined — so the streak is *forgiving*: one missed day is absorbed
// by a banked freeze instead of resetting to zero. The queue is always framed in
// minutes against the daily target (never a wall of cards), momentum is the map
// lighting up over weeks (the replay on the Map), and the daily loop is short,
// winnable, and ends on a lit node — a good feeling to return to. Content ships a
// sample streak history so the flame → popover → forgiving-freeze story reads as
// designed; in the final product these aggregate the learner's real active days.

/** How one day sits in the streak: target met, absorbed by a freeze, missed, or today's pending day. */
export type StreakDayStatus = "hit" | "freeze" | "miss" | "today";

/** The flame + freeze palette — the streak borrows the design's amber, the freeze a cool slate, a miss the ghost ink. */
export const STREAK_COLOR = {
  flame: "#c99a2e",
  freeze: "#6f8fa6",
  miss: "rgba(44,40,35,0.16)",
} as const;

/** One day in the recent streak strip, oldest → newest, ending on today. */
export interface StreakDay {
  /** Single-letter weekday label (M T W T F S S). */
  label: string;
  status: StreakDayStatus;
}

/**
 * The live adherence state — held by AtlasApp, read by the flame, the streak
 * popover, and the done-for-today surface. `streak` already counts today once
 * `metToday` flips; a `freeze` day in `history` is a missed day the streak
 * survived, which is the whole forgiving mechanic made visible.
 */
export interface AdherenceState {
  /** Current streak length in days — a freeze-absorbed day keeps it unbroken. */
  streak: number;
  /** Longest streak on record — the flame popover's high-water mark. */
  best: number;
  /** Freezes banked — each absorbs one missed day before the streak resets. */
  freezes: number;
  /** True once today's target is met — the flame reads lit, the queue reads clear. */
  metToday: boolean;
  /** When the learner usually shows up — tunes the reminder to their rhythm, not midnight. */
  usualTime: string;
  /** Whether the right-moment reminder is armed. */
  reminderOn: boolean;
  /** The last two weeks, oldest → newest, ending on today — the popover strip. */
  history: StreakDay[];
  /** The local calendar day (YYYY-MM-DD) the trailing "today" square refers to —
   *  what makes rollover real instead of resetting per page load (#22). */
  lastDay: string;
}

/** Single-letter weekday label for a date (M T W T F S S). */
function weekdayLetter(d: Date): string {
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

/** The local calendar day as YYYY-MM-DD — all rollover math keys off this. */
export function localDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

/** A freeze is earned every this-many consecutive days (documented mechanic). */
export const FREEZE_EVERY = 7;
/** Freezes bank up to this many — forgiveness, not immunity. */
export const MAX_FREEZES = 3;

/**
 * A fresh learner's adherence state: no fabricated streak — the strip holds
 * only today's pending square, one freeze comes banked (the forgiving
 * mechanic is armed from day one), and the reminder defaults on at a sane
 * evening hour until real usage tunes it.
 */
export function freshAdherence(now: Date = new Date()): AdherenceState {
  return {
    streak: 0,
    best: 0,
    freezes: 1,
    metToday: false,
    usualTime: "7:30pm",
    reminderOn: true,
    history: [{ label: weekdayLetter(now), status: "today" }],
    lastDay: localDay(now),
  };
}

/**
 * Day rollover (#22), pure: called on load and whenever the calendar day may
 * have turned. For every day that passed since `lastDay`:
 * met → the streak already counted it; unmet with a freeze banked → the freeze
 * absorbs it (history shows "freeze", streak holds); unmet with none → the
 * streak resets. Ends with a fresh pending "today" square. Idempotent within
 * the same calendar day.
 */
export function rolloverAdherence(
  state: AdherenceState,
  now: Date = new Date(),
): AdherenceState {
  const today = localDay(now);
  // Older saved runs predate lastDay — adopt today without judging the past.
  const last = state.lastDay || today;
  if (last === today) return state.lastDay ? state : { ...state, lastDay: today };
  const elapsed = Math.max(
    1,
    Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000),
  );
  let { streak, freezes } = state;
  const history = [...state.history];
  const [ly, lm, ld] = last.split("-").map(Number);
  // Judge each passed day: `last` first (its square is the trailing one),
  // then any fully skipped days in between.
  for (let i = 0; i < elapsed; i++) {
    const dayMet = i === 0 && state.metToday;
    if (i > 0)
      history.push({
        label: weekdayLetter(new Date(ly, lm - 1, ld + i)),
        status: "miss",
      });
    if (dayMet) continue; // already counted by markTodayMet
    const idx = history.length - 1;
    if (freezes > 0) {
      freezes -= 1;
      history[idx] = { ...history[idx], status: "freeze" };
    } else {
      streak = 0;
      history[idx] = { ...history[idx], status: "miss" };
    }
  }
  history.push({ label: weekdayLetter(now), status: "today" });
  return {
    ...state,
    streak,
    freezes,
    metToday: false,
    history: history.slice(-14),
    lastDay: today,
  };
}

/** The daily queue, framed honestly — minutes against the target, never a card wall. */
export interface DailyQueue {
  minutes: number;
  cards: number;
}

/** The honest top-bar queue: minutes budget + cards due now, read off the FSRS forecast. */
export function dailyQueue(
  content: RetainContent | null,
  fallbackMinutes: number,
): DailyQueue {
  if (!content) return { minutes: fallbackMinutes, cards: 0 };
  const due = content.forecast?.find((f) => f.tone === "due");
  const cards = due
    ? parseInt(due.count, 10) || content.cards.length
    : content.cards.length;
  return { minutes: content.budgetMin, cards };
}

/**
 * Meeting today's target: light the pending day, advance the streak, mark met.
 * Pure and idempotent — calling it again once the day is in changes nothing, so
 * mastering a node and later clearing the queue both land the same single day.
 */
export function markTodayMet(state: AdherenceState): AdherenceState {
  if (state.metToday) return state;
  const streak = state.streak + 1;
  return {
    ...state,
    metToday: true,
    streak,
    best: Math.max(state.best, streak),
    // Every FREEZE_EVERY consecutive days banks one freeze (capped).
    freezes:
      streak > 0 && streak % FREEZE_EVERY === 0
        ? Math.min(MAX_FREEZES, state.freezes + 1)
        : state.freezes,
    history: state.history.map((d) =>
      d.status === "today" ? { ...d, status: "hit" } : d,
    ),
  };
}

/** Toggle the right-moment reminder on or off. */
export function toggleReminder(state: AdherenceState): AdherenceState {
  return { ...state, reminderOn: !state.reminderOn };
}

/**
 * The flame's one-line status: today's already in and safe, or how a banked
 * freeze protects the streak if today goes unopened — the reassurance that keeps
 * a missed day from feeling like ruin.
 */
export function streakStatus(state: AdherenceState, lang: Language = "en"): string {
  if (lang === "pt-BR") {
    if (state.metToday)
      return `Hoje já contou — a sequência de ${state.streak} dias se mantém. Até logo, por volta das ${state.usualTime}.`;
    if (state.freezes > 0)
      return `Perca hoje e um congelamento absorve — a sequência de ${state.streak} dias sobrevive, sem reiniciar.`;
    return `Nenhum congelamento disponível — limpe a fila de hoje para manter viva a sequência de ${state.streak} dias.`;
  }
  if (state.metToday)
    return `Today's in — the ${state.streak}-day streak holds. See you around ${state.usualTime}.`;
  if (state.freezes > 0)
    return `Miss today and a freeze absorbs it — the ${state.streak}-day streak survives, no reset.`;
  return `No freezes banked — clear today's queue to keep the ${state.streak}-day streak alive.`;
}

/** The reminder nudge copy — tuned to when the learner actually shows up, not dumped at midnight. */
export function reminderCopy(state: AdherenceState, lang: Language = "en"): string {
  if (lang === "pt-BR") {
    return state.reminderOn
      ? `Lembrete marcado para ~${state.usualTime} — quando você costuma aparecer, não à meia-noite.`
      : `Lembretes desativados — avisaríamos por volta das ${state.usualTime}, seu horário de costume.`;
  }
  return state.reminderOn
    ? `Nudge set for ~${state.usualTime} — when you usually show up, not midnight.`
    : `Reminders off — we'd nudge around ${state.usualTime}, your usual time.`;
}

// ---- Calibration / Metacognition (§12) — the "learn to learn" edge ---------
// The learner doesn't just learn the material — they learn *what they actually
// know*. Confidence is captured cheaply everywhere (the Consume hook, the
// tap before every Crucible problem and every review-card flip), then held
// against first-try performance. Overconfidence — felt solid, failed — is the
// thing this surface exists to catch, because that gap is fluency masquerading
// as mastery. Content ships the design's sample confidence-vs-performance set so
// the curve → per-node breakdown → "jump to its Crucible" loop is real.

/** One calibration sample: stated confidence (felt) vs. first-try result (real), 0–100. */
export interface CalibSample {
  /** The node this reading belongs to. */
  id: string;
  /** Predicted confidence, averaged across this node's confidence hooks. */
  felt: number;
  /** Actual first-attempt performance — the honest signal. */
  real: number;
}

/** How a reading sits against the diagonal: felt ahead of, behind, or tracking real. */
export type CalibVerdict = "over" | "under" | "ok";

/** How far felt must lead/lag real to leave the well-calibrated band. */
export const CALIB_THRESHOLD = 12;

/** The verdict colors — overconfident borrows Shaky, under Learning, ok Mastered. */
export const CALIB_COLOR: Record<CalibVerdict, string> = {
  over: STATE_COLOR.shaky,
  under: STATE_COLOR.learning,
  ok: STATE_COLOR.mastered,
};

export const CALIB_VERDICT_LABEL: Record<CalibVerdict, string> = {
  over: "Overconfident",
  under: "Underconfident",
  ok: "Well-calibrated",
};

const CALIB_VERDICT_LABEL_PT: Record<CalibVerdict, string> = {
  over: "Excesso de confiança",
  under: "Falta de confiança",
  ok: "Bem calibrado",
};

/** Language-aware calibration verdict label. */
export function calibVerdictLabel(verdict: CalibVerdict, lang: Language = "en"): string {
  return (lang === "pt-BR" ? CALIB_VERDICT_LABEL_PT : CALIB_VERDICT_LABEL)[verdict];
}

/** The violet "your tendency" trend line, shared with the Connect accent. */
export const CALIB_TREND_COLOR = CONNECT_COLOR.accent;

/** Which side of the diagonal a reading falls on. */
export function calibVerdict(felt: number, real: number): CalibVerdict {
  const diff = felt - real;
  return diff > CALIB_THRESHOLD ? "over" : diff < -CALIB_THRESHOLD ? "under" : "ok";
}

/** A sample resolved with its verdict and the node's label, ready to render. */
export interface CalibItem extends CalibSample {
  /** felt − real: positive = overconfident, negative = under. */
  diff: number;
  verdict: CalibVerdict;
  label: string;
}

/** Resolve live samples against a node-label lookup (nodes carry the names). */
export function calibItems(
  samples: CalibSample[],
  labelOf: (id: string) => string,
): CalibItem[] {
  return samples.map((d) => ({
    ...d,
    diff: d.felt - d.real,
    verdict: calibVerdict(d.felt, d.real),
    label: labelOf(d.id) || d.id,
  }));
}

/** Sort for the per-node breakdown: overconfident first, then under, then ok;
 *  within each band the largest miss leads. */
const CALIB_ORDER: Record<CalibVerdict, number> = { over: 0, under: 1, ok: 2 };
export function calibRows(items: CalibItem[]): CalibItem[] {
  return [...items].sort(
    (a, b) =>
      CALIB_ORDER[a.verdict] - CALIB_ORDER[b.verdict] ||
      Math.abs(b.diff) - Math.abs(a.diff),
  );
}

/** How many nodes read overconfident — the left-rail alert count. */
export function calibOverCount(items: CalibItem[]): number {
  return items.filter((d) => d.verdict === "over").length;
}

/** The most overconfident reading (largest felt-over-real gap), if any. */
export function calibWorstOver(items: CalibItem[]): CalibItem | undefined {
  return items
    .filter((d) => d.verdict === "over")
    .sort((a, b) => b.diff - a.diff)[0];
}

/** The most underconfident reading (largest real-over-felt gap), if any. */
export function calibWorstUnder(items: CalibItem[]): CalibItem | undefined {
  return items
    .filter((d) => d.verdict === "under")
    .sort((a, b) => a.diff - b.diff)[0];
}

/**
 * The plain-language coach line that teaches the *feeling* — the whole point of
 * the surface. It names the worst overconfident node and spells out that the
 * sense of knowing outran the doing: fluency, not mastery.
 */
export function calibCoach(items: CalibItem[], lang: Language = "en"): string {
  const w = calibWorstOver(items);
  if (lang === "pt-BR") {
    return w
      ? `Reler pareceu aprendizado em ${w.label} — você tinha ${w.felt}% de certeza, mas transferiu apenas ${w.real}% na primeira tentativa. Isso é fluência, não domínio.`
      : "Confiança e resultados estão alinhados de perto — bem calibrado em geral.";
  }
  return w
    ? `Re-reading felt like learning on ${w.label} — you were ${w.felt}% sure, then transferred at just ${w.real}% on the first attempt. That’s fluency, not mastery.`
    : "Confidence and results are tracking closely — well-calibrated across the board.";
}

/** The per-topic read: the systematic tilt the live readings show, if any. */
export function calibTopicLine(items: CalibItem[], lang: Language = "en"): string {
  const over = items.filter((d) => d.verdict === "over");
  if (lang === "pt-BR") {
    if (over.length >= 2)
      return `Você está sistematicamente confiante demais em ${over
        .slice(0, 3)
        .map((d) => d.label)
        .join(", ")} — esses pareciam mais claros do que se mostraram sob um problema novo.`;
    if (items.length === 0)
      return "Ainda sem leituras — os toques de confiança no Crisol e na Revisão constroem essa curva à medida que você trabalha.";
    return "Ainda sem tendência sistemática — continue trabalhando; cada toque de confiança refina essa leitura.";
  }
  if (over.length >= 2)
    return `You're systematically overconfident across ${over
      .slice(0, 3)
      .map((d) => d.label)
      .join(", ")} — these felt clearer than they've proven to be under a novel problem.`;
  if (items.length === 0)
    return "No readings yet — confidence taps in the Crucible and Review build this curve as you work.";
  return "No systematic tilt yet — keep working; every confidence tap sharpens this read.";
}

/** The other-direction note: where the learner sells themselves short. */
export function calibUnderLine(items: CalibItem[], lang: Language = "en"): string {
  const w = calibWorstUnder(items);
  if (lang === "pt-BR") {
    return w
      ? `Você se subestima em ${w.label}: avaliou ${w.felt}%, entregou ${w.real}%. Confie mais — gaste tempo onde está a lacuna real.`
      : "";
  }
  return w
    ? `You sell yourself short on ${w.label}: rated ${w.felt}%, delivered ${w.real}%. Trust it more — spend the time where the real gap is.`
    : "";
}

/**
 * Which phase a node is on, given its mastery state (-1 = locked).
 * Mastered alone doesn't grant Retained ✓ — `reviewed` (real review history:
 * a card for this node graded good or better) is what completes the spiral (#13).
 */
export function phaseIndex(state: NodeState, reviewed: boolean): number {
  switch (state) {
    case "frontier":
      return 0;
    case "learning":
      return 2;
    case "shaky":
      return 4;
    case "mastered":
      return reviewed ? 6 : 5;
    default:
      return -1;
  }
}

/**
 * `phaseIndex`, corrected by what the learner has actually done.
 *
 * A node goes Learning the moment a reading pass is left part-way through, and
 * that progress is real — the map should show it. But the state alone maps to
 * phase 2 (Feynman), which would tick off both Consume *and* Socratic on the
 * strength of two sections read. Learning used to be reachable only by
 * entering Socratic, which is what made that mapping true; it isn't anymore.
 *
 * So the reading record gets the last word where it has one:
 *   still reading            → Consume is the current phase
 *   read it, never went on   → Socratic is
 *   anything else            → the state-derived answer stands
 */
export function readingPhaseIndex(
  state: NodeState,
  reviewed: boolean,
  progress?: ConsumeProgress,
): number {
  if (state === "learning" && progress) {
    if (!progress.finished) return 0;
    if (!progress.handedOff) return 1;
  }
  return phaseIndex(state, reviewed);
}

export type DiagnosticEffect = "mastered" | "shaky" | "none";

/** An objective quiz option \u2014 just the label. Which one is correct lives on
 *  the question (`correctIndex`), not per-option, since correctness is now
 *  graded, not self-reported. */
export interface DiagnosticOption {
  label: string;
}

/**
 * How many placement questions a build asks. Fixed rather than derived: the
 * questions are fetched one at a time (each depends on the last answer), so
 * both the panel and the "Question i of N" label need the total up front.
 */
export const DIAGNOSTIC_COUNT = 5;

export const DIAGNOSTIC_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type DiagnosticDifficulty = (typeof DIAGNOSTIC_DIFFICULTIES)[number];

/**
 * One generated placement probe: an objective 4-option question at a given
 * difficulty. `nodeId` names the concept the answer writes back to; `gap`
 * (optional) is the sub-concept a genuine miss splits out under it \u2014 the
 * first live re-plan.
 */
export interface DiagnosticQuestion {
  tag: string;
  q: string;
  note: string;
  nodeId: string;
  difficulty: DiagnosticDifficulty;
  opts: DiagnosticOption[];
  correctIndex: number;
  gap?: GapSpec;
}

/** One step harder / easier, clamped at the ends of the ladder \u2014 the ENEM-style
 *  staircase: a correct answer asks a harder question next, a miss an easier
 *  one. */
export function stepDifficulty(
  current: DiagnosticDifficulty,
  correct: boolean,
): DiagnosticDifficulty {
  const i = DIAGNOSTIC_DIFFICULTIES.indexOf(current);
  const next = correct ? i + 1 : i - 1;
  return DIAGNOSTIC_DIFFICULTIES[
    Math.min(DIAGNOSTIC_DIFFICULTIES.length - 1, Math.max(0, next))
  ];
}

/**
 * What a graded answer writes back to the node's mastery.
 *
 * `maxCorrectDifficulty` is the hardest level answered correctly so far this
 * placement (or null before any correct answer) \u2014 the running evidence of
 * ability the "luck" call leans on.
 *
 * A miss on a question no harder than that evidence reads as a slip, not a
 * gap (the ENEM read: acing hard questions then fumbling an easy one is
 * noise, not proof of not knowing it) \u2014 it's discounted to the same effect a
 * correct answer would give, and spawns no gap node.
 */
export function diagnosticEffect(
  difficulty: DiagnosticDifficulty,
  correct: boolean,
  maxCorrectDifficulty: DiagnosticDifficulty | null,
): DiagnosticEffect {
  if (correct) return "mastered";
  const rank = (d: DiagnosticDifficulty) => DIAGNOSTIC_DIFFICULTIES.indexOf(d);
  const isLuckMiss =
    maxCorrectDifficulty !== null && rank(difficulty) <= rank(maxCorrectDifficulty);
  return isLuckMiss ? "mastered" : "shaky";
}

export type GoalKind = "exam" | "project" | "mastery";

export const GOALS: ReadonlyArray<[GoalKind, string]> = [
  ["exam", "Pass an exam"],
  ["project", "Build a project"],
  ["mastery", "General mastery"],
];

const GOALS_PT: ReadonlyArray<[GoalKind, string]> = [
  ["exam", "Passar em uma prova"],
  ["project", "Construir um projeto"],
  ["mastery", "Domínio geral"],
];

/** Language-aware onboarding goal options. */
export function goals(lang: Language = "en"): ReadonlyArray<[GoalKind, string]> {
  return lang === "pt-BR" ? GOALS_PT : GOALS;
}

export const DAILY_TARGETS = [10, 15, 20, 30] as const;

export interface OnboardingForm {
  topic: string;
  goal: GoalKind;
  interests: string;
  target: number;
  /** ISO date (YYYY-MM-DD) of the exam when goal is "exam"; "" = not set —
   *  pace then shows no countdown instead of a fabricated one (#23). */
  examDate: string;
}

export const DEFAULT_FORM: OnboardingForm = {
  topic: "Linear Algebra",
  goal: "exam",
  interests: "chess, investing",
  target: 15,
  examDate: "",
};

/** Every ancestor of `id` (including itself) along prerequisite edges. */
export function ancestorsOf(id: string, edges: ConceptEdge[]): Set<string> {
  const rev: Record<string, string[]> = {};
  for (const [a, b] of edges) (rev[b] = rev[b] ?? []).push(a);
  const seen = new Set([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of rev[cur] ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        stack.push(p);
      }
    }
  }
  return seen;
}

/** Every descendant of `id` (excluding itself) along solid prerequisite edges. */
export function descendantsOf(id: string, edges: ConceptEdge[]): Set<string> {
  const fwd: Record<string, string[]> = {};
  for (const [a, b, dashed] of edges) {
    if (!dashed) (fwd[a] = fwd[a] ?? []).push(b);
  }
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const d of fwd[cur] ?? []) {
      if (!seen.has(d)) {
        seen.add(d);
        stack.push(d);
      }
    }
  }
  return seen;
}

// ---- live mastery state ----------------------------------------------------
// The app holds one `Record<node id, ProgressState>`; every surface reads it
// and every phase writes it back. Frontier and locking are derived, never set.

export type StateMap = Record<string, ProgressState>;

export function initialStates(graph: ConceptGraph): StateMap {
  return Object.fromEntries(graph.nodes.map((n) => [n.id, n.state]));
}

/** A prerequisite is met once the node has been learned at least once. */
function isLearned(state: ProgressState | undefined): boolean {
  return state === "learning" || state === "shaky" || state === "mastered";
}

/** Solid prerequisite edges into each node (dashed gap edges don't lock). */
function prereqMap(edges: ConceptEdge[]): Record<string, string[]> {
  const prereqs: Record<string, string[]> = {};
  for (const [from, to, dashed] of edges) {
    if (!dashed) (prereqs[to] = prereqs[to] ?? []).push(from);
  }
  return prereqs;
}

/**
 * What each node shows on the map: stored progress, except that an `unknown`
 * node with every prerequisite learned lights up as `frontier` (the ZPD).
 * A node left `unknown` here is locked by definition.
 */
export function displayStates(
  states: StateMap,
  graph: ConceptGraph,
): Record<string, NodeState> {
  const prereqs = prereqMap(graph.edges);
  const out: Record<string, NodeState> = {};
  for (const node of graph.nodes) {
    const state = states[node.id] ?? "unknown";
    // Gap nodes never join the frontier — they hang off their parent via a
    // dashed edge and are entered from its detail rail, not unlocked.
    out[node.id] =
      state === "unknown" &&
      !node.gap &&
      (prereqs[node.id] ?? []).every((p) => isLearned(states[p]))
        ? "frontier"
        : state;
  }
  return out;
}

/**
 * Why a node is locked: its unlearned ancestors (plus the node itself),
 * i.e. the "learn these first" path highlighted on the map.
 */
export function unmetPathOf(
  id: string,
  states: StateMap,
  graph: ConceptGraph,
): Set<string> {
  const path = new Set<string>();
  for (const anc of ancestorsOf(id, graph.edges)) {
    if (anc === id || !isLearned(states[anc])) path.add(anc);
  }
  return path;
}

// ---- Phase 1 · Plan (the re-planning behavior of the map) ------------------
// Not a screen: the map continuously reorders to the goal, warns about pace,
// prunes diagnosed-known material, and spawns gap sub-nodes from failures.
// The only recurring UI is the "Map updated" toast when it restructures.

/** Goal-conditioned frontier ordering: which lit node to attack, and why. */
export interface PlanEntry {
  node: ConceptNode;
  /** How many not-yet-learned concepts this node transitively unlocks. */
  unlocks: number;
}

export const GOAL_ORDER_CAPTION: Record<GoalKind, string> = {
  exam: "ordered to your exam — highest leverage first",
  project: "ordered to your build — unlocks the tools first",
  mastery: "foundations first — depth over speed",
};

const GOAL_ORDER_CAPTION_PT: Record<GoalKind, string> = {
  exam: "ordenado para sua prova — maior alavancagem primeiro",
  project: "ordenado para sua construção — desbloqueia as ferramentas primeiro",
  mastery: "fundamentos primeiro — profundidade antes de velocidade",
};

/** Language-aware plan-ordering caption. */
export function goalOrderCaption(goal: GoalKind, lang: Language = "en"): string {
  return (lang === "pt-BR" ? GOAL_ORDER_CAPTION_PT : GOAL_ORDER_CAPTION)[goal];
}

/**
 * The plan itself: frontier nodes ordered to the goal. A deadline-driven
 * goal attacks the nodes that unlock the most remaining territory; general
 * mastery walks foundations-to-frontier.
 */
export function orderedFrontier(
  display: Record<string, NodeState>,
  graph: ConceptGraph,
  goal: GoalKind,
): PlanEntry[] {
  const entries: PlanEntry[] = graph.nodes
    .filter((n) => display[n.id] === "frontier")
    .map((node) => ({
      node,
      unlocks: [...descendantsOf(node.id, graph.edges)].filter((d) => {
        const s = display[d];
        return s === "unknown" || s === "frontier";
      }).length,
    }));
  entries.sort((a, b) =>
    goal === "mastery"
      ? a.node.x - b.node.x
      : b.unlocks - a.unlocks || a.node.x - b.node.x,
  );
  return entries;
}

/** Rough minutes of focused work to take one concept through the spiral.
 *  ponytail: constant until real session-length analytics exist (#23). */
export const NODE_MINUTES = 35;

/** Whole days from now until an ISO date (YYYY-MM-DD), floor 0; NaN-safe. */
export function daysUntil(dateISO: string, now: Date = new Date()): number {
  const target = Date.parse(dateISO);
  if (Number.isNaN(target)) return 0;
  return Math.max(
    0,
    Math.ceil((target - Date.parse(localDay(now))) / 86_400_000),
  );
}

export interface PaceStatus {
  /** Non-gap concepts not yet mastered. */
  remaining: number;
  daysLeft: number;
  /** Minutes/day the remaining territory demands before the deadline. */
  neededPerDay: number;
  /** The learner's daily target from onboarding. */
  targetPerDay: number;
  onTrack: boolean;
}

/** Pace against the real deadline (#23) — daysLeft comes from the learner's
 *  actual exam date; no date, no countdown. */
export function paceStatus(
  states: StateMap,
  graph: ConceptGraph,
  targetPerDay: number,
  daysLeft: number,
): PaceStatus {
  const remaining = graph.nodes.filter(
    (n) => !n.gap && states[n.id] !== "mastered",
  ).length;
  const neededPerDay = Math.ceil((remaining * NODE_MINUTES) / Math.max(1, daysLeft));
  return {
    remaining,
    daysLeft,
    neededPerDay,
    targetPerDay,
    onTrack: neededPerDay <= targetPerDay,
  };
}

/** A sub-concept the re-planner can spawn under a node when it keeps failing. */
export interface GapSpec {
  id: string;
  label: string;
  /** Why the AI split it out — quoted in the "Map updated" toast. */
  reason: string;
  /** Placement offset from the parent node. */
  dx: number;
  dy: number;
}

/** Nodes spawned mid-map belong to the current (post-replay) week. */
const SPAWN_WEEK = 4;

/**
 * The restructure itself: a new red gap node hung under its parent by a
 * dashed edge. Idempotent — an already-spawned spec returns the graph as-is.
 */
export function spawnGap(
  graph: ConceptGraph,
  parentId: string,
  spec: GapSpec,
): ConceptGraph {
  const parent = graph.nodes.find((n) => n.id === parentId);
  if (!parent || graph.nodes.some((n) => n.id === spec.id)) return graph;
  const node: ConceptNode = {
    id: spec.id,
    label: spec.label,
    state: "gap",
    g: parent.g,
    week: SPAWN_WEEK,
    x: parent.x + spec.dx,
    y: parent.y + spec.dy,
    gap: true,
  };
  return {
    nodes: [...graph.nodes, node],
    edges: [...graph.edges, [parentId, spec.id, true]],
  };
}

/**
 * Remove a node and every edge touching it. The Crucible calls this to close
 * its first-attempt gap once the re-attempt finally transfers — the diagnosed
 * sub-node is resolved, so it leaves the map.
 */
export function removeNode(graph: ConceptGraph, id: string): ConceptGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter(([from, to]) => from !== id && to !== id),
  };
}
