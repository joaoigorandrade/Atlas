// The review card's vocabulary: its kinds, Anki's three queues, the grade
// buttons, and which cards are the Retain factory's own. Split from
// `retain.ts`, which keeps the session engine.
import { color } from "@/lib/theme";
import { STATE_COLOR } from "./types";
import { Language } from "@/lib/i18n";

/** The three card kinds — review isn't only fill-in-the-blank. */
export type ReviewCardType = "recall" | "why" | "apply";

/** Each type's label + accent (recall = learning, why = Connect, apply = Crucible). */
export const REVIEW_TYPE_META: Record<ReviewCardType, { label: string; color: string }> =
  {
    recall: { label: "Recall", color: STATE_COLOR.learning },
    why: { label: "Explain why", color: color.phaseConnect },
    apply: { label: "Application", color: color.phaseCrucible },
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

/** Anki's three queues: never seen, on its learning steps, graduated. */
export type ReviewQueue = "new" | "learning" | "review";

/** The queue counts' colours, in Anki's order and Anki's sense: new is blue,
 *  learning is red, review is green — borrowed from the states that echo them. */
export const QUEUE_COLOR: Record<ReviewQueue, string> = {
  new: STATE_COLOR.learning,
  learning: STATE_COLOR.gap,
  review: STATE_COLOR.mastered,
};

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

/** The micro-Socratic aside "Explain" opens on any revealed card. */
export const REVIEW_ASIDE =
  "A 30-second Socratic aside: don’t restate the answer — ask what forces it. Which earlier concept makes this true? Trace one concrete example through and watch where the rule takes it.";

const REVIEW_ASIDE_PT =
  "Uma pausa Socrática de 30 segundos: não repita a resposta — pergunte o que a obriga a ser verdadeira. Que conceito anterior torna isso verdadeiro? Percorra um exemplo concreto e veja até onde a regra leva.";

/** Language-aware micro-Socratic aside. */
export function reviewAside(lang: Language = "en"): string {
  return lang === "pt-BR" ? REVIEW_ASIDE_PT : REVIEW_ASIDE;
}
