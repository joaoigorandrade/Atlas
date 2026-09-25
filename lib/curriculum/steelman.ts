// ---- Phase · Steelman (holding a contested position) ------------------------
// A question honest readers disagree about, and both answers. The learner
// builds the strongest case for EACH side — including the one they reject —
// then says which they hold and what would change their mind.
//
// The signal no other phase extracts. Socratic reasons toward an answer;
// Crucible transfers one; Feynman explains one. All three assume there IS one.
// In an interpretive domain the defining competence is the opposite: carrying
// a live disagreement without collapsing it into the side you already prefer.
//
// The disconfirmer is the gate, not decoration. "What would change my mind"
// separates a position from an allegiance, and a learner who cannot name one
// has not held the question open — they have picked.

import { Language } from "@/lib/i18n";

/** Steelman's accent: a contested indigo. */
export const STEELMAN_COLOR = {
  accent: "#4d5b94",
  soft: "rgba(77,91,148,0.08)",
  border: "rgba(77,91,148,0.32)",
} as const;

/** One side of the question, named by who actually held it — a position with
 *  no holders is a strawman with better manners. */
export interface SteelmanPosition {
  id: string;
  label: string;
  heldBy: string;
  /** The load-bearing points a genuinely strong version of this side makes.
   *  Never shown before the learner writes — they are the rubric. */
  mustCover: string[];
}

export interface SteelmanContent {
  nodeId: string;
  nodeLabel: string;
  /** The contested question, stated so that neither side is the default. */
  question: string;
  /** Exactly two: a question with one defensible answer is not contested. */
  positions: [SteelmanPosition, SteelmanPosition];
}

/** How well the learner's case for one side stood it up. */
export const STEELMAN_VERDICTS = ["strong", "thin", "strawman"] as const;
export type SteelmanVerdict = (typeof STEELMAN_VERDICTS)[number];

export interface SteelmanSession {
  nodeId: string;
  /** The learner's case for each position, by position id. */
  cases: Record<string, string>;
  /** Which side they hold, once both cases are written. */
  holds?: string;
  /** What would change their mind. */
  disconfirmer?: string;
  /** The judge's ruling per position id, and its written read. */
  verdicts: Record<string, SteelmanVerdict>;
  response?: string;
  done: boolean;
}

export function steelmanStart(nodeId: string): SteelmanSession {
  return { nodeId, cases: {}, verdicts: {}, done: false };
}

export type SteelmanAction =
  | { type: "write"; positionId: string; text: string }
  | { type: "hold"; positionId: string; disconfirmer: string }
  | {
      type: "judged";
      verdicts: Record<string, SteelmanVerdict>;
      response: string;
    };

export function steelmanReducer(
  session: SteelmanSession,
  action: SteelmanAction,
): SteelmanSession {
  switch (action.type) {
    case "write":
      return {
        ...session,
        cases: { ...session.cases, [action.positionId]: action.text },
      };
    case "hold":
      return {
        ...session,
        holds: action.positionId,
        disconfirmer: action.disconfirmer,
      };
    case "judged":
      return {
        ...session,
        verdicts: action.verdicts,
        response: action.response,
        done: true,
      };
    default:
      return session;
  }
}

/** Both cases written, with enough in each to be worth judging. Below this the
 *  judge is being asked to rule on a blank page. */
export function steelmanReady(
  session: SteelmanSession,
  content: SteelmanContent,
): boolean {
  return content.positions.every((p) => (session.cases[p.id] ?? "").trim().length >= 40);
}

/**
 * Steelman's gate: neither side came out a strawman, at most one came out
 * thin, and the learner named a real disconfirmer.
 *
 * The strawman clause is the phase's own standard. Scoring both sides together
 * would let a learner write a superb case for their own view, a shrug for the
 * other, and pass on the average — which is exactly the habit this phase
 * exists to break, so the weak side is judged on its own terms.
 */
export function steelmanPassed(
  session: SteelmanSession,
  content: SteelmanContent,
): boolean {
  const rulings = content.positions.map((p) => session.verdicts[p.id]);
  if (rulings.some((v) => v === undefined)) return false;
  if (rulings.some((v) => v === "strawman")) return false;
  if (rulings.filter((v) => v === "thin").length > 1) return false;
  return (session.disconfirmer ?? "").trim().length >= 15;
}

/** Exported so `tests/i18nCoverage.test.ts` can hold both halves against
 *  each other — a table outside its component is one this suite covers. */
export const STEELMAN_COPY = {
  en: {
    kicker: "Steelman",
    lead: "Both sides, at full strength — then say where you stand.",
    theQuestion: "The question",
    heldBy: "Held by",
    writeFor: "The strongest case for",
    whichHolds: "Which do you hold?",
    disconfirmer: "What would change your mind?",
    disconfirmerHint: "Name something that could actually happen or be found.",
    strong: "Stood up",
    thin: "Thin",
    strawman: "A strawman",
    passed: "You held it open. That is a position, not an allegiance.",
    missed: "One side did not get its best case. The reads above say which.",
    noDisconfirmer:
      "Without something that would change your mind, you picked rather than judged.",
  },
  "pt-BR": {
    kicker: "Steelman",
    lead: "Os dois lados, na versão mais forte — depois diga onde você fica.",
    theQuestion: "A questão",
    heldBy: "Defendido por",
    writeFor: "O argumento mais forte a favor de",
    whichHolds: "Com qual você fica?",
    disconfirmer: "O que faria você mudar de ideia?",
    disconfirmerHint: "Aponte algo que poderia de fato acontecer ou ser descoberto.",
    strong: "Sustentou",
    thin: "Fraco",
    strawman: "Um espantalho",
    passed: "Você manteve a questão aberta. Isso é uma posição, não uma torcida.",
    missed:
      "Um dos lados não recebeu seu melhor argumento. As leituras acima dizem qual.",
    noDisconfirmer:
      "Sem algo que faria você mudar de ideia, você escolheu em vez de julgar.",
  },
} as const;

export function steelmanCopy(lang: Language = "en") {
  return STEELMAN_COPY[lang];
}
