// One plan for the day across every map (W4.6).
//
// Four maps meant four review queues and four frontiers, and nothing said
// which of them today belongs to — a trip in six weeks could not outrank a
// hobby. This reads the whole library the bootstrap already returned (every
// topic's graph, ledger, cards and goal date) and says, per map, what today
// asks of it: the cards due, then the next rung that is actually open. Maps
// are ranked by what is due and how close their date is, and taken until the
// learner's daily minutes are spent.
//
// Planning only: each row opens its map, where the review and the rung run as
// they always have. ponytail: a cross-map review deck is the upgrade, when one
// screen for all of it proves worth the write path it needs.

import {
  CARD_MINUTES,
  PHASE_MINUTES,
  daysUntil,
  displayStates,
  heldUntil,
  orderedFrontier,
  phasePlan,
  primaryPhase,
  type GoalKind,
  type PhaseId,
} from "@/lib/curriculum";
import { dueCards } from "@/lib/fsrs";
import type { Topic } from "@/lib/persistence";

export interface DayItem {
  subject: string;
  /** Cards due in this map right now. */
  due: number;
  /** The rung to open after them — in-progress work first, then the goal's
   *  frontier — skipping a gate held until tomorrow. */
  next: { label: string; phase: PhaseId } | null;
  /** Days until this map's goal date, when it has one still ahead. */
  daysLeft: number | null;
  minutes: number;
}

type PlanTopic = Pick<
  Topic,
  | "subject"
  | "goal"
  | "examDate"
  | "graph"
  | "states"
  | "phasesDone"
  | "phaseProgress"
  | "cards"
>;

function itemFor(t: PlanTopic, now: Date): DayItem {
  const due = dueCards(t.cards ?? [], now).length;
  const display = displayStates(t.states, t.graph);
  const inFlight = t.graph.nodes.filter(
    (n) => !n.gap && (display[n.id] === "learning" || display[n.id] === "shaky"),
  );
  const frontier = orderedFrontier(display, t.graph, t.goal as GoalKind).map(
    (e) => e.node,
  );
  let next: DayItem["next"] = null;
  for (const node of [...inFlight, ...frontier]) {
    const phase = primaryPhase(
      phasePlan(node),
      t.phasesDone?.[node.id],
      display[node.id],
    );
    if (!phase || heldUntil(t.phaseProgress?.[node.id]?.[phase], now.getTime())) continue;
    next = { label: node.label, phase };
    break;
  }
  const days = t.examDate ? daysUntil(t.examDate, now) : 0;
  return {
    subject: t.subject,
    due,
    next,
    daysLeft: days > 0 ? days : null,
    minutes: Math.round(due * CARD_MINUTES + (next ? PHASE_MINUTES[next.phase] : 0)),
  };
}

/** How much today belongs to a map. ponytail: a date counts as thirty due
 *  cards spread over the days left — tune once real deadlines exist. */
const urgency = (i: DayItem) => i.due + (i.daysLeft !== null ? 30 / i.daysLeft : 0);

export function dailyPlan(
  topics: readonly PlanTopic[],
  targetMinutes: number,
  now: Date = new Date(),
): DayItem[] {
  const items = topics
    .map((t) => itemFor(t, now))
    .filter((i) => i.due > 0 || i.next)
    .sort((a, b) => urgency(b) - urgency(a));
  // The day's budget: maps in order until the minutes are spent — always one.
  let spent = 0;
  return items.filter((i, k) => {
    const keep = k === 0 || spent + i.minutes <= targetMinutes;
    if (keep) spent += i.minutes;
    return keep;
  });
}
