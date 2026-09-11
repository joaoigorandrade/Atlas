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
import { CONNECT_COLOR } from "./connect";
import { CRUCIBLE_COLOR } from "./crucible";
import { STATE_COLOR } from "./types";
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

/** The three card kinds — review isn't only fill-in-the-blank. */
export type ReviewCardType = "recall" | "why" | "apply";

/** Each type's label + accent (recall = learning, why = Connect, apply = Crucible). */
export const REVIEW_TYPE_META: Record<ReviewCardType, { label: string; color: string }> =
  {
    recall: { label: "Recall", color: STATE_COLOR.learning },
    why: { label: "Explain why", color: CONNECT_COLOR.accent },
    apply: { label: "Application", color: CRUCIBLE_COLOR.accent },
  };

const REVIEW_TYPE_LABEL_PT: Record<ReviewCardType, string> = {
  recall: "Recordar",
  why: "Explicar por quê",
  apply: "Aplicação",
};

/** Language-aware review-card type label + color. */
export function reviewTypeMeta(
  type: ReviewCardType,
  lang: Language = "en",
): { label: string; color: string } {
  return lang === "pt-BR"
    ? { label: REVIEW_TYPE_LABEL_PT[type], color: REVIEW_TYPE_META[type].color }
    : REVIEW_TYPE_META[type];
}

/** The FSRS grade after reveal — sets the next interval. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** The grade buttons, worst → best, each colored by the state it echoes. */
export const REVIEW_GRADES: ReadonlyArray<{
  key: ReviewGrade;
  label: string;
  color: string;
}> = [
  { key: "again", label: "Again", color: STATE_COLOR.gap },
  { key: "hard", label: "Hard", color: STATE_COLOR.shaky },
  { key: "good", label: "Good", color: STATE_COLOR.learning },
  { key: "easy", label: "Easy", color: STATE_COLOR.mastered },
];

const REVIEW_GRADE_LABEL_PT: Record<ReviewGrade, string> = {
  again: "De novo",
  hard: "Difícil",
  good: "Bom",
  easy: "Fácil",
};

/** Language-aware grade buttons. */
export function reviewGrades(
  lang: Language = "en",
): ReadonlyArray<{ key: ReviewGrade; label: string; color: string }> {
  return lang === "pt-BR"
    ? REVIEW_GRADES.map((g) => ({ ...g, label: REVIEW_GRADE_LABEL_PT[g.key] }))
    : REVIEW_GRADES;
}

/** Retention-health forecast tone: due now, softening, or rock-solid. */
export type ForecastTone = "due" | "soft" | "solid";

/** The forecast bar colors — due borrows the accent, soft/solid the states. */
export const FORECAST_COLOR: Record<ForecastTone, string> = {
  due: "#2f6b4f", // color.accent — surfaced now
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

/** The micro-Socratic aside "Explain" opens on any revealed card. */
export const REVIEW_ASIDE =
  "A 30-second Socratic aside: don’t restate the answer — ask what forces it. Which earlier concept makes this true? Trace one concrete example through and watch where the rule takes it.";

const REVIEW_ASIDE_PT =
  "Uma pausa Socrática de 30 segundos: não repita a resposta — pergunte o que a obriga a ser verdadeira. Que conceito anterior torna isso verdadeiro? Percorra um exemplo concreto e veja até onde a regra leva.";

/** Language-aware micro-Socratic aside. */
export function reviewAside(lang: Language = "en"): string {
  return lang === "pt-BR" ? REVIEW_ASIDE_PT : REVIEW_ASIDE;
}

/** The stages of one card: question → flip → grade, or the fail aside. */
export type RetainStage = "question" | "reveal" | "aside" | "failed";

/** The live state of one Retain session — held by AtlasApp, read by the view. */
export interface RetainSession {
  /** Index of the card on screen, into `retainDeck` rather than `content.cards`. */
  idx: number;
  stage: RetainStage;
  /** Indices into `content.cards` of missed cards sent to the back of the deck,
   *  in the order they were missed. A miss really does come back — but only
   *  once, or a card nobody can answer is a pass with no end. */
  requeued: number[];
  /** Grade recorded per **deck position**, not per card id: a requeued card
   *  comes back under the same id, and keying by id lit its second slot on the
   *  rail with the first answer's colour before it had been answered. */
  done: Record<number, ReviewGrade>;
  /** True once a missed card has flagged its node Shaky on the map. */
  wroteBack: boolean;
  /** True once the queue is cleared — the done-for-today surface. */
  finished: boolean;
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
  | { type: "flip" }
  | { type: "grade"; grade: ReviewGrade }
  | { type: "toggleAside" }
  | { type: "continue" };

/**
 * Today's deck: the budgeted cards, then whichever of them were missed. The
 * requeue is the session's, not the store's — the scheduler has already been
 * told where the card goes next, and this second trip is the learner getting
 * one more honest attempt before the pass ends.
 */
export function retainDeck(session: RetainSession, content: RetainContent): ReviewCard[] {
  if (session.requeued.length === 0) return content.cards;
  return [...content.cards, ...session.requeued.map((i) => content.cards[i])];
}

/** Move to the next card, or finish the queue when it's the last. */
function retainAdvance(
  session: RetainSession,
  done: Record<number, ReviewGrade>,
  content: RetainContent,
): RetainSession {
  const next = session.idx + 1;
  if (next >= retainDeck(session, content).length)
    return { ...session, done, finished: true };
  return { ...session, idx: next, stage: "question", done };
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
      return { ...session, stage: "reveal" };
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
      // A miss doesn't just reschedule — it opens the alive-loop, flags the
      // node Shaky (the write-back happens in AtlasApp) and sends the card to
      // the back of today's deck. Only a card on its *first* trip requeues:
      // `idx` past the budgeted cards is already the second one.
      if (action.grade === "again")
        return {
          ...session,
          stage: "failed",
          done,
          wroteBack: !!card.fails,
          requeued:
            session.idx < content.cards.length
              ? [...session.requeued, session.idx]
              : session.requeued,
        };
      return retainAdvance(session, done, content);
    }
    case "continue":
      // "Schedule re-teach · continue" — leave the fail stage and move on.
      if (session.stage !== "failed") return session;
      return retainAdvance(session, session.done, content);
    default:
      return session;
  }
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
    return `~${left} min restantes · ${total - doneCount} cartões`;
  }
  if (session.finished)
    return over > 0 ? `Budget spent · ${over} waiting` : "Queue clear";
  const { left, total, doneCount } = retainBudget(session, content);
  return `~${left} min left · ${total - doneCount} cards`;
}
