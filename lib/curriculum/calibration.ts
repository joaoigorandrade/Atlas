// ---- Calibration / Metacognition (§12) — the "learn to learn" edge ---------
// The learner doesn't just learn the material — they learn *what they actually
// know*. Confidence is captured cheaply everywhere (the Consume hook, the
// tap before every Crucible problem and every review-card flip), then held
// against first-try performance. Overconfidence — felt solid, failed — is the
// thing this surface exists to catch, because that gap is fluency masquerading
// as mastery. Content ships the design's sample confidence-vs-performance set so
// the curve → per-node breakdown → "jump to its Crucible" loop is real.
import { CONNECT_COLOR } from "./connect";
import { planGates, type PhaseId } from "./phases";
import { ConceptEdge, NodeState, ProgressState, STATE_COLOR, ShakyReason } from "./types";
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
 * The mastery state a node's *record of finished phases* implies.
 *
 * This is the inversion. State used to be the input and phase the derived
 * value, which is why the ladder had to be the same six rungs for every node
 * and why `mastered` was reachable only by passing Crucible. Now the node
 * stores what was done and state falls out of it, so a four-phase plan with no
 * Crucible in it reaches `mastered` the same way an eight-phase one does.
 *
 * `frontier` is not produced here and never stored — it stays derived from
 * prerequisites by `displayStates`. A node with nothing done is `unknown`,
 * which is what displays as frontier once its prereqs are met.
 */
export function stateFromPlan(
  plan: readonly PhaseId[],
  done: readonly PhaseId[] = [],
  opts: {
    /** How the last gate failed, if it did. Keeps a finished plan Shaky. */
    shaky?: ShakyReason;
    /** Work that has begun but finished no phase — a part-read Consume pass.
     *  Without it a learner who read two sections and left would drop back to
     *  displaying as frontier, and that progress is real. */
    started?: boolean;
  } = {},
): ProgressState {
  // Retain is the one rung mastery does not wait on. It is not something the
  // learner *does* in a session — it is weeks of review history — so a node
  // goes green when the last real gate closes and only then starts earning
  // Retained ✓. Requiring it here would mean no node was ever mastered until
  // it had been reviewed, which is not what green has meant.
  if (planGates(plan).every((p) => done.includes(p)))
    return opts.shaky ? "shaky" : "mastered";
  if (opts.shaky) return "shaky";
  return done.length || opts.started ? "learning" : "unknown";
}

/**
 * Which phase of its own plan a node is on — an index into `plan`, `-1` when
 * locked, and `plan.length` when the spiral is closed. That past-the-end value
 * is load-bearing: `NodeHoverCard` tests for it to say "nothing left to do".
 *
 * Mastered alone doesn't grant Retained ✓ — `reviewed` (real review history: a
 * card for this node graded good or better) is what completes the spiral (#13),
 * so a `mastered` node that has never been reviewed sits *on* the last rung
 * rather than past it.
 */
export function phaseIndex(
  plan: readonly PhaseId[],
  done: readonly PhaseId[] = [],
  state?: NodeState,
  reviewed = false,
): number {
  if (state === "unknown" || state === "gap") return -1;
  // Retain is finished by review history, not by a session, so `reviewed` is
  // what ticks that rung off. Everything else is ticked off by having been done.
  const next = plan.findIndex((p) => !(p === "retain" ? reviewed : done.includes(p)));
  return next >= 0 ? next : plan.length;
}

/**
 * The phase a node's primary CTA opens — and therefore the one it must name.
 * Label and action both read this, or the button promises a phase it doesn't
 * open, which is what a fixed per-state label ("Continue · Feynman") did the
 * moment plans stopped being one shared six-tuple.
 *
 * `undefined` means nothing is left to open and the CTA is the review queue.
 * Shaky is the exception to "first unfinished phase": every shaky line says
 * re-attempt the Crucible, so a full ledger re-opens the plan's last gate.
 */
export function primaryPhase(
  plan: readonly PhaseId[],
  done: readonly PhaseId[] = [],
  state?: NodeState,
): PhaseId | undefined {
  const next = plan.find((p) => p !== "retain" && !done.includes(p));
  if (next) return next;
  return state === "shaky" ? planGates(plan).at(-1) : undefined;
}

// `readingPhaseIndex` is gone. It existed to correct a *state*-derived index
// with the reading record — state alone said Feynman on the strength of two
// sections read, so the reading pass had to argue its way back to Consume.
// With the plan-derived index there is nothing to correct: Consume enters
// `phasesDone` when the pass finishes, so a part-read node's first unfinished
// phase already *is* Consume. The one thing the reading record still decides is
// whether a node with nothing finished looks started, which is
// `stateFromPlan`'s `started` option.

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
