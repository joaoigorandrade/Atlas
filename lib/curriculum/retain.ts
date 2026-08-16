// ---- Phase 6 · Retain (Review queue / FSRS) — the daily spine -------------
// Keep mastered knowledge alive with optimally-spaced retrieval. This is the
// habit surface — designed for adherence as much as scheduling. Cards are
// auto-generated from the earlier phases (the tedious step humans skip):
// atomic, cloze where apt, varied by type (recall / explain-why / application).
// The queue is honest — framed in *minutes* against the daily target, never a
// wall of cards — and one card shows at a time: confidence tap (the calibration
// hook), flip, grade (feeds FSRS). The alive-loop is the difference from "Anki
// plus a chatbot": a missed card doesn't just reschedule — it triggers a
// 30-second Socratic re-explanation right there and flags its node Shaky on the
// map, so retention failure re-enters Phase 1. Content ships the Linear
// Transformations rotation of cards so the tap → flip → grade → alive-loop is
// real, not decorative.
import { CONNECT_COLOR } from "./connect";
import { CRUCIBLE_COLOR } from "./crucible";
import { STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

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

/** The pre-flip confidence tap — the calibration hook, least → most solid. */
export const REVIEW_CONFIDENCE = ["Blank", "Shaky", "Solid"] as const;
export type ReviewConfidence = 0 | 1 | 2;

const REVIEW_CONFIDENCE_PT = ["Em branco", "Instável", "Sólido"] as const;

/** Language-aware pre-flip confidence tap labels. */
export function reviewConfidenceLabels(lang: Language = "en"): readonly string[] {
  return lang === "pt-BR" ? REVIEW_CONFIDENCE_PT : REVIEW_CONFIDENCE;
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

/** The stages of one card: confidence tap → flip → grade, or the fail aside. */
export type RetainStage = "confidence" | "reveal" | "aside" | "failed";

/** The live state of one Retain session — held by AtlasApp, read by the view. */
export interface RetainSession {
  /** Index of the card on screen. */
  idx: number;
  stage: RetainStage;
  /** Confidence tapped before the flip (the calibration hook). */
  conf: ReviewConfidence | null;
  /** Grade recorded per card id — drives the honest-queue progress + budget. */
  done: Record<string, ReviewGrade>;
  /** True once a missed card has flagged its node Shaky on the map. */
  wroteBack: boolean;
  /** True once the queue is cleared — the done-for-today surface. */
  finished: boolean;
}

export function retainStart(): RetainSession {
  return {
    idx: 0,
    stage: "confidence",
    conf: null,
    done: {},
    wroteBack: false,
    finished: false,
  };
}

export type RetainAction =
  | { type: "confidence"; level: ReviewConfidence }
  | { type: "grade"; grade: ReviewGrade }
  | { type: "toggleAside" }
  | { type: "continue" };

/** Move to the next card, or finish the queue when it's the last. */
function retainAdvance(
  session: RetainSession,
  done: Record<string, ReviewGrade>,
  content: RetainContent,
): RetainSession {
  const next = session.idx + 1;
  if (next >= content.cards.length) return { ...session, done, finished: true };
  return { ...session, idx: next, stage: "confidence", conf: null, done };
}

/**
 * The review engine, as a pure transition. Confidence flips the card; a grade
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
    case "confidence":
      if (session.stage !== "confidence") return session;
      return { ...session, conf: action.level, stage: "reveal" };
    case "toggleAside":
      if (session.stage !== "reveal" && session.stage !== "aside") return session;
      return {
        ...session,
        stage: session.stage === "aside" ? "reveal" : "aside",
      };
    case "grade": {
      if (session.stage !== "reveal" && session.stage !== "aside") return session;
      const card = content.cards[session.idx];
      const done = { ...session.done, [card.id]: action.grade };
      // A miss doesn't just reschedule — it opens the alive-loop and flags the
      // node Shaky (the write-back happens in AtlasApp).
      if (action.grade === "again")
        return { ...session, stage: "failed", done, wroteBack: !!card.fails };
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

/** The card on screen (clamped to the generated deck). */
export function reviewCard(session: RetainSession, content: RetainContent): ReviewCard {
  return content.cards[Math.min(session.idx, content.cards.length - 1)];
}

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
  const total = Math.max(1, content.cards.length);
  const doneCount = session.finished ? total : Object.keys(session.done).length;
  const perCard = content.budgetMin / total;
  const spent = Math.round(doneCount * perCard);
  const left = Math.max(0, content.budgetMin - spent);
  const pct = Math.min(100, Math.round((spent / content.budgetMin) * 100));
  return { doneCount, total, spent, left, pct };
}

/** The header queue chip — time and cards left, or "Queue clear". */
export function retainQueueLabel(
  session: RetainSession,
  content: RetainContent,
  lang: Language = "en",
): string {
  if (lang === "pt-BR") {
    if (session.finished) return "Fila limpa";
    const { left, total, doneCount } = retainBudget(session, content);
    return `~${left} min restantes · ${total - doneCount} cartões`;
  }
  if (session.finished) return "Queue clear";
  const { left, total, doneCount } = retainBudget(session, content);
  return `~${left} min left · ${total - doneCount} cards`;
}

/**
 * The failure calibration read-back: the confidence tap held against the miss.
 * A "Solid" tap that then missed is the overconfidence Review exists to catch.
 */
export function retainCalib(session: RetainSession, lang: Language = "en"): string {
  if (session.stage !== "failed") return "";
  if (lang === "pt-BR") {
    if (session.conf === 2)
      return "Você tocou “Sólido” antes de virar — e errou. Esse excesso de confiança é exatamente o sinal que a Revisão existe para pegar.";
    if (session.conf === 0)
      return "Você sinalizou em branco, e estava certo. Bem calibrado — agora vamos fechar isso de verdade.";
    return "Você se sentiu instável, e estava. O cartão volta para o início da fila e o nó reentra no ciclo.";
  }
  if (session.conf === 2)
    return "You tapped “Solid” before flipping — and missed it. That over-confidence is the exact signal Review is built to catch.";
  if (session.conf === 0)
    return "You flagged it blank, and it was. Well-calibrated — now let’s close it for real.";
  return "You felt shaky, and it was. The card goes back to the front of the queue and the node re-enters the loop.";
}
