// ---- Phase 2 · Consume (the Learn view) ------------------------------------
// The segmented, dual-coded reading content for a Consume session. Each
// node's sections are generated on entry (kind "consume").
//
// Consume is the *reading* phase: the material is the point. Sections carry
// several paragraphs of real explanation plus a worked example, all shown on
// arrival — nothing is held hostage behind a question. The only question in a
// section is the comprehension check that closes it; retrieval practice proper
// belongs to Socratic, Feynman and Crucible.
import { Language } from "@/lib/i18n";

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

/** How many sections a reading pass may run to. The prompt picks from a
 *  narrower band (2-5) — this is the validator's bound, with the usual slack
 *  above it, since a pass that wrote six genuinely distinct sections is not
 *  worth rejecting. `Job.shape` mirrors this, never the prompt's band. */
export const CONSUME_SECTION_BOUNDS = { min: 2, max: 6 } as const;

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
   *
   * Optional for that same reason: the shape forbids inventing a work, so the
   * model needs a legal way to abstain. A required string left the model no
   * choice but to name something for every section — the "Further reading"
   * line is simply not rendered when it declines.
   */
  cite?: string;
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
export function readingProgress(p: ConsumeProgress): {
  read: number;
  total: number;
} {
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
