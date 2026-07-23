// Real FSRS scheduling (#21) on ts-fsrs. Cards are created by the phases
// (Connect links/mnemonics, Retain's generated deck on a node's first review),
// persisted in the run snapshot, and graded through the actual scheduler —
// due dates, the daily queue, and the forecast all read from this store, never
// from LLM-invented interval strings.

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import type {
  ForecastRow,
  RetainContent,
  ReviewCard,
  ReviewCardType,
  ReviewGrade,
} from "@/lib/curriculum";

/** ts-fsrs card state with dates as ISO strings — JSON-snapshot safe. */
export type StoredFsrsState = Omit<FsrsCard, "due" | "last_review"> & {
  due: string;
  last_review?: string;
};

/** One persisted review card: content + provenance + scheduler state. */
export interface StoredCard {
  id: string;
  /** The map node this card keeps alive. */
  nodeId: string;
  type: ReviewCardType;
  /** Which phase drafted it ("Connect", "Crucible", …). */
  source: string;
  /** Cloze halves + answer (recall cards) or a plain front (why/apply). */
  cloze?: [string, string];
  answer?: string;
  front?: string;
  back: string;
  /** The 30-second Socratic re-explanation shown on a miss. */
  reExplain?: string;
  fsrs: StoredFsrsState;
}

// ponytail: default parameters, no fuzz — tune when real retention data exists.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

const RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function toStored(card: FsrsCard): StoredFsrsState {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString(),
  };
}

function fromStored(state: StoredFsrsState): FsrsCard {
  return {
    ...state,
    due: new Date(state.due),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

/** A brand-new card, due immediately. */
export function newStoredCard(
  fields: Omit<StoredCard, "fsrs">,
  now: Date = new Date(),
): StoredCard {
  return { ...fields, fsrs: toStored(createEmptyCard(now)) };
}

/** Grade a card through the real scheduler — returns it with its next due date. */
export function gradeStoredCard(
  card: StoredCard,
  grade: ReviewGrade,
  now: Date = new Date(),
): StoredCard {
  const { card: next } = scheduler.next(fromStored(card.fsrs), now, RATING[grade]);
  return { ...card, fsrs: toStored(next) };
}

export function isDue(card: StoredCard, now: Date = new Date()): boolean {
  return Date.parse(card.fsrs.due) <= now.getTime();
}

/** Cards due now, most overdue first. */
export function dueCards(cards: StoredCard[], now: Date = new Date()): StoredCard[] {
  return cards
    .filter((c) => isDue(c, now))
    .sort((a, b) => Date.parse(a.fsrs.due) - Date.parse(b.fsrs.due));
}

/** Honest queue math: ~1 minute per card, capped to the daily budget. */
export const CARD_MINUTES = 1.5;

function fmtInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `<${Math.max(1, Math.ceil(min))} min`;
  const days = ms / 86_400_000;
  if (days < 30) return `${Math.max(1, Math.round(days))} d`;
  return `${Math.round(days / 30)} mo`;
}

/** What each grade would schedule for this card — real intervals on the buttons. */
export function intervalLabels(
  card: StoredCard,
  now: Date = new Date(),
): Record<ReviewGrade, string> {
  const out = {} as Record<ReviewGrade, string>;
  for (const grade of Object.keys(RATING) as ReviewGrade[]) {
    const { card: next } = scheduler.next(fromStored(card.fsrs), now, RATING[grade]);
    out[grade] = fmtInterval(next.due.getTime() - now.getTime());
  }
  return out;
}

/** The retention-health forecast, read from the real card table. */
export function forecastRows(
  cards: StoredCard[],
  now: Date = new Date(),
): ForecastRow[] {
  const due = cards.filter((c) => isDue(c, now)).length;
  const week = cards.filter(
    (c) =>
      !isDue(c, now) &&
      Date.parse(c.fsrs.due) <= now.getTime() + 7 * 86_400_000,
  ).length;
  const solid = cards.filter(
    (c) => Date.parse(c.fsrs.due) > now.getTime() + 30 * 86_400_000,
  ).length;
  return [
    {
      label: "Due now",
      count: `${due} card${due === 1 ? "" : "s"}`,
      sub: `~${Math.ceil(due * CARD_MINUTES)} min`,
      tone: "due",
    },
    {
      label: "Coming up this week",
      count: `${week} card${week === 1 ? "" : "s"}`,
      sub: "recall lifting as scheduled",
      tone: "soft",
    },
    {
      label: "Rock-solid",
      count: `${solid} card${solid === 1 ? "" : "s"}`,
      sub: "next lift 30 d+ out",
      tone: "solid",
    },
  ];
}

/**
 * Today's honest queue as the Retain surface's content shape: due cards
 * budgeted to the learner's daily minutes, grade buttons carrying the
 * scheduler's real intervals. Review states (State.Review with a miss risk)
 * keep the alive-loop wiring (`fails`).
 */
export function retainContentFromStore(
  cards: StoredCard[],
  budgetMin: number,
  now: Date = new Date(),
): RetainContent {
  const due = dueCards(cards, now);
  const budgeted = due.slice(0, Math.max(1, Math.floor(budgetMin / CARD_MINUTES)));
  const deck: ReviewCard[] = budgeted.map((c) => ({
    id: c.id,
    type: c.type,
    source: c.source,
    node: c.nodeId,
    cloze: c.cloze,
    answer: c.answer,
    front: c.front,
    back: c.back,
    fsrs: intervalLabels(c, now),
    fails: true,
    reExplain: c.reExplain,
  }));
  return { budgetMin, forecast: forecastRows(cards, now), cards: deck };
}
