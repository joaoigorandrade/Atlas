// ---- Phase · Recall (unaided retrieval) ------------------------------------
// A blank page and one line telling the learner what to produce. Nothing is on
// screen to lean on, because the signal is what comes back *without* a cue —
// distinct from Feynman's unaided production, which grades whether they can
// explain it to someone. Recall grades only whether it is still there.
//
// The rubric is never shown before the answer. What a learner never thinks to
// write is the finding, and a rubric printed above the box is the answer handed
// over before the test.

import { TeachVerdict } from "./feynman";
import { Language } from "@/lib/i18n";

/** Recall's accent: Retain's cool grey-blue. It is retrieval, the same family
 *  as review, and the palette says so before the copy does. */
export const RECALL_COLOR = {
  accent: "#5a6b86",
  soft: "rgba(90,107,134,0.08)",
  border: "rgba(90,107,134,0.32)",
} as const;

/** One thing a cold retrieval has to bring back. Not something to explain —
 *  something to *have*. */
export interface RecallRow {
  id: string;
  /** The row label in the report. */
  point: string;
  /** What the learner's own words must get across for this to count as
   *  retrieved. Checkable, never "covers it well". */
  mustRetrieve: string[];
}

export interface RecallContent {
  nodeId: string;
  nodeLabel: string;
  /** The one line on the blank page. */
  brief: string;
  /** Offered only when the learner freezes, and never a piece of the answer. */
  scaffold: string;
  rubric: RecallRow[];
}

export interface RecallSession {
  nodeId: string;
  /** What they wrote, from memory. */
  written: string;
  /** True once they have asked for the scaffold — the report says so, because
   *  a cued retrieval is a different reading than an uncued one. */
  cued: boolean;
  /** The judge's reaction to the whole attempt. */
  response: string;
  pending: boolean;
  /** Verdict per rubric row id. Empty until judged. */
  retrieved: Record<string, TeachVerdict>;
  /** Their own words that earned each miss. */
  quotes: Record<string, string>;
  reported: boolean;
}

export function recallStart(nodeId: string): RecallSession {
  return {
    nodeId,
    written: "",
    cued: false,
    response: "",
    pending: false,
    retrieved: {},
    quotes: {},
    reported: false,
  };
}

export type RecallAction =
  | { type: "write"; value: string }
  | { type: "cue" }
  | { type: "pending" }
  | {
      type: "report";
      response: string;
      retrieved: Record<string, TeachVerdict>;
      quotes: Record<string, string>;
    }
  | { type: "again" };

export function recallReducer(
  session: RecallSession,
  action: RecallAction,
): RecallSession {
  switch (action.type) {
    case "write":
      return { ...session, written: action.value };
    case "cue":
      return { ...session, cued: true };
    case "pending":
      return { ...session, pending: true, response: "" };
    case "report":
      return {
        ...session,
        pending: false,
        reported: true,
        response: action.response,
        retrieved: action.retrieved,
        quotes: action.quotes,
      };
    // A second attempt starts from a blank page. Leaving the first answer in
    // the box turns retrieval into an edit of a report they have now read.
    case "again":
      return recallStart(session.nodeId);
    default:
      return session;
  }
}

/** How many rows came back. */
export function recallScore(session: RecallSession, content: RecallContent): number {
  return content.rubric.filter((r) => session.retrieved[r.id] === "good").length;
}

/**
 * Recall's gate: two thirds of the rubric, rounded up.
 *
 * Partial credit is the honest standard for retrieval — memory is graded, not
 * all-or-nothing, and a learner who brings back most of a concept cold has
 * demonstrated the thing this phase measures. Perform's gate is deliberately
 * stricter, because a procedure with one wrong step is a failed run.
 */
export function recallPassed(session: RecallSession, content: RecallContent): boolean {
  if (!content.rubric.length) return session.reported;
  return recallScore(session, content) >= Math.ceil(content.rubric.length * (2 / 3));
}

const RECALL_COPY = {
  en: {
    kicker: "Recall",
    lead: "From memory, with nothing in front of you.",
    yourAnswer: "What you can still produce",
    placeholder: "Write down everything that comes back…",
    passed: "Retrieved cold — that is the signal review is built on.",
    missed: "Some of it did not come back unaided. That is the finding.",
    cuedNote: "Retrieved after a cue — worth re-running cold later.",
    again: "Try it cold again →",
  },
  "pt-BR": {
    kicker: "Recall",
    lead: "De memória, sem nada na sua frente.",
    yourAnswer: "O que você ainda consegue produzir",
    placeholder: "Escreva tudo o que voltar…",
    passed: "Recuperado do zero — é esse o sinal em que a revisão se apoia.",
    missed: "Parte disso não voltou sozinha. Essa é a descoberta.",
    cuedNote: "Recuperado depois de uma dica — vale repetir do zero mais tarde.",
    again: "Tentar do zero de novo →",
  },
} as const;

export function recallCopy(lang: Language = "en") {
  return RECALL_COPY[lang];
}
