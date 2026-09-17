// Placement: the probe a learner answers before the map opens, and what a
// graded answer writes back to it.
//
// Split from `calibration.ts` because placement and calibration are different
// questions asked at different times. Calibration is "did what you FELT match
// what you DID", measured across a whole run; placement is "what do you
// already know", measured once, before there is any run to measure. They
// shared a file only because both were written the same week.

import { checkNumeric, checkOrder, checkText } from "./answerCheck";
// `ancestorsOf` stays in `calibration.ts`: it is graph reachability, used by
// more than placement.
import { ancestorsOf } from "./calibration";
import type { GapSpec, StateMap } from "./replan";
import type { ConceptEdge } from "./types";

export type DiagnosticEffect = "mastered" | "shaky";

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
export const DIAGNOSTIC_KINDS = ["mcq", "compute", "speak", "order"] as const;
export type DiagnosticKind = (typeof DIAGNOSTIC_KINDS)[number];

/** Lenient, like `asNodeKind` and `asDomain`: anything unrecognised is the
 *  four-option question every placement asked before this existed. */
export function asDiagnosticKind(raw: unknown): DiagnosticKind {
  return (DIAGNOSTIC_KINDS as readonly string[]).includes(raw as string)
    ? (raw as DiagnosticKind)
    : "mcq";
}

export interface DiagnosticQuestion {
  tag: string;
  q: string;
  note: string;
  nodeId: string;
  difficulty: DiagnosticDifficulty;
  /** How it is answered, which the domain decides. A four-option question
   *  measures RECOGNITION: the right instrument for a general topic and the
   *  wrong one everywhere else. It cannot tell whether a learner can
   *  row-reduce, and for a language it measures the one axis learners are most
   *  often mis-placed on, recognising a word they could never produce. Absent
   *  on a question written before the domain axis, and read as `mcq`. */
  type?: DiagnosticKind;
  /** `mcq`: the four options. `order`: the items to arrange, shuffled. Empty
   *  for `compute` and `speak`, which are answered rather than chosen. */
  opts: DiagnosticOption[];
  /** `mcq` only. -1 where the kind has nothing to pick. */
  correctIndex: number;
  /** `compute`: the one correct value. `speak`: every utterance that counts as
   *  right. `order`: the option labels in their correct sequence. */
  expected?: string[];
  gap?: GapSpec;
}

/**
 * Did the learner get it right?
 *
 * One entry point for all four kinds, so nothing downstream (`diagnosticEffect`,
 * the gap spawn, the difficulty staircase) has to know which kind it graded.
 * An answer of the wrong shape for its kind is simply wrong, never a throw.
 *
 * All four grade LOCALLY, deliberately: the diagnostic sits on the onboarding
 * path, where a per-answer round trip to a model would BE the experience.
 */
/** How an answer arrives, whichever kind asked for it. */
export type DiagnosticAnswer = number | string | readonly string[];

export function gradeDiagnostic(
  q: DiagnosticQuestion,
  answer: DiagnosticAnswer,
): boolean {
  switch (q.type ?? "mcq") {
    case "mcq":
      return typeof answer === "number" && answer === q.correctIndex;
    case "compute":
      return typeof answer === "string" && checkNumeric(answer, q.expected?.[0] ?? "");
    case "speak":
      return typeof answer === "string" && checkText(answer, q.expected ?? []);
    case "order":
      return Array.isArray(answer) && checkOrder(answer, q.expected ?? []);
  }
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
 * placement (or null before any correct answer) — the running evidence of
 * ability the "luck" call leans on.
 *
 * A miss on a question *strictly easier* than that evidence reads as a slip,
 * not a gap (the ENEM read: acing hard questions then fumbling an easy one is
 * noise) — it's discounted to the same effect a correct answer would give,
 * and spawns no gap node. Strictly easier, not "no harder": one right and one
 * wrong at the same level is a coin flip, not proof of mastery, and the write
 * it triggers (prune the whole prerequisite chain) is not recoverable.
 */
export function diagnosticEffect(
  difficulty: DiagnosticDifficulty,
  correct: boolean,
  maxCorrectDifficulty: DiagnosticDifficulty | null,
): DiagnosticEffect {
  if (correct) return "mastered";
  const rank = (d: DiagnosticDifficulty) => DIAGNOSTIC_DIFFICULTIES.indexOf(d);
  const isLuckMiss =
    maxCorrectDifficulty !== null && rank(difficulty) < rank(maxCorrectDifficulty);
  return isLuckMiss ? "mastered" : "shaky";
}

/**
 * The mastery write a graded placement answer makes.
 *
 * A correct answer (or a discounted slip) prunes the concept *and its whole
 * prerequisite chain* — knowing something is evidence for everything it stands
 * on. A genuine miss touches only the concept itself: the chain below a missed
 * concept is the likeliest place the reason for the miss is hiding, and
 * pruning it would hide it for good.
 */
export function applyDiagnosticEffect(
  states: StateMap,
  effect: DiagnosticEffect,
  nodeId: string,
  edges: ConceptEdge[],
): StateMap {
  const next = { ...states };
  if (effect === "mastered")
    for (const id of ancestorsOf(nodeId, edges)) next[id] = "mastered";
  else next[nodeId] = "shaky";
  return next;
}
