// Phase 1 — Plan (SPEC §5). Planning isn't a screen; it's the map's
// re-planning behavior: ordering toward the goal, warning on pace against a
// deadline, and pruning material the diagnostic proved the learner owns.
// Everything here is a pure function of the shared StateMap — no state of its
// own — so the map re-plans live as mastery flows through it.

import {
  EDGES,
  NODES,
  ancestorsOf,
  type ConceptNode,
  type GoalKind,
  type StateMap,
} from "@/lib/curriculum";

/** Days to the demo exam — matches the "Final exam · 24 days" chip in the design. */
export const EXAM_DAYS = 24;
/** Focused minutes to carry one node through its full spiral to Mastered. */
const MIN_PER_NODE = 40;

/** A node counts as owned once it's been carried all the way to Mastered. */
function isMastered(states: StateMap, id: string): boolean {
  return states[id] === "mastered";
}

/**
 * The summit of the map: the deepest sink (a node nothing depends on, with the
 * largest prerequisite tree). For the Linear Algebra demo that's
 * Diagonalization — the concept goal-conditioned ordering steers toward.
 */
export function goalNode(): ConceptNode {
  const hasDependent = new Set(
    EDGES.filter(([, , dashed]) => !dashed).map(([from]) => from),
  );
  const sinks = NODES.filter((n) => !n.gap && !hasDependent.has(n.id));
  return sinks.reduce(
    (best, n) =>
      ancestorsOf(n.id, EDGES).size > ancestorsOf(best.id, EDGES).size
        ? n
        : best,
    sinks[0],
  );
}

/**
 * The critical path to the goal: every not-yet-mastered concept the learner
 * must still cross to reach the summit (goal included). This is the set
 * goal-conditioned ordering prioritizes and "prioritize path" highlights.
 */
export function criticalPathTo(goalId: string, states: StateMap): Set<string> {
  const path = new Set<string>();
  for (const id of ancestorsOf(goalId, EDGES)) {
    const node = NODES.find((n) => n.id === id);
    if (node && !node.gap && !isMastered(states, id)) path.add(id);
  }
  return path;
}

/** Unmastered concepts that don't feed the goal — the branches Plan can prune. */
export function offGoalNodes(goalId: string, states: StateMap): ConceptNode[] {
  const onPath = ancestorsOf(goalId, EDGES);
  return NODES.filter(
    (n) => !n.gap && n.id !== goalId && !onPath.has(n.id) && !isMastered(states, n.id),
  );
}

/** Concepts the diagnostic pruned — mastered before any work (week 0). */
export function prunedCount(states: StateMap): number {
  return NODES.filter((n) => n.week === 0 && isMastered(states, n.id)).length;
}

export type PaceVerdict = "ahead" | "ontrack" | "behind";

export interface Pace {
  verdict: PaceVerdict;
  /** Concepts left to master on the way to the goal. */
  remaining: number;
  /** Days the current daily budget projects to clear them. */
  projectedDays: number;
  /** Days of slack against the deadline (negative = will overshoot). */
  slack: number;
  /** Daily minutes that would land exactly on the deadline. */
  neededTarget: number;
  headline: string;
  detail: string;
}

/**
 * Goal-conditioned pace against the deadline. Honest, not decorative: it
 * counts the concepts still between the learner and the goal, projects them
 * against the daily budget, and says plainly whether the pace makes the date.
 */
export function pace(
  goalId: string,
  goalLabel: string,
  states: StateMap,
  dailyTarget: number,
): Pace {
  const remaining = criticalPathTo(goalId, states).size;
  const nodesPerDay = dailyTarget / MIN_PER_NODE;
  const projectedDays = Math.ceil(remaining / nodesPerDay);
  const slack = EXAM_DAYS - projectedDays;
  const verdict: PaceVerdict =
    slack >= 4 ? "ahead" : slack >= 0 ? "ontrack" : "behind";
  const neededTarget = Math.ceil((remaining / EXAM_DAYS) * MIN_PER_NODE);

  const headline =
    verdict === "behind"
      ? `Behind pace · ~${projectedDays} days to ${goalLabel}`
      : verdict === "ahead"
        ? `Ahead of pace · ${slack} days of slack`
        : "On pace for the exam";

  const detail =
    verdict === "behind"
      ? `${remaining} concepts left at ${dailyTarget} min/day lands ${Math.abs(slack)} day${Math.abs(slack) === 1 ? "" : "s"} past the exam. Bump to ~${neededTarget} min/day, or let Plan prune off-goal branches.`
      : verdict === "ahead"
        ? `${remaining} concepts left — ${dailyTarget} min/day clears them with ${slack} days to spare.`
        : `${remaining} concepts left — ${dailyTarget} min/day lands you right on the exam.`;

  return {
    verdict,
    remaining,
    projectedDays,
    slack,
    neededTarget,
    headline,
    detail,
  };
}

/**
 * The re-plan toast the map raises when it restructures (SPEC §5's only
 * recurring Plan UI). Built from the live map, not hardcoded: what the
 * diagnostic pruned, where the frontier sits, and the pace verdict.
 */
export function planSummary(
  goalId: string,
  goalLabel: string,
  states: StateMap,
  goal: GoalKind,
  frontierLabel: string | null,
  dailyTarget: number,
): string {
  const pruned = prunedCount(states);
  const parts = [`Map updated · pruned ${pruned} branches you already own`];
  if (frontierLabel) parts.push(`frontier set to ${frontierLabel}`);
  if (goal === "exam") {
    const p = pace(goalId, goalLabel, states, dailyTarget);
    parts.push(
      p.verdict === "behind"
        ? `behind pace for the exam — bump to ~${p.neededTarget} min/day`
        : p.verdict === "ahead"
          ? `ahead of pace for the exam`
          : `on pace for the exam`,
    );
  } else {
    parts.push(`ordered toward ${goalLabel}`);
  }
  return parts.join(" · ");
}
