// The goal's date, named after the goal (W4.5).

import type { GoalKind } from "./calibration";
import type { Language } from "@/lib/i18n";

/** Every goal can have a date (W4.5) — a trip, a class, a talk, not only an
 *  exam — and it is named after the goal. The `*In` lines are the map's
 *  countdown. Exported so `tests/i18nCoverage.test.ts` holds both halves. */
export const GOAL_DATE_COPY = {
  en: {
    exam: "Exam date",
    project: "Deadline",
    mastery: "Target date",
    pareto: "When you need it",
    examIn: (days: number) => `Final exam · ${days} days`,
    projectIn: (days: number) => `Deadline · ${days} days`,
    masteryIn: (days: number) => `Target date · ${days} days`,
    paretoIn: (days: number) => `Your date · ${days} days`,
  },
  "pt-BR": {
    exam: "Data da prova",
    project: "Prazo",
    mastery: "Data-alvo",
    pareto: "Quando você precisa",
    examIn: (days: number) => `Prova final · ${days} dias`,
    projectIn: (days: number) => `Prazo · ${days} dias`,
    masteryIn: (days: number) => `Data-alvo · ${days} dias`,
    paretoIn: (days: number) => `Sua data · ${days} dias`,
  },
} as const;

export function goalDateLabel(goal: GoalKind, lang: Language = "en"): string {
  return GOAL_DATE_COPY[lang][goal];
}

export function goalCountdown(
  goal: GoalKind,
  days: number,
  lang: Language = "en",
): string {
  return GOAL_DATE_COPY[lang][`${goal}In`](days);
}
