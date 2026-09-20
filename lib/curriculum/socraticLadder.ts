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
