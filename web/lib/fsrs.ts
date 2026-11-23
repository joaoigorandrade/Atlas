// Real FSRS scheduling (#21) on ts-fsrs. Cards are created by the phases
// (Connect links/mnemonics, Retain's generated deck on a node's first review),
// persisted in the run snapshot, and graded through the actual scheduler —
// due dates, the daily queue, and the forecast all read from this store, never
// from LLM-invented interval strings.

import {
  createEmptyCard,
  fsrs,
  GenSeedStrategyWithCardId,
  generatorParameters,
  Rating,
  State,
  StrategyMode,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";
import { CARD_MINUTES } from "@/lib/curriculum";
import type {
  ReviewCard,
  ReviewCardType,
  ReviewGrade,
  ReviewQueue,
} from "@/lib/curriculum";
import { fmtInterval } from "@/lib/fsrsCopy";
import type { Language } from "@/lib/i18n";

export { fmtInterval };

/** ts-fsrs card state with dates as ISO strings — JSON-snapshot safe.
 *
 *  `introduced` is ours, not ts-fsrs's: when the card was first reviewed. It
 *  rides in the scheduler state because, like the rest of it, only a grade may
 *  set it — that is what lets the queue cap how many new cards a day brings in
 *  (`NEW_PER_DAY`) without a second column a client could overwrite. */
export type StoredFsrsState = Omit<FsrsCard, "due" | "last_review"> & {
  due: string;
  last_review?: string;
  introduced?: string;
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
  /** Out of rotation: suspended by hand (a wrong or useless card) or by the
   *  scheduler once it became a leech (`LEECH_LAPSES`). Never dealt, never in
   *  the forecast. Server-owned, like `fsrs`: only a grade or the suspend
   *  route changes it. */
  suspended?: boolean;
  fsrs: StoredFsrsState;
}

// Default parameters until the review log (`card_reviews`) holds enough
// history to fit them. Fuzz is on — without it a draft's cards, all minted in
// the same second and graded alike, stayed due on the same days forever. It is
// seeded by card id and rep count (not the clock), so the interval printed on
// a button is the interval that grade really schedules.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true })).useStrategy(
  StrategyMode.SEED,
  GenSeedStrategyWithCardId("cid"),
);

const RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Exactly ts-fsrs's fields — named rather than spread, so the seed's `cid`
 *  and anything else riding on the scheduler's card never lands in storage. */
function toStored(card: FsrsCard, introduced?: string): StoredFsrsState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : null),
    ...(introduced ? { introduced } : null),
  };
}

/** The scheduler's card, carrying the id its fuzz is seeded with. */
function fromStored(state: StoredFsrsState, id = ""): FsrsCard {
  // `introduced` rides along untouched; `toStored` names its fields, so
  // nothing the scheduler carries through comes back out unasked.
  return {
    ...state,
    cid: id,
    due: new Date(state.due),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  } as FsrsCard;
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
    const r = scheduler.get_retrievability(fromStored(c.fsrs, c.id), now, false);
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

/** Lapses at which a card is pulled from rotation as a leech — Anki's default.
 *  A card forgotten this often is not being learned by repetition; it needs
 *  re-teaching or rewriting, so the learner is sent back to its node. */
export const LEECH_LAPSES = 8;

/** One review, as the log keeps it: enough for the FSRS optimizer (card, time,
 *  rating, state, elapsed days, duration) and for an exact undo (`before`). */
export interface CardReview {
  cardId: string;
  rating: ReviewGrade;
  reviewedAt: string;
  /** How long the card was on screen, when the client measured it. */
  durationMs?: number;
  /** The card's state before this review (ts-fsrs `State`). */
  state: number;
  elapsedDays: number;
  scheduledDays: number;
  stability: number;
  difficulty: number;
  /** The card's scheduler state and suspension before the review — what an
   *  undo puts back. */
  before: { fsrs: StoredFsrsState; suspended: boolean };
  /** Reps after the review: orders a card's log without trusting a clock. */
  reps: number;
}

/**
 * Grade a card through the real scheduler: the card with its next due date,
 * the log row of the review, and whether it just became a leech (in which
 * case it comes back suspended).
 */
export function reviewStoredCard(
  card: StoredCard,
  grade: ReviewGrade,
  now: Date = new Date(),
  durationMs?: number,
): { card: StoredCard; review: CardReview; leech: boolean } {
  const { card: next, log } = scheduler.next(
    fromStored(card.fsrs, card.id),
    now,
    RATING[grade],
  );
  const introduced =
    card.fsrs.introduced ?? (card.fsrs.reps ? undefined : now.toISOString());
  const leech = grade === "again" && !card.suspended && next.lapses >= LEECH_LAPSES;
  const graded: StoredCard = {
    ...card,
    fsrs: toStored(next, introduced),
    ...(leech ? { suspended: true } : null),
  };
  return {
    card: graded,
    leech,
    review: {
      cardId: card.id,
      rating: grade,
      reviewedAt: now.toISOString(),
      ...(durationMs !== undefined ? { durationMs } : null),
      state: log.state,
      elapsedDays: log.elapsed_days,
      scheduledDays: log.scheduled_days,
      stability: next.stability,
      difficulty: next.difficulty,
      before: { fsrs: card.fsrs, suspended: !!card.suspended },
      reps: next.reps,
    },
  };
}

/** Grade a card through the real scheduler — returns it with its next due date. */
export function gradeStoredCard(
  card: StoredCard,
  grade: ReviewGrade,
  now: Date = new Date(),
): StoredCard {
  return reviewStoredCard(card, grade, now).card;
}

export function isDue(card: StoredCard, now: Date = new Date()): boolean {
  return !card.suspended && Date.parse(card.fsrs.due) <= now.getTime();
}

/** Cards due now, most overdue first. Suspended cards are never due. */
export function dueCards(cards: StoredCard[], now: Date = new Date()): StoredCard[] {
  return cards
    .filter((c) => isDue(c, now))
    .sort((a, b) => Date.parse(a.fsrs.due) - Date.parse(b.fsrs.due));
}

// The per-card minute lives with the budget math it feeds (`retainBudget`),
// and is re-exported here because every scheduling caller reaches for it.
export { CARD_MINUTES };

/** What each grade would schedule for this card — real intervals on the buttons. */
export function intervalLabels(
  card: StoredCard,
  now: Date = new Date(),
  lang: Language = "en",
): Record<ReviewGrade, string> {
  const out = {} as Record<ReviewGrade, string>;
  for (const grade of Object.keys(RATING) as ReviewGrade[]) {
    const { card: next } = scheduler.next(
      fromStored(card.fsrs, card.id),
      now,
      RATING[grade],
    );
    out[grade] = fmtInterval(next.due.getTime() - now.getTime(), lang);
  }
  return out;
}

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
