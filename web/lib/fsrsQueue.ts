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
 * Today's deck, in Anki's order: cards on a learning step first (they are
 * mid-lesson), then graduated reviews most overdue first, then new cards — all
 * cut to the minute budget. No daily new-card cap: every due card is dealable.
 * `remaining` is every due card the budget did not fit.
 */
export function todaysQueue(
  cards: StoredCard[],
  budgetMin: number,
  now: Date = new Date(),
): { deck: StoredCard[]; remaining: number } {
  const due = dueCards(cards, now);
  const learning = due.filter((c) => queueOf(c) === "learning");
  const review = due.filter((c) => queueOf(c) === "review");
  const fresh = due.filter((c) => queueOf(c) === "new");
  const slots = Math.max(1, Math.floor(budgetMin / CARD_MINUTES));
  const deck = [...learning, ...review, ...fresh].slice(0, slots);
  return { deck, remaining: due.length - deck.length };
}

/** Every card today could deal, before the minute budget cuts it: what the
 *  queue chip and the daily plan count. */
export function dealableCount(cards: StoredCard[], now: Date = new Date()): number {
  return todaysQueue(cards, Number.POSITIVE_INFINITY, now).deck.length;
}

/** Is there anything to deal today? */
export function hasReviewWork(cards: StoredCard[], now: Date = new Date()): boolean {
  return todaysQueue(cards, CARD_MINUTES, now).deck.length > 0;
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
  const { deck, remaining } = todaysQueue(cards, budgetMin, now);
  return {
    budgetMin,
    forecast: forecastRows(cards, now, lang),
    cards: deck.map((c): ReviewCard => toReviewCard(c, now, lang)),
    remaining,
  };
}
