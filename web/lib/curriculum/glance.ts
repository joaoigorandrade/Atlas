// "Just want to know": the quick mode of the welcome screen. A 1-3 node map
// (`mapNodeBounds`), no placement, no overnight hold, and every node on the
// same short ladder whatever its kind — read it, see how to explain it, use it
// once, keep it.

import { goals, type GoalKind } from "./calibration";
import type { Language } from "@/lib/i18n";
import type { PhaseId } from "./phases";
import type { MapNode } from "./types";

export const GLANCE_PLAN: readonly PhaseId[] = [
  "consume",
  "explain",
  "perform",
  "retain",
];

/** Stamped by the map build over `resolvePlan`, so it is frozen on the node
 *  like any plan. Every other goal keeps the plan its axes resolved to. */
export function withGoalPlan<T extends Pick<MapNode, "phasePlan">>(
  nodes: T[],
  goal: GoalKind,
): T[] {
  return goal === "glance" ? nodes.map((n) => ({ ...n, phasePlan: GLANCE_PLAN })) : nodes;
}

/** The quick look's name. Exported so `tests/i18nCoverage.test.ts` holds both. */
export const GLANCE_NAME = {
  en: "Just want to know",
  "pt-BR": "Só quero saber",
} as const;

/** Every goal's name, the quick look included — `goals()` lists only mastery's. */
export function goalName(goal: string, lang: Language): string | undefined {
  return goal === "glance"
    ? GLANCE_NAME[lang]
    : goals(lang).find(([g]) => g === goal)?.[1];
}
