// ---- Phase 3a · the scaffolding ladder -------------------------------------
// How much help the tutor is giving, what moves it, and what each rung earns.
//
// This used to be a dial: a preference the learner set, which coloured a
// prompt and nothing else. It is now the mechanism the phase runs on. A step
// opens at the learner's floor and descends a rung every time a turn adds
// nothing; the bottom rung teaches outright and closes the step. So the rung
// is both the tutor's current posture *and* the record of how much help the
// step took — which is why the session no longer carries a separate
// "was this step assisted" flag for the same fact.
import { STATE_COLOR } from "./types";
import type { SocraticSession, SocraticStep } from "./socratic";
import { Language } from "@/lib/i18n";

/** The ladder, least help → most. A step's live rung, and the floor the
 *  learner sets by hand. */
export const HELP_LABELS = ["Silent", "Hint", "Guide", "Show me"] as const;
export type HelpLevel = 0 | 1 | 2 | 3;

const HELP_LABELS_PT = ["Silencioso", "Dica", "Guiar", "Mostre-me"] as const;

/** Language-aware ladder labels. */
export function helpLabels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? HELP_LABELS_PT : HELP_LABELS;
}

/** Warmer = more help. The ladder and its active cell read this. */
export const HELP_COLOR: Record<HelpLevel, string> = {
  0: STATE_COLOR.mastered, // Silent — the learner is carrying it
  1: STATE_COLOR.learning, // Hint
  2: STATE_COLOR.frontier, // Guide
  3: STATE_COLOR.shaky, // Show me — dropped to direct instruction
};

/** How true a reply is. `partial` is the one that earns its keep: everything
 *  said so far is right, it just isn't all of it yet. Thinking out loud across
 *  two turns is not a defect — at the top rung the tutor answers it with "is
 *  that the whole story?", which names nothing — so it banks what it added and
 *  costs nothing. Every other non-correct verdict descends the ladder. */
export type ReplyQuality = "correct" | "partial" | "near" | "wrong" | "lost";

/** How a finished step was resolved — earns the ending differently. */
export type StepResolution = "unaided" | "hint" | "told";

/** Clamp a help level into the ladder's range. */
export function clampHelp(n: number): HelpLevel {
  return Math.max(0, Math.min(3, n)) as HelpLevel;
}

/** What a step earns, from the rung it closed on: the top is unaided work, the
 *  middle two took a tutor naming something the learner had not said, the
 *  bottom was taught outright. Nothing else is consulted — a caught error
 *  already cost a rung getting here, so the rung is the whole record. */
export function resolutionFor(rung: HelpLevel): StepResolution {
  return rung === 0 ? "unaided" : rung === 3 ? "told" : "hint";
}

/** How far a verdict pushes the tutor down the ladder. `partial` holds the rung
 *  — an answer that added real ground is progress, not a failed attempt, and
 *  the tutor's reply to it at the top rung names nothing. `lost` skips a rung:
 *  hinting at an answer that isn't there yet is theatre. */
export const DESCENT: Record<ReplyQuality, number> = {
  correct: 0,
  partial: 0,
  near: 1,
  wrong: 1,
  lost: 2,
};

/** The descent a verdict actually earns. A `partial` is free only while it
 *  banks a piece: on a probe with a bar, one that adds nothing to the ledger is
 *  a turn that added nothing, and costs what `near` does. Without this the only
 *  thing bounding a step was the judge's honesty — a model that kept saying
 *  "partial" held the learner on one probe forever. */
export function descentFor(
  quality: ReplyQuality,
  before: number[],
  after: number[],
  bar: number,
): number {
  if (quality === "partial" && bar > 0 && after.length === before.length)
    return DESCENT.near;
  return DESCENT[quality];
}

/** Whether a streamed verdict prefix is enough to act on. Every quality is,
 *  except a `partial` on a probe with a bar that arrived without its ledger —
 *  `descentFor` needs to know what it banked, so that one waits for the full
 *  judgement rather than being charged a rung for a missing field. */
export function verdictReady(
  v: { quality?: ReplyQuality; covered?: number[] },
  bar: readonly string[] | undefined,
): boolean {
  if (!v.quality) return false;
  return !(v.quality === "partial" && !v.covered && bar?.length);
}

/** Merge the judge's coverage reading into the ledger. Union rather than
 *  replace: a ledger that ticks backwards reads as lost ground even when
 *  nothing was. */
export function bank(covered: number[], add?: number[]): number[] {
  if (!add?.length) return covered;
  const next = [...new Set([...covered, ...add])];
  return next.length === covered.length ? covered : next.sort((a, b) => a - b);
}

/** A pass saved before the ladder existed carries no floor, ledger or bar.
 *  Normalised here rather than at each reader because persistence is a JSON
 *  boundary: the type says the fields are there and the stored row simply has
 *  none, so nothing upstream fails — the view reads `session.bar.length` and
 *  the screen dies. Every restored pass reaches the view through this reducer,
 *  which makes this the one place that has to know. */
export function restored(
  session: SocraticSession,
  steps: SocraticStep[],
): SocraticSession {
  if (session.bar && session.covered && session.floor !== undefined) return session;
  return {
    ...session,
    floor: session.floor ?? 0,
    covered: session.covered ?? [],
    bar: session.bar ?? steps[session.step]?.sufficient ?? [],
    // Its `help` is not a rung and must not be read as one. In the old model
    // the dial rose across the *whole pass* and never reset per probe, so a
    // saved 3 says "this learner needed help somewhere", not "this probe has
    // been walked to the bottom" — and the bottom rung is terminal, which
    // would close their next answer as `told` on a probe nobody has helped
    // them with yet. What was spent on the step on screen is unknowable, so
    // it reopens at the floor; `resolutions` still carries the pass's history.
    help: session.floor ?? 0,
  };
}
