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
  accent: "#56657a",
  soft: "rgba(86,101,122,0.08)",
  border: "rgba(86,101,122,0.32)",
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
  /** How much they expect to come back, tapped before the blank page opens
   *  (an index into `CONFIDENCE_FELT`). Absent until tapped. */
  sure?: number;
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
  | { type: "sure"; level: number }
  | { type: "write"; value: string }
  | { type: "cue" }
  | { type: "pending" }
  | {
      type: "report";
      response: string;
      retrieved: Record<string, TeachVerdict>;
      quotes: Record<string, string>;
    };

export function recallReducer(
  session: RecallSession,
  action: RecallAction,
): RecallSession {
  switch (action.type) {
    // Once, and before anything is written: a rating given mid-answer is a
    // rating of the answer so far, not of what they expect to have.
    case "sure":
      if (session.sure !== undefined || session.written) return session;
      return { ...session, sure: action.level };
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
    // There is no "again" here any more. A second attempt straight after the
    // report is an edit of a rubric they have now read; a failed Recall holds
    // for a night instead (`spacing.ts`) and opens on a blank page then.
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
    howSure: "Before you start: how much of it do you expect to bring back?",
    yourAnswer: "What you can still produce",
    placeholder: "Write down everything that comes back…",
    passed: "Retrieved cold — that is the signal review is built on.",
    missed:
      "Some of it did not come back unaided. That is the finding — Recall opens again tomorrow, cold.",
    cuedNote: "Retrieved after a cue — worth re-running cold later.",
  },
  "pt-BR": {
    kicker: "Recall",
    lead: "De memória, sem nada na sua frente.",
    howSure: "Antes de começar: quanto disso você espera trazer de volta?",
    yourAnswer: "O que você ainda consegue produzir",
    placeholder: "Escreva tudo o que voltar…",
    passed: "Recuperado do zero — é esse o sinal em que a revisão se apoia.",
    missed:
      "Parte disso não voltou sozinha. Essa é a descoberta — o Recall abre de novo amanhã, do zero.",
    cuedNote: "Recuperado depois de uma dica — vale repetir do zero mais tarde.",
  },
} as const;

export function recallCopy(lang: Language = "en") {
  return RECALL_COPY[lang];
}
