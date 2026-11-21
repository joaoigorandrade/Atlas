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
  State,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import { CARD_MINUTES } from "@/lib/curriculum";
import type {
  ForecastRow,
  RetainContent,
  ReviewCard,
  ReviewCardType,
  ReviewGrade,
  ReviewQueue,
} from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";

/** The forecast's own copy — three fixed rows, so it lives here rather than in
 *  a component: `retainContentFromStore` builds them before any render. */
const FORECAST_STRINGS = {
  en: {
    dueNow: "Due in all — today’s deck included",
    thisWeek: "Coming up this week",
    rockSolid: "Rock-solid",
    cards: (n: number) => `${n} card${n === 1 ? "" : "s"}`,
    minutes: (n: number) => `~${n} min`,
    onSchedule: "recall lifting as scheduled",
    farOut: "next lift 30 d+ out",
    hours: (n: number) => `${n} h`,
    months: (n: number) => `${n} mo`,
    years: (n: number) => `${n} y`,
  },
  "pt-BR": {
    dueNow: "Vencidos ao todo — a fila de hoje inclusa",
    thisWeek: "Chegando esta semana",
    rockSolid: "Consolidado",
    cards: (n: number) => `${n} ${n === 1 ? "cartão" : "cartões"}`,
    minutes: (n: number) => `~${n} min`,
    onSchedule: "a lembrança sobe conforme o previsto",
    farOut: "próxima revisão em 30 d+",
    hours: (n: number) => `${n} h`,
    months: (n: number) => (n === 1 ? "1 mês" : `${n} meses`),
    years: (n: number) => (n === 1 ? "1 ano" : `${n} anos`),
  },
} as const;

/** The copy for a language — falling back to English for anything else, so a
 *  client sending an unknown `lang` gets English rather than a 500. */
function stringsFor(lang: Language | string | null | undefined) {
  return FORECAST_STRINGS[lang as Language] ?? FORECAST_STRINGS.en;
}

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

/**
 * How much of each node's review deck is likely still recalled right now: the
 * mean FSRS retrievability of its reviewed cards (W4.2). A node whose cards
 * were never reviewed is absent — nothing has had time to fade yet.
 */
export function nodeRetention(
  cards: readonly StoredCard[],
  now: Date = new Date(),
): Record<string, number> {
  const sums: Record<string, [number, number]> = {};
  for (const c of cards) {
    if (!c.fsrs.reps || !c.fsrs.last_review) continue;
    const r = scheduler.get_retrievability(fromStored(c.fsrs), now, false);
    if (!Number.isFinite(r)) continue;
    const s = (sums[c.nodeId] ??= [0, 0]);
    s[0] += r;
    s[1] += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([id, [t, n]]) => [id, t / n]));
}

/** The retention FSRS schedules toward: a node below it is fading. */
export const RETENTION_TARGET = 0.9;

/** A brand-new card, due immediately. */
export function newStoredCard(
  fields: Omit<StoredCard, "fsrs">,
  now: Date = new Date(),
): StoredCard {
  return { ...fields, fsrs: toStored(createEmptyCard(now)) };
}

/**
 * Start the scheduler on any card that arrived without it.
 *
 * A client that does not run the scheduler mints a card with no state — the
 * scheduler is the server's, on purpose. The write path used to reject those
 * outright, which quietly dropped every card the phone drafted; a brand-new
 * card is simply due now, which is what `newStoredCard` already says.
 */
export function withSchedule(
  cards: Array<Omit<StoredCard, "fsrs"> & { fsrs?: StoredFsrsState }>,
  now: Date = new Date(),
): StoredCard[] {
  return cards.map(({ fsrs, ...rest }) =>
    fsrs?.due ? { ...rest, fsrs } : newStoredCard(rest, now),
  );
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

// The per-card minute lives with the budget math it feeds (`retainBudget`),
// and is re-exported here because every scheduling caller reaches for it.
export { CARD_MINUTES };

/** The interval on a grade button, in the learner's language.
 *
 *  Localized because it is the one number the phone no longer computes: the
 *  scheduler runs here, so these words are written here too, and an app whose
 *  source language is pt-BR would otherwise show "2 mo" under "Fácil". */
export function fmtInterval(ms: number, lang: Language = "en"): string {
  const t = stringsFor(lang);
  const min = ms / 60_000;
  // Anki's own reading of a learning step: "<10m" means "within ten minutes".
  if (min < 60) return `<${Math.max(1, Math.ceil(min))} min`;
  const hours = ms / 3_600_000;
  if (hours < 22) return t.hours(Math.round(hours));
  const days = ms / 86_400_000;
  if (days < 30) return `${Math.max(1, Math.round(days))} d`;
  if (days < 365) return t.months(Math.round(days / 30));
  return t.years(Math.round(days / 365));
}

/** What each grade would schedule for this card — real intervals on the buttons. */
export function intervalLabels(
  card: StoredCard,
  now: Date = new Date(),
  lang: Language = "en",
): Record<ReviewGrade, string> {
  const out = {} as Record<ReviewGrade, string>;
  for (const grade of Object.keys(RATING) as ReviewGrade[]) {
    const { card: next } = scheduler.next(fromStored(card.fsrs), now, RATING[grade]);
    out[grade] = fmtInterval(next.due.getTime() - now.getTime(), lang);
  }
  return out;
}

/** The retention-health forecast, read from the real card table. */
export function forecastRows(
  cards: StoredCard[],
  now: Date = new Date(),
  lang: Language = "en",
): ForecastRow[] {
  const t = stringsFor(lang);
  const due = cards.filter((c) => isDue(c, now)).length;
  const week = cards.filter(
    (c) => !isDue(c, now) && Date.parse(c.fsrs.due) <= now.getTime() + 7 * 86_400_000,
  ).length;
  const solid = cards.filter(
    (c) => Date.parse(c.fsrs.due) > now.getTime() + 30 * 86_400_000,
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
 * Today's honest queue as the Retain surface's content shape: due cards
 * budgeted to the learner's daily minutes, grade buttons carrying the
 * scheduler's real intervals. Review states (State.Review with a miss risk)
 * keep the alive-loop wiring (`fails`).
 */
/** Which of Anki's three queues a card is in: never seen, still on its
 *  learning (or relearning) steps, or a graduated review. */
export function queueOf(card: StoredCard): ReviewQueue {
  const state = card.fsrs.state;
  if (state === State.New || !card.fsrs.reps) return "new";
  if (state === State.Learning || state === State.Relearning) return "learning";
  return "review";
}

/** A stored card, dealt: its content, its queue, and the real interval on
 *  every grade button as of `now`. */
export function toReviewCard(
  c: StoredCard,
  now: Date = new Date(),
  lang: Language = "en",
): ReviewCard {
  return {
    id: c.id,
    type: c.type,
    source: c.source,
    node: c.nodeId,
    cloze: c.cloze,
    answer: c.answer,
    front: c.front,
    back: c.back,
    fsrs: intervalLabels(c, now, lang),
    queue: queueOf(c),
    fails: true,
    reExplain: c.reExplain,
  };
}

/**
 * How far ahead a learning step still counts as "this pass" — Anki's
 * learn-ahead limit. A card the scheduler puts back within it (a miss at 1 min,
 * a new card's 10-minute step) is dealt again before the pass ends, and graded
 * for real when it is; one due later waits for its day.
 */
export const LEARN_AHEAD_MS = 20 * 60_000;

/** Does this just-graded card come back before today's pass ends? */
export function returnsThisPass(card: StoredCard, now: Date = new Date()): boolean {
  return Date.parse(card.fsrs.due) - now.getTime() <= LEARN_AHEAD_MS;
}

export function retainContentFromStore(
  cards: StoredCard[],
  budgetMin: number,
  now: Date = new Date(),
  lang: Language = "en",
): RetainContent {
  const due = dueCards(cards, now);
  const budgeted = due.slice(0, Math.max(1, Math.floor(budgetMin / CARD_MINUTES)));
  const deck: ReviewCard[] = budgeted.map((c) => toReviewCard(c, now, lang));
  return {
    budgetMin,
    forecast: forecastRows(cards, now, lang),
    cards: deck,
    remaining: due.length - budgeted.length,
  };
}
