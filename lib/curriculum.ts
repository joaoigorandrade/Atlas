// The concept-map vocabulary, mastery-state machine, and the pure session
// engines (Socratic, Feynman, Connect, Crucible, Retain reducers).
// All *content* — the graph, the diagnostic, and every phase's material — is
// generated per topic by the AI through `/api/generate` (OpenRouter); this
// module holds only types, tokens, and logic. Nothing domain-specific lives
// here anymore.

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

// ---- Phase 2 · Consume (the Learn view) ------------------------------------
// The segmented, dual-coded reading content for a Consume session. Each
// node's chunks are generated on entry (kind "consume") so the
// predict → reveal → continue mechanic runs on real, topic-specific material.

/** The on-demand rewrite modalities offered under each revealed chunk. */
export type AltKey = "simpler" | "example" | "analogy" | "deeper";

export const ALT_CONTROLS: ReadonlyArray<[AltKey, string]> = [
  ["simpler", "Simpler"],
  ["example", "Example"],
  ["analogy", "Analogy"],
  ["deeper", "Go deeper"],
];

/** A key term pre-taught before the paragraph that first uses it. */
export interface ConsumeTerm {
  /** The term itself — shown on the pill and used as its inline key. */
  t: string;
  /** Its pre-taught definition, revealed inline on tap. */
  d: string;
}

export interface ConsumePrediction {
  q: string;
  opts: ReadonlyArray<{ label: string; correct: boolean }>;
}

export interface ConsumeChunk {
  id: string;
  /** Segment label, e.g. "1 · What it is". */
  kicker: string;
  terms: ConsumeTerm[];
  /** The desirable-difficulty guess posed before the explanation reveals. */
  pred: ConsumePrediction;
  /** Verdict copy after a right / wrong guess. */
  right: string;
  wrong: string;
  /** The explanation itself, revealed only after the learner guesses. */
  body: string;
  /** Source citation — trust is visible; no memorizing hallucinations. */
  cite: string;
  /** Caption for the auto-generated dual-coded diagram beside the prose. */
  diagram: string;
  /** The mini-Socratic aside opened from "ask about this passage". */
  ask: string;
  /** Adaptive-modality rewrites of this chunk, keyed by control. */
  alt: Record<AltKey, string>;
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
  /**
   * An optional scratchpad task. When present the reply panel stays locked
   * until the learner works on the pad and submits it — the AI then reacts to
   * what's written there, not just to chat text.
   */
  scratch?: {
    /** Instruction overlaid on the pad. */
    prompt: string;
    /** The AI's reaction to the pad — catches the common error it finds. */
    reaction: string;
  };
}

/** One line of the Socratic transcript. */
export interface SocraticTurn {
  role: "ai" | "learner";
  text: string;
  /** Present on AI probes: the Socratic move being made. */
  move?: SocraticMove;
  /** Colors the AI bubble: a caught error, an affirmation, or direct teaching. */
  tone?: "neutral" | "catch" | "affirm" | "teach";
}

/** The live state of one Socratic session — held by AtlasApp, read by the view. */
export interface SocraticSession {
  nodeId: string;
  step: number;
  help: HelpLevel;
  log: SocraticTurn[];
  /** Whether the current step's scratch task is submitted (true when it has none). */
  scratchDone: boolean;
  /** Reply labels already ruled out on this step (caught wrong / spent hints). */
  ruledOut: string[];
  /** The AI's latest reaction to the pad, shown beside the canvas. */
  padReaction: string | null;
  /** "Just tell me" uses — repeated use flags a prerequisite gap. */
  tells: number;
  done: boolean;
}

/** Clamp a help level into the dial's range. */
function clampHelp(n: number): HelpLevel {
  return Math.max(0, Math.min(3, n)) as HelpLevel;
}

/** Push a step's opening probe onto the log and reset the per-step gates. */
function openStep(
  session: SocraticSession,
  step: number,
  steps: SocraticStep[],
): SocraticSession {
  const s = steps[step];
  return {
    ...session,
    step,
    scratchDone: !s.scratch,
    ruledOut: [],
    padReaction: null,
    log: [...session.log, { role: "ai", text: s.prompt, move: s.move }],
  };
}

/** A fresh session, opened on its first probe. Starts mid-dial, at Hint. */
export function socraticStart(
  nodeId: string,
  steps: SocraticStep[],
): SocraticSession {
  const first = steps[0];
  return {
    nodeId,
    step: 0,
    help: 1,
    scratchDone: !first.scratch,
    ruledOut: [],
    padReaction: null,
    tells: 0,
    done: false,
    log: [{ role: "ai", text: first.prompt, move: first.move }],
  };
}

const REPLY_TONE: Record<ReplyQuality, SocraticTurn["tone"]> = {
  correct: "affirm",
  near: "neutral",
  wrong: "catch",
  lost: "teach",
};

export type SocraticAction =
  | { type: "reply"; index: number }
  | { type: "scratch" }
  | { type: "stuck" }
  | { type: "tell" };

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
): SocraticSession {
  if (session.done) return session;
  const step = steps[session.step];
  const last = session.step === steps.length - 1;

  const advance = (base: SocraticSession): SocraticSession =>
    last ? { ...base, done: true } : openStep(base, session.step + 1, steps);

  switch (action.type) {
    case "scratch": {
      if (!step.scratch || session.scratchDone) return session;
      return {
        ...session,
        scratchDone: true,
        padReaction: step.scratch.reaction,
        log: [
          ...session.log,
          { role: "learner", text: "✎ Worked it out on the scratchpad." },
          { role: "ai", text: step.scratch.reaction, tone: "catch" },
        ],
      };
    }
    case "stuck": {
      return {
        ...session,
        help: clampHelp(session.help + 1),
        ruledOut: [...session.ruledOut],
        log: [
          ...session.log,
          { role: "learner", text: "I'm stuck — more help." },
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
          { role: "learner", text: "Just tell me." },
          { role: "ai", text: step.tell, tone: "teach" },
        ],
      };
      return advance(base);
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
        return advance({ ...logged, help });
      }
      // near → hint and let them try again; wrong → caught, help rises. Both
      // rule the reply out so the learner converges instead of re-picking it.
      return {
        ...logged,
        help:
          reply.quality === "wrong"
            ? clampHelp(session.help + 1)
            : session.help,
        ruledOut: [...session.ruledOut, reply.label],
      };
    }
    default:
      return session;
  }
}

// ---- Phase 3b · Feynman (teach it back) -----------------------------------
// Gap detection through self-explanation. The learner teaches; the AI plays a
// naive student, interrupting with the questions that surface exactly what got
// hand-waved. The output is a Gap Report — a visual diff of the explanation,
// green/grey/red — and each unresolved gap writes back to the map as a red Gap
// sub-node, so the phase is the loop's connective tissue, not a checklist.
// Content ships the Linear Transformations teach-back so the speak → interrupt
// → diff mechanic is real.

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

/** One line of the teach-back transcript — the learner speaking, or the student. */
export interface TeachLine {
  role: "learner" | "ai";
  text: string;
  /** AI lines: a naive question, an affirmation, a caught error, a skipped bit. */
  tone?: "naive" | "affirm" | "catch" | "skip";
}

/** How the learner answers a naive interruption — each sets the beat's verdict. */
export interface TeachReply {
  label: string;
  verdict: TeachVerdict;
  /** The naive student's reaction — pleased, still puzzled, or wrong-footed. */
  response: string;
}

/** A single-probe corrective for a gap — the targeted Socratic micro-pass. */
export interface TeachFixReply {
  label: string;
  correct: boolean;
  response: string;
}

/** One beat of the explanation — a sub-point the learner teaches, then defends. */
export interface FeynmanBeat {
  id: string;
  /** The sub-point being taught — the Gap Report row label. */
  subPoint: string;
  /** The learner's spoken explanation, streamed in as a live transcript. */
  transcript: string;
  /** The naive student's interrupting question ("wait, why does that matter?"). */
  interjection: string;
  /** How the learner can answer it — each answer sets this beat's verdict. */
  replies: TeachReply[];
  /** The targeted Socratic micro-pass "Fix this" opens on just this sub-point. */
  fix: { probe: string; replies: TeachFixReply[] };
  /** The red Gap sub-node this beat writes back to the map when left unresolved. */
  gap: GapSpec;
}

/** The scaffold offered when the learner freezes — never a blank wall. */
export const FEYNMAN_SCAFFOLD =
  "No blank-wall panic. Start with the simplest thing: what problem does this concept actually solve? Teach me that first — the rest pulls itself out.";

/** The live state of one Feynman session — held by AtlasApp, read by the view. */
export interface FeynmanSession {
  nodeId: string;
  /** The beat currently being taught (index into the generated beats). */
  beat: number;
  /** True once teaching has begun (past the opening prompt). */
  started: boolean;
  /** Within the current beat: waiting for the learner to speak, or to answer. */
  awaiting: "speak" | "reply";
  /** The teach-back transcript + naive-student interruptions, in order. */
  log: TeachLine[];
  /** Verdict per beat id, set when its interruption is answered (or fixed). */
  verdicts: Record<string, TeachVerdict>;
  /** True once every beat is taught — the Gap Report shows. */
  reported: boolean;
  /** A Fix-this micro-pass open on this beat id, or null. */
  fixing: string | null;
  /** Fix replies already caught in the open micro-pass. */
  fixRuledOut: string[];
  /** The naive student's latest reaction inside an open fix, or null. */
  fixReaction: string | null;
  /** Whether the stuck-scaffold has been offered. */
  scaffolded: boolean;
}

export function feynmanStart(nodeId: string): FeynmanSession {
  return {
    nodeId,
    beat: 0,
    started: false,
    awaiting: "speak",
    log: [],
    verdicts: {},
    reported: false,
    fixing: null,
    fixRuledOut: [],
    fixReaction: null,
    scaffolded: false,
  };
}

/** The naive student's reaction tone, by the verdict the learner earned. */
const VERDICT_TONE: Record<TeachVerdict, TeachLine["tone"]> = {
  good: "affirm",
  skipped: "skip",
  confused: "catch",
};

export type FeynmanAction =
  | { type: "begin" }
  | { type: "scaffold" }
  | { type: "speak" }
  | { type: "reply"; index: number }
  | { type: "openFix"; beatId: string }
  | { type: "closeFix" }
  | { type: "fix"; index: number }
  | { type: "teachAgain" };

/**
 * The naive-student engine, as a pure transition. The learner speaks a beat →
 * the student interrupts with a naive question → the learner's answer sets that
 * beat's verdict (good/skipped/confused). After the last beat the Gap Report
 * opens; "Fix this" runs a one-probe corrective that flips a gap to good, and
 * "Teach again" resets for a fresh pass.
 */
export function feynmanReducer(
  session: FeynmanSession,
  action: FeynmanAction,
  beats: FeynmanBeat[],
): FeynmanSession {
  switch (action.type) {
    case "begin":
      // Leave the opening prompt and enter the teach-back surface, ready to
      // speak the first beat.
      return { ...session, started: true };
    case "scaffold":
      // The freeze-scaffold: reveal the "start with the problem" nudge and drop
      // the learner straight into teaching the first beat.
      return { ...session, started: true, scaffolded: true };
    case "speak": {
      if (session.reported || session.awaiting !== "speak") return session;
      const beat = beats[session.beat];
      if (!beat) return session;
      return {
        ...session,
        started: true,
        awaiting: "reply",
        log: [
          ...session.log,
          { role: "learner", text: beat.transcript },
          { role: "ai", text: beat.interjection, tone: "naive" },
        ],
      };
    }
    case "reply": {
      if (session.reported || session.awaiting !== "reply") return session;
      const beat = beats[session.beat];
      const reply = beat?.replies[action.index];
      if (!reply) return session;
      const last = session.beat === beats.length - 1;
      return {
        ...session,
        awaiting: "speak",
        beat: last ? session.beat : session.beat + 1,
        reported: last,
        verdicts: { ...session.verdicts, [beat.id]: reply.verdict },
        log: [
          ...session.log,
          { role: "learner", text: reply.label },
          { role: "ai", text: reply.response, tone: VERDICT_TONE[reply.verdict] },
        ],
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
        ...session,
        beat: 0,
        started: true,
        awaiting: "speak",
        log: [],
        verdicts: {},
        reported: false,
        fixing: null,
        fixRuledOut: [],
        fixReaction: null,
      };
    default:
      return session;
  }
}

/** Beats still red or grey — the gaps that write back to the map as sub-nodes. */
export function feynmanGaps(
  session: FeynmanSession,
  beats: FeynmanBeat[],
): GapSpec[] {
  return beats.filter(
    (b) =>
      session.verdicts[b.id] === "skipped" ||
      session.verdicts[b.id] === "confused",
  ).map((b) => b.gap);
}

/** A clean-enough diff: every sub-point explained well, nothing wrong or skipped. */
export function feynmanClean(
  session: FeynmanSession,
  beats: FeynmanBeat[],
): boolean {
  return beats.every((b) => session.verdicts[b.id] === "good");
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

/** Two real connections is plenty to move on (the design's advance gate). */
export function connectReady(session: ConnectSession): boolean {
  return connectLinkedCount(session) >= 2;
}

/** A card drafted from the Connect phase — raw material for the Retain queue. */
export interface ConnectCard {
  front: string;
  back: string;
  kind: "link" | "mnemonic";
}

/**
 * The cards this session drafts: one per confirmed link, plus the accepted
 * memory aid when the content is list-like. This is the "tedious step humans
 * skip," done automatically — the phase's write-back into Retain.
 */
export function connectCards(
  session: ConnectSession,
  content: ElaborationContent,
): ConnectCard[] {
  const cards: ConnectCard[] = content.cands
    .filter((c) => session.linked[c.id])
    .map((c) => ({
      front: `${content.centerLabel} ↔ ${c.label}: what’s the connection?`,
      back: (session.drafts[c.id] || c.rel).trim(),
      kind: "link" as const,
    }));
  if (
    content.encoding === "list-like" &&
    session.mnemonicAccepted &&
    session.mnemonicDraft.trim()
  ) {
    cards.push({
      front: `${content.centerLabel} · what’s the order of the steps?`,
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
    reExplain: false,
  };
}

export type CrucibleAction =
  | { type: "confidence"; level: ConfidenceLevel }
  | { type: "attempt"; value: string }
  | { type: "sample" }
  | { type: "submit" }
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
    case "submit":
      // An empty workspace isn't diagnostic; the caller nudges instead.
      if (session.submitted || !session.attempt.trim()) return session;
      return {
        ...session,
        submitted: true,
        outcome: session.rung === 0 ? "partial" : "pass",
      };
    case "toggleReExplain":
      return { ...session, reExplain: !session.reExplain };
    case "retry":
      // Recalibrate down one step and re-open the workspace — confidence is
      // re-read against the easier rung, so it clears back to unstated.
      return {
        ...session,
        stage: "work",
        conf: null,
        rung: 1,
        attempt: "",
        submitted: false,
        outcome: null,
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
export function crucibleCalib(session: CrucibleSession): string {
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

/** The pre-flip confidence tap — the calibration hook, least → most solid. */
export const REVIEW_CONFIDENCE = ["Blank", "Shaky", "Solid"] as const;
export type ReviewConfidence = 0 | 1 | 2;

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
  /** FSRS next-interval per grade — shown on the grade buttons. */
  fsrs: Record<ReviewGrade, string>;
  /** A card whose miss re-enters Phase 1 (writes its node Shaky). */
  fails?: boolean;
  /** The 30-second Socratic re-explanation shown when it's missed. */
  reExplain?: string;
}

/** Everything the Retain surface needs for one day's honest queue. */
export interface RetainContent {
  /** The daily target from onboarding — the queue budget, in minutes. */
  budgetMin: number;
  forecast: ForecastRow[];
  cards: ReviewCard[];
}

/** The micro-Socratic aside "Explain" opens on any revealed card. */
export const REVIEW_ASIDE =
  "A 30-second Socratic aside: don’t restate the answer — ask what forces it. Which earlier concept makes this true? Trace one concrete example through and watch where the rule takes it.";

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
): string {
  if (session.finished) return "Queue clear";
  const { left, total, doneCount } = retainBudget(session, content);
  return `~${left} min left · ${total - doneCount} cards`;
}

/**
 * The failure calibration read-back: the confidence tap held against the miss.
 * A "Solid" tap that then missed is the overconfidence Review exists to catch.
 */
export function retainCalib(session: RetainSession): string {
  if (session.stage !== "failed") return "";
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
}

/** Single-letter weekday label for a date (M T W T F S S). */
function weekdayLetter(d: Date): string {
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

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
  const due = content.forecast.find((f) => f.tone === "due");
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
export function streakStatus(state: AdherenceState): string {
  if (state.metToday)
    return `Today's in — the ${state.streak}-day streak holds. See you around ${state.usualTime}.`;
  if (state.freezes > 0)
    return `Miss today and a freeze absorbs it — the ${state.streak}-day streak survives, no reset.`;
  return `No freezes banked — clear today's queue to keep the ${state.streak}-day streak alive.`;
}

/** The reminder nudge copy — tuned to when the learner actually shows up, not dumped at midnight. */
export function reminderCopy(state: AdherenceState): string {
  return state.reminderOn
    ? `Nudge set for ~${state.usualTime} — when you usually show up, not midnight.`
    : `Reminders off — we'd nudge around ${state.usualTime}, your usual time.`;
}

// ---- Calibration / Metacognition (§12) — the "learn to learn" edge ---------
// The learner doesn't just learn the material — they learn *what they actually
// know*. Confidence is captured cheaply everywhere (predictions in Consume, the
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
export function calibCoach(items: CalibItem[]): string {
  const w = calibWorstOver(items);
  return w
    ? `Re-reading felt like learning on ${w.label} — you were ${w.felt}% sure, then transferred at just ${w.real}% on the first attempt. That’s fluency, not mastery.`
    : "Confidence and results are tracking closely — well-calibrated across the board.";
}

/** The per-topic read: the systematic tilt the live readings show, if any. */
export function calibTopicLine(items: CalibItem[]): string {
  const over = items.filter((d) => d.verdict === "over");
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
export function calibUnderLine(items: CalibItem[]): string {
  const w = calibWorstUnder(items);
  return w
    ? `You sell yourself short on ${w.label}: rated ${w.felt}%, delivered ${w.real}%. Trust it more — spend the time where the real gap is.`
    : "";
}

/** Which phase a node is on, given its mastery state (-1 = locked). */
export function phaseIndex(state: NodeState): number {
  switch (state) {
    case "frontier":
      return 0;
    case "learning":
      return 2;
    case "shaky":
      return 4;
    case "mastered":
      return 6;
    default:
      return -1;
  }
}

export type DiagnosticEffect = "mastered" | "shaky" | "none";

export interface DiagnosticOption {
  label: string;
  /**
   * What picking this option writes back: `mastered` prunes the target node
   * (and its whole prerequisite chain \u2014 diagnosed known); `shaky` marks the
   * node learned-but-fragile and can spawn its gap sub-node; `none` leaves it
   * unknown.
   */
  effect: DiagnosticEffect;
}

/**
 * One generated placement probe. `nodeId` names the concept the answer writes
 * back to; `gap` (optional) is the sub-concept a hesitant answer splits out
 * under it \u2014 the first live re-plan.
 */
export interface DiagnosticQuestion {
  tag: string;
  q: string;
  note: string;
  nodeId: string;
  opts: DiagnosticOption[];
  gap?: GapSpec;
}

export type GoalKind = "exam" | "project" | "mastery";

export const GOALS: ReadonlyArray<[GoalKind, string]> = [
  ["exam", "Pass an exam"],
  ["project", "Build a project"],
  ["mastery", "General mastery"],
];

export const DAILY_TARGETS = [10, 15, 20, 30] as const;

export interface OnboardingForm {
  topic: string;
  goal: GoalKind;
  interests: string;
  target: number;
}

export const DEFAULT_FORM: OnboardingForm = {
  topic: "Linear Algebra",
  goal: "exam",
  interests: "chess, investing",
  target: 15,
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

/** Days until the demo exam deadline (the left-rail countdown chip). */
export const EXAM_DAYS = 24;
/** Rough minutes of focused work to take one concept through the spiral. */
export const NODE_MINUTES = 35;

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

/** Pace against the deadline — the map's warning when it won't make it. */
export function paceStatus(
  states: StateMap,
  graph: ConceptGraph,
  targetPerDay: number,
): PaceStatus {
  const remaining = graph.nodes.filter(
    (n) => !n.gap && states[n.id] !== "mastered",
  ).length;
  const neededPerDay = Math.ceil((remaining * NODE_MINUTES) / EXAM_DAYS);
  return {
    remaining,
    daysLeft: EXAM_DAYS,
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
