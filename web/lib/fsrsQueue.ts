// Today's queue, read off the card store: which due cards are dealt, in what
// order, and the forecast beside them. Split from `lib/fsrs.ts`, which owns
// the scheduler itself; this owns only what is dealt from it.

import { CARD_MINUTES } from "@/lib/curriculum";
import type { ForecastRow, RetainContent, ReviewCard } from "@/lib/curriculum";
import { dueCards, isDue, queueOf, toReviewCard, type StoredCard } from "@/lib/fsrs";
import { stringsFor } from "@/lib/fsrsCopy";
import type { Language } from "@/lib/i18n";

const DAY_MS = 86_400_000;

/**
 * Today's deck: every due card, in Anki's order — cards on a learning step
 * first (they are mid-lesson), then graduated reviews most overdue first, then
 * new cards. No cap of any kind: not per day, not per pass. The daily minutes
 * are a target the forecast reports against, never a cut.
 */
export function todaysQueue(cards: StoredCard[], now: Date = new Date()): StoredCard[] {
  const due = dueCards(cards, now);
  return [
    ...due.filter((c) => queueOf(c) === "learning"),
    ...due.filter((c) => queueOf(c) === "review"),
    ...due.filter((c) => queueOf(c) === "new"),
  ];
}

/** Every card today deals: what the queue chip and the daily plan count. */
export function dealableCount(cards: StoredCard[], now: Date = new Date()): number {
  return dueCards(cards, now).length;
}

/** Is there anything to deal today? */
export function hasReviewWork(cards: StoredCard[], now: Date = new Date()): boolean {
  return cards.some((c) => isDue(c, now));
}

/** The retention-health forecast, read from the real card table. */
export function forecastRows(
  cards: StoredCard[],
  now: Date = new Date(),
  lang: Language = "en",
): ForecastRow[] {
  const t = stringsFor(lang);
  const live = cards.filter((c) => !c.suspended);
  const due = live.filter((c) => isDue(c, now)).length;
  const week = live.filter(
    (c) => !isDue(c, now) && Date.parse(c.fsrs.due) <= now.getTime() + 7 * DAY_MS,
  ).length;
  const solid = live.filter(
    (c) => Date.parse(c.fsrs.due) > now.getTime() + 30 * DAY_MS,
  ).length;
  return [
    {
      label: t.dueNow,
      count: t.cards(due),
      sub: t.minutes(Math.ceil(due * CARD_MINUTES)),
      tone: "due",
    },
    {
      label: t.thisWeek,
      count: t.cards(week),
      sub: t.onSchedule,
      tone: "soft",
    },
    {
      label: t.rockSolid,
      count: t.cards(solid),
      sub: t.farOut,
      tone: "solid",
    },
  ];
}

/**
 * Today's honest queue as the Retain surface's content shape: `todaysQueue`, grade buttons carrying the
 * scheduler's real intervals. Every card keeps the alive-loop wiring (`fails`):
 * a miss flags its node Shaky whatever queue the card was in.
 */
export function retainContentFromStore(
  cards: StoredCard[],
  budgetMin: number,
  now: Date = new Date(),
  lang: Language = "en",
): RetainContent {
  return {
    budgetMin,
    forecast: forecastRows(cards, now, lang),
    cards: todaysQueue(cards, now).map((c): ReviewCard => toReviewCard(c, now, lang)),
  };
}
