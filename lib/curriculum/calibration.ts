// ---- Calibration / Metacognition (§12) — the "learn to learn" edge ---------
// The learner doesn't just learn the material — they learn *what they actually
// know*. Confidence is captured cheaply everywhere (the Consume hook, the
// tap before every Crucible problem and every review-card flip), then held
// against first-try performance. Overconfidence — felt solid, failed — is the
// thing this surface exists to catch, because that gap is fluency masquerading
// as mastery. Content ships the design's sample confidence-vs-performance set so
// the curve → per-node breakdown → "jump to its Crucible" loop is real.
import { CONNECT_COLOR } from "./connect";
import { ConsumeProgress } from "./consume";
import { GapSpec, StateMap } from "./replan";
import { ConceptEdge, NodeState, STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

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
  return items.filter((d) => d.verdict === "over").sort((a, b) => b.diff - a.diff)[0];
}

/** The most underconfident reading (largest real-over-felt gap), if any. */
export function calibWorstUnder(items: CalibItem[]): CalibItem | undefined {
  return items.filter((d) => d.verdict === "under").sort((a, b) => a.diff - b.diff)[0];
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
        .join(
          ", ",
        )} — esses pareciam mais claros do que se mostraram sob um problema novo.`;
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

export type GoalKind = "exam" | "project" | "mastery" | "pareto";

export const GOALS: ReadonlyArray<[GoalKind, string]> = [
  ["exam", "Pass an exam"],
  ["project", "Build a project"],
  ["mastery", "General mastery"],
  ["pareto", "Pareto (80/20)"],
];

const GOALS_PT: ReadonlyArray<[GoalKind, string]> = [
  ["exam", "Passar em uma prova"],
  ["project", "Construir um projeto"],
  ["mastery", "Domínio geral"],
  ["pareto", "Pareto (80/20)"],
];

/** Language-aware onboarding goal options. */
export function goals(lang: Language = "en"): ReadonlyArray<[GoalKind, string]> {
  return lang === "pt-BR" ? GOALS_PT : GOALS;
}

export const DAILY_TARGETS = [10, 15, 20, 30] as const;

/** How much of the topic a Pareto map covers: the share of real-world results
 *  the learner wants, which the map prompt turns into a concept count. */
export const PARETO_LEVELS = [20, 50, 80] as const;
export const PARETO_DEFAULT = 20;

export interface OnboardingForm {
  topic: string;
  goal: GoalKind;
  interests: string;
  target: number;
  /** ISO date (YYYY-MM-DD) of the exam when goal is "exam"; "" = not set —
   *  pace then shows no countdown instead of a fabricated one (#23). */
  examDate: string;
  /** Coverage share when goal is "pareto"; absent = PARETO_DEFAULT (also what
   *  every pre-Pareto saved run has). */
  paretoPct?: number;
}

export const DEFAULT_FORM: OnboardingForm = {
  // Empty on purpose: a pre-filled topic makes `build()`'s empty-topic guard
  // unreachable and lets a distracted learner build somebody else's map.
  topic: "",
  goal: "exam",
  interests: "",
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
