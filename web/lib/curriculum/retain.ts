// ---- Phase 6 · Retain (Review queue / FSRS) — the daily spine -------------
// Keep mastered knowledge alive with optimally-spaced retrieval. This is the
// habit surface — designed for adherence as much as scheduling. Cards are
// auto-generated from the earlier phases (the tedious step humans skip):
// atomic, cloze where apt, varied by type (recall / explain-why / application).
// The queue is honest — framed in *minutes* against the daily target, never a
// wall of cards — and one card shows at a time: read it, flip it,
// grade it (feeds FSRS). The alive-loop is the difference from "Anki
// plus a chatbot": a missed card doesn't just reschedule — it triggers a
// 30-second Socratic re-explanation right there and flags its node Shaky on the
// map, so retention failure re-enters Phase 1. Content ships the Linear
// Transformations rotation of cards so the tap → flip → grade → alive-loop is
// real, not decorative.
import { STATE_COLOR } from "./types";
import type { ReviewCardType, ReviewGrade, ReviewQueue } from "./retainMeta";
import { Language } from "@/lib/i18n";

/**
 * How many nodes one card-draft covers.
 *
 * The factory writes about one card per node and is capped at
 * `RETAIN_CARD_BOUNDS.max` cards, so handing it thirty uncovered nodes did not
 * produce thirty cards — it produced eight, over whichever nodes the model
 * happened to pick, and the other twenty-two stayed uncovered with nothing
 * saying so. Both clients send this many nodes at a time instead, so a draft
 * covers the nodes it was given and the next pass picks up the rest.
 */
export const RETAIN_DRAFT_NODES = 8;

/** Retention-health forecast tone: due now, softening, or rock-solid. */
export type ForecastTone = "due" | "soft" | "solid";

/** The forecast bar colors — due borrows the accent, soft/solid the states. */
export const FORECAST_COLOR: Record<ForecastTone, string> = {
  due: "#3a6a55", // color.accent — surfaced now
  soft: STATE_COLOR.shaky,
  solid: STATE_COLOR.mastered,
};

/** One row of the FSRS forecast shown in the sidebar. */
export interface ForecastRow {
  label: string;
  count: string;
  sub: string;
  tone: ForecastTone;
}

/**
 * One review card — atomic, one fact. Cloze cards carry `cloze`/`answer`;
 * others carry a plain `front`. `fails` marks the card whose miss re-enters the
 * loop (flags its node Shaky), and `reExplain` is the 30-second Socratic aside
 * shown right there when it's missed.
 */
export interface ReviewCard {
  id: string;
  type: ReviewCardType;
  /** Which session auto-generated it — the provenance line ("from your … session"). */
  source: string;
  /** The node this card keeps alive; a miss flags it Shaky on the map. */
  node: string;
  /** Cloze halves around the blank (recall cloze cards only). */
  cloze?: [string, string];
  /** The answer filled into the cloze blank. */
  answer?: string;
  /** A plain question front (why / apply cards). */
  front?: string;
  /** The full answer revealed on flip. */
  back: string;
  /** FSRS next-interval per grade — shown on the grade buttons. Supplied by
   *  the scheduler (`intervalLabels`), never by the generator: the generated
   *  card is a draft that `newStoredCard` turns into a real scheduled card. */
  fsrs?: Record<ReviewGrade, string>;
  /** Which queue the card is dealt from (`queueOf`) — the counts above the
   *  card. Absent on the generator's drafts, which are not in a queue yet. */
  queue?: ReviewQueue;
  /** A card whose miss re-enters Phase 1 (writes its node Shaky). */
  fails?: boolean;
  /** The 30-second Socratic re-explanation shown when it's missed. */
  reExplain?: string;
}

/** Everything the Retain surface needs for one day's honest queue. */
export interface RetainContent {
  /** The daily target from onboarding — the queue budget, in minutes. */
  budgetMin: number;
  /** Built from real due dates by `forecastRows`. Absent on the generator's
   *  output, which is a card factory rather than a queue. */
  forecast?: ForecastRow[];
  cards: ReviewCard[];
  /** Due cards the budget could not fit today. Zero means the queue really is
   *  clear; anything else means "budget spent", which is a different sentence
   *  and used to be told as the same one. Absent on the generator's output,
   *  which drafts cards rather than budgeting a queue. */
  remaining?: number;
}

/** The stages of one card: question → flip → grade, or the fail aside. */
export type RetainStage = "question" | "reveal" | "aside" | "failed";

/** The live state of one Retain session — held by AtlasApp, read by the view. */
export interface RetainSession {
  /** Index of the card on screen, into `retainDeck` rather than `content.cards`. */
  idx: number;
  stage: RetainStage;
  /** Cards dealt again later in this pass, in grading order — each as the
   *  scheduler left it, so its buttons carry its *next* step's intervals. A
   *  card comes back when its learning step lands inside the learn-ahead
   *  window (`returnsThisPass`): a miss, or a new card's 10-minute step. */
  requeued: ReviewCard[];
  /** Grade recorded per **deck position**, not per card id: a requeued card
   *  comes back under the same id, and keying by id lit its second slot on the
   *  rail with the first answer's colour before it had been answered. */
  done: Record<number, ReviewGrade>;
  /** True once a missed card has flagged its node Shaky on the map. */
  wroteBack: boolean;
  /** True once the queue is cleared — the done-for-today surface. */
  finished: boolean;
  /** How sure the learner said they were as they turned the card on screen
   *  (an index into `CONFIDENCE_FELT`); cleared when the next card is dealt. */
  sure?: number;
  /** What they answered before turning it (W4.3), typed or spoken — absent
   *  when they answered in their head. Cleared with the card. */
  said?: string;
  /** The judge's read of `said` against the back: did it come back? The grade
   *  it suggests is the learner's to take or override; it is what calibration
   *  reads instead of their own grade, which was given after seeing the answer. */
  suggest?: { grade: CardSuggestion; read: string };
}

/** What a judged answer suggests: it came back, or it did not. Hard and Easy
 *  are nuances only the learner can give. */
export type CardSuggestion = "good" | "again";

/** A retrieval ruling, as a suggested grade. */
export function suggestGrade(verdict: "good" | "skipped" | "confused"): CardSuggestion {
  return verdict === "good" ? "good" : "again";
}

export function retainStart(): RetainSession {
  return {
    idx: 0,
    stage: "question",
    requeued: [],
    done: {},
    wroteBack: false,
    finished: false,
  };
}

export type RetainAction =
  | { type: "flip"; sure?: number; said?: string }
  /** The judge's read of the answer on the card at `idx` — ignored once the
   *  learner has moved past it, so a late verdict can't land on the next card. */
  | { type: "suggest"; idx: number; grade: CardSuggestion; read: string }
  /** `returns` is the card as it comes back later this pass, when the
   *  scheduler put it inside the learn-ahead window; absent, it is done for
   *  today. */
  | { type: "grade"; grade: ReviewGrade; returns?: ReviewCard }
  | { type: "toggleAside" }
  | { type: "continue" }
  /** Take the card on screen out of rotation (suspended) and move on without
   *  grading it; any later copy of it in this pass goes too. */
  | { type: "skip" }
  /** New cards drafted while the pass was open, dealt at its end. */
  | { type: "deal"; cards: ReviewCard[] };

/**
 * Today's deck: the budgeted cards, then the ones whose learning step brought
 * them back inside this pass. Every trip is a real review — the scheduler is
 * told each answer — so a card answered on its second try graduates instead of
 * sitting due again the moment the pass ends.
 */
export function retainDeck(session: RetainSession, content: RetainContent): ReviewCard[] {
  if (session.requeued.length === 0) return content.cards;
  return [...content.cards, ...session.requeued];
}

/** The most times one card is dealt in a pass. Anki has no ceiling; this one
 *  exists so a card nobody can answer still lets the pass end. */
export const MAX_TRIPS = 4;

/** What's left in each queue — the card on screen included, Anki's
 *  "new · learning · review" counts above the card. */
export function retainCounts(
  session: RetainSession,
  content: RetainContent,
): Record<ReviewQueue, number> {
  const out: Record<ReviewQueue, number> = { new: 0, learning: 0, review: 0 };
  if (session.finished) return out;
  const deck = retainDeck(session, content);
  for (let i = session.idx; i < deck.length; i++) out[deck[i].queue ?? "review"]++;
  return out;
}

/** What a card leaves behind when the next one is dealt: nothing. */
const CLEARED = { sure: undefined, said: undefined, suggest: undefined };

function retainAdvance(
  session: RetainSession,
  done: Record<number, ReviewGrade>,
  content: RetainContent,
): RetainSession {
  const next = session.idx + 1;
  if (next >= retainDeck(session, content).length)
    return { ...session, done, finished: true, ...CLEARED };
  return { ...session, idx: next, stage: "question", done, ...CLEARED };
}

/**
 * The review engine, as a pure transition. The card flips on request; a grade
 * feeds FSRS and advances — except "Again", which opens the alive-loop (the
 * fail stage with its instant re-explanation). The map write-back (flagging the
 * node Shaky) is a side effect that lives in AtlasApp, exactly as the Crucible's
 * gap write-back does; this reducer only owns the session.
 */
export function retainReducer(
  session: RetainSession,
  action: RetainAction,
  content: RetainContent,
): RetainSession {
  switch (action.type) {
    case "flip":
      if (session.stage !== "question") return session;
      return {
        ...session,
        stage: "reveal",
        sure: action.sure,
        said: action.said?.trim() || undefined,
        suggest: undefined,
      };
    case "suggest":
      if (action.idx !== session.idx || session.stage === "question") return session;
      return { ...session, suggest: { grade: action.grade, read: action.read } };
    case "toggleAside":
      if (session.stage !== "reveal" && session.stage !== "aside") return session;
      return {
        ...session,
        stage: session.stage === "aside" ? "reveal" : "aside",
      };
    case "grade": {
      if (session.stage !== "reveal" && session.stage !== "aside") return session;
      const card = reviewCard(session, content);
      const done = { ...session.done, [session.idx]: action.grade };
      const trips = retainDeck(session, content).filter((c) => c.id === card.id).length;
      const requeued =
        action.returns && trips < MAX_TRIPS
          ? [...session.requeued, action.returns]
          : session.requeued;
      // A miss doesn't just reschedule — it opens the alive-loop and flags the
      // node Shaky (the write-back happens in AtlasApp).
      if (action.grade === "again")
        return { ...session, stage: "failed", done, wroteBack: !!card.fails, requeued };
      return retainAdvance({ ...session, requeued }, done, content);
    }
    case "continue":
      // "Schedule re-teach · continue" — leave the fail stage and move on.
      if (session.stage !== "failed") return session;
      return retainAdvance(session, session.done, content);
    case "skip": {
      if (session.finished) return session;
      const deck = retainDeck(session, content);
      const id = deck[session.idx]?.id;
      // Later copies are unanswered (only positions up to `idx` are), so
      // dropping them moves nothing that has a grade recorded against it.
      const base = content.cards.length;
      const requeued = session.requeued.filter(
        (c, i) => base + i <= session.idx || c.id !== id,
      );
      return retainAdvance({ ...session, requeued }, session.done, content);
    }
    case "deal":
      // A finished pass stays finished: the cards wait for the next open.
      if (session.finished || action.cards.length === 0) return session;
      return { ...session, requeued: [...session.requeued, ...action.cards] };
    default:
      return session;
  }
}

/**
 * Undo: the pass as it stood before its latest grade or skip, back on that
 * card's question (or its fail stage, for a skip made there). `dealt` is what arrived since (`deal`), which the undo
 * keeps — it came from the store, not from the answer being taken back.
 */
export function retainRewind(before: RetainSession, dealt: ReviewCard[]): RetainSession {
  const requeued = [...before.requeued, ...dealt];
  // A skip from the fail stage goes back to the fail stage: its grade stands.
  if (before.stage === "failed") return { ...before, requeued };
  return { ...before, stage: "question", finished: false, requeued, ...CLEARED };
}

/** The card on screen (clamped to today's deck). */
export function reviewCard(session: RetainSession, content: RetainContent): ReviewCard {
  const deck = retainDeck(session, content);
  return deck[Math.min(session.idx, deck.length - 1)];
}

/** Roughly how long one card takes. The queue is budgeted in minutes against
 *  the daily target, never framed as a wall of cards. Lives here rather than in
 *  `lib/fsrs.ts` (which re-exports it) because that module imports these types,
 *  and the budget math below needs the same number the deck was cut with. */
export const CARD_MINUTES = 1.5;

/** The honest queue's time math — minutes, never a card count. */
export interface RetainBudget {
  doneCount: number;
  total: number;
  /** Minutes spent so far. */
  spent: number;
  /** Minutes left against the daily target. */
  left: number;
  /** Fill percent of the budget bar. */
  pct: number;
}

export function retainBudget(
  session: RetainSession,
  content: RetainContent,
): RetainBudget {
  const total = Math.max(1, retainDeck(session, content).length);
  const doneCount = session.finished ? total : Object.keys(session.done).length;
  // A card costs what a card costs. Dividing the budget by however few cards
  // happened to be due made a two-card queue claim seven minutes each, which is
  // the opposite of the honest framing this bar exists for.
  const spent = Math.round(doneCount * CARD_MINUTES);
  const left = Math.max(0, Math.round(total * CARD_MINUTES) - spent);
  const pct = Math.min(100, Math.round((doneCount / total) * 100));
  return { doneCount, total, spent, left, pct };
}

/** The header queue chip — time and cards left, or "Queue clear". */
export function retainQueueLabel(
  session: RetainSession,
  content: RetainContent,
  lang: Language = "en",
): string {
  const over = content.remaining ?? 0;
  if (lang === "pt-BR") {
    if (session.finished)
      return over > 0 ? `Meta cumprida · ${over} esperando` : "Fila limpa";
    const { left, total, doneCount } = retainBudget(session, content);
    const n = total - doneCount;
    return `~${left} min restantes · ${n} ${n === 1 ? "cartão" : "cartões"}`;
  }
  if (session.finished)
    return over > 0 ? `Budget spent · ${over} waiting` : "Queue clear";
  const { left, total, doneCount } = retainBudget(session, content);
  const n = total - doneCount;
  return `~${left} min left · ${n} ${n === 1 ? "card" : "cards"}`;
}
