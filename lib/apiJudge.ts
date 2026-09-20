// Grading: the uncacheable half of the content API.
//
// Split from `api.ts` because the two halves answer different questions. A
// content client asks for a payload that is addressed, shared and cached; a
// judge client sends one learner's own words and can never be cached at all.
// They also fail differently — a judge call is the one place a partial frame
// is rendered while the verdict is still being written.

import { fetchStream } from "./api";
import { AtlasError } from "./errors";
import type { Language } from "./i18n";

/**
 * A judge call, verdict-first.
 *
 * The server writes the verdict as its own tiny JSON object and the critique
 * as a second one, so `onVerdict` fires roughly a second in — that is the
 * moment the screen can move — and the promise resolves with the complete
 * judgement when the prose lands.
 *
 * `onVerdict` may fire once (the usual streamed case) or never (the single-shot
 * fallback, where the first frame already carries everything). Callers must
 * therefore treat it as an optimisation and still handle the whole judgement
 * on resolve — `applied` flags in AtlasApp are exactly that.
 *
 * `onDraft` is the same deal one level finer: the critique as it is typed, so
 * the bubble the verdict opened fills in word by word instead of swapping from
 * dots to a finished paragraph. It carries `response` and nothing else — a
 * half-written verdict would be a different classification than the one the
 * model settles on, and the verdict is what drives mastery writes.
 */
async function judge<T>(
  body: Record<string, unknown>,
  onVerdict?: (partial: Partial<T>) => void,
  onDraft?: (draft: Partial<T>) => void,
): Promise<T> {
  let seen = 0;
  let last: T | null = null;
  const frames = await fetchStream(body, (frame) => {
    if (frame.p !== "judgement") return;
    if (frame.partial) {
      onDraft?.(frame.v as Partial<T>);
      return;
    }
    // Only the first complete frame is the verdict prefix. Which frame is
    // *last* isn't knowable until the stream ends, so the resolved value comes
    // from the collected frames below rather than from this callback.
    if (seen++ === 0) onVerdict?.(frame.v as Partial<T>);
  });
  for (const frame of frames)
    if (frame.p === "judgement" && !frame.partial) last = frame.v as T;
  if (!last) throw new AtlasError("upstream", "the judge returned nothing");
  return last;
}

export interface SocraticJudgement {
  quality: "correct" | "partial" | "near" | "wrong" | "lost";
  response: string;
  /** Which of the step's `sufficient` pieces everything said so far covers. */
  covered?: number[];
  /** The wrong idea in a few words, on a caught "near"/"wrong" — filed into the
   *  run's misconception roll-up so a repeat can be named as one. */
  misconception?: string;
}

export function fetchJudgeSocratic(
  params: {
    topic: string;
    nodeLabel: string;
    question: string;
    reference: string;
    answer: string;
    history?: Array<{ role: "ai" | "learner"; text: string }>;
    attempt?: number;
    misconceptions?: Array<{ label: string; quality: string }>;
    /** What this learner keeps getting wrong run-wide (`recurringMisconceptions`). */
    recurring?: string[];
    help?: number;
    /** This probe's own bar, when the pass wrote one. */
    sufficient?: string[];
    /** Everything already said on this step — the verdict grades the union. */
    said?: string[];
    language?: Language;
  },
  onVerdict?: (partial: Partial<SocraticJudgement>) => void,
  onDraft?: (draft: Partial<SocraticJudgement>) => void,
): Promise<SocraticJudgement> {
  return judge({ kind: "judge", mode: "socratic", ...params }, onVerdict, onDraft);
}

/** One ruling per position, plus the written read. The gate reads the two
 *  rulings independently — see `steelmanPassed`. */
export interface SteelmanJudgement {
  verdicts: Array<{
    positionId: string;
    verdict: "strong" | "thin" | "strawman";
    quote?: string;
  }>;
  response: string;
}

/** One spoken turn's ruling. `thin` is the important one: understood, and the
 *  target form was routed around. */
export interface ProduceJudgement {
  verdict: "good" | "thin" | "wrong";
  read: string;
}

export interface FeynmanJudgement {
  /** One ruling per rubric row, by index — `quote` carries the learner's own
   *  words on a gap, so the map can say them back. */
  verdicts: Array<{
    i: number;
    verdict: "good" | "skipped" | "confused";
    quote?: string;
  }>;
  response: string;
  /** Terms they used but never unpacked. */
  jargon: string[];
}

export function fetchJudgeFeynman(
  params: {
    topic: string;
    nodeLabel: string;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<FeynmanJudgement>) => void,
  onDraft?: (draft: Partial<FeynmanJudgement>) => void,
): Promise<FeynmanJudgement> {
  return judge({ kind: "judge", mode: "feynman", ...params }, onVerdict, onDraft);
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

export function fetchJudgeCrucible(
  params: {
    topic: string;
    nodeLabel: string;
    problem: string;
    hint: string;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<CrucibleJudgement>) => void,
): Promise<CrucibleJudgement> {
  return judge({ kind: "judge", mode: "crucible", ...params }, onVerdict);
}

/** Grades a cold retrieval against its rubric. Shares the Feynman judgement
 *  shape — one ruling per row — because a rubric diff renders the same way
 *  wherever it comes from; the grading behind it is Recall's own. */
export function fetchJudgeRecall(
  params: {
    topic: string;
    nodeLabel: string;
    brief: string;
    cued?: boolean;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<FeynmanJudgement>) => void,
): Promise<FeynmanJudgement> {
  return judge({ kind: "judge", mode: "recall", ...params }, onVerdict);
}

/** Checks a run against the case it was carried out on. */
export function fetchJudgePerform(
  params: {
    topic: string;
    nodeLabel: string;
    task: string;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<FeynmanJudgement>) => void,
): Promise<FeynmanJudgement> {
  return judge({ kind: "judge", mode: "perform", ...params }, onVerdict);
}

/** Rules BOTH cases of a contested question in one call — the phase's standard
 *  is that the weaker side is measured the same way as the stronger one, and a
 *  judge shown both at once can actually apply it. `answer` is the
 *  disconfirmer. */
export function fetchJudgeSteelman(
  params: {
    topic: string;
    nodeLabel: string;
    question: string;
    positions: Array<{ id: string; label: string; heldBy: string; mustCover: string[] }>;
    cases: Record<string, string>;
    holds: string;
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<SteelmanJudgement>) => void,
): Promise<SteelmanJudgement> {
  return judge({ kind: "judge", mode: "steelman", ...params }, onVerdict);
}

/** Rules one spoken turn: understood, understood-but-avoided, or not landed.
 *  `answer` is the transcript — no audio ever leaves the browser. */
export function fetchJudgeProduce(
  params: {
    topic: string;
    nodeLabel: string;
    scene: string;
    cue: string;
    targetForms: string[];
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<ProduceJudgement>) => void,
): Promise<ProduceJudgement> {
  return judge({ kind: "judge", mode: "produce", ...params }, onVerdict);
}

/** Maps a free-text answer onto a closed option list (the open-ended half of
 *  placement, the Consume hook, and the Feynman fix pass). */
export interface ChoiceJudgement {
  index: number;
  response: string;
}

export function fetchJudgeChoice(
  params: {
    topic: string;
    nodeLabel?: string;
    question: string;
    options: string[];
    answer: string;
    language?: Language;
  },
  onVerdict?: (partial: Partial<ChoiceJudgement>) => void,
): Promise<ChoiceJudgement> {
  return judge({ kind: "judge", mode: "choice", ...params }, onVerdict);
}
