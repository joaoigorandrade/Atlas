// ---- The recite engine · Recall and Perform --------------------------------
// A blank page, a brief, and a rubric the learner never sees. They produce the
// thing from nothing; the judge diffs what they produced against the rubric.
//
// Two phases share this, because their *interaction* is the same one and only
// their brief differs — which is exactly where the difference belongs:
//
//   recall   unaided retrieval        "write down everything you know"
//   perform  execution under real     "carry the procedure out on this case"
//            conditions
//
// Feynman is the third surface of this shape and deliberately not folded in:
// it owns a per-beat "fix this" micro-pass, a second-pass delta, and gap
// sub-nodes written back to the map. Recite has none of those — it is the
// cheap end of the family, which is the whole reason `recall` was the first
// of the six new phases to build.

import { TeachVerdict } from "./feynman";
import { PhaseId } from "./phases";
import { Language } from "@/lib/i18n";

/** The phases this engine runs, as a subset of `PhaseId` — so a session can
 *  carry which one it is and one view can title itself correctly.
 *
 *  Only phases that are *built* appear here, for the same reason `PHASE_ORDER`
 *  holds only built phases: a member with no plan, no prompt and no screen
 *  behind it is a type that lies. `perform` joins this list in the release
 *  that implements it, and everything keyed on it — the colour, the copy, the
 *  prompt brief, the judge frame — is a `Record<RecitePhase, …>`, so
 *  TypeScript names every one of them on the day. */
export const RECITE_PHASES = ["recall"] as const;
export type RecitePhase = (typeof RECITE_PHASES)[number];

export function isRecitePhase(phase: PhaseId): phase is RecitePhase {
  return (RECITE_PHASES as readonly string[]).includes(phase);
}

/** Per-phase accent. Recall borrows Retain's cool grey-blue: it is retrieval,
 *  the same family as review. */
export const RECITE_COLOR: Record<RecitePhase, { accent: string; soft: string }> = {
  recall: { accent: "#5a6b86", soft: "rgba(90,107,134,0.08)" },
};

/** One rubric row — what a complete answer has to contain. Never shown before
 *  the learner submits: the finding is what they never thought to write. */
export interface ReciteRow {
  id: string;
  /** The row label in the report. */
  point: string;
  /** What the learner's own words must get across for this row to count. */
  mustConvey: string[];
}

/** One node's recite pass, as generated. */
export interface ReciteContent {
  nodeId: string;
  nodeLabel: string;
  /** The brief on the blank page — the one line that says what to produce. */
  brief: string;
  /** Offered only when the learner freezes, never up front. */
  scaffold: string;
  rubric: ReciteRow[];
}

/** The live state of one recite pass. */
export interface ReciteSession {
  nodeId: string;
  phase: RecitePhase;
  /** What the learner wrote. */
  answer: string;
  /** True once they have asked for the scaffold. */
  scaffolded: boolean;
  /** The judge's reaction to the whole answer. */
  response: string;
  /** The reaction is still being written. */
  pending: boolean;
  /** Verdict per rubric row id — empty until the answer is judged. */
  verdicts: Record<string, TeachVerdict>;
  /** The learner's own words that earned each miss. */
  quotes: Record<string, string>;
  /** True once the report is on screen. */
  reported: boolean;
}

export function reciteStart(nodeId: string, phase: RecitePhase): ReciteSession {
  return {
    nodeId,
    phase,
    answer: "",
    scaffolded: false,
    response: "",
    pending: false,
    verdicts: {},
    quotes: {},
    reported: false,
  };
}

export type ReciteAction =
  | { type: "write"; value: string }
  | { type: "scaffold" }
  | { type: "pending" }
  | { type: "draft"; response: string }
  | {
      type: "report";
      response: string;
      verdicts: Record<string, TeachVerdict>;
      quotes: Record<string, string>;
    }
  | { type: "again" };

export function reciteReducer(
  session: ReciteSession,
  action: ReciteAction,
): ReciteSession {
  switch (action.type) {
    case "write":
      return { ...session, answer: action.value };
    case "scaffold":
      return { ...session, scaffolded: true };
    case "pending":
      return { ...session, pending: true, response: "" };
    case "draft":
      return { ...session, response: action.response };
    case "report":
      return {
        ...session,
        pending: false,
        reported: true,
        response: action.response,
        verdicts: action.verdicts,
        quotes: action.quotes,
      };
    // A second attempt keeps nothing but the blank page: the point of the
    // phase is production from nothing, and leaving the first answer in the
    // box turns the retry into an edit.
    case "again":
      return reciteStart(session.nodeId, session.phase);
    default:
      return session;
  }
}

/** How many rows landed. */
export function reciteScore(session: ReciteSession, content: ReciteContent): number {
  return content.rubric.filter((r) => session.verdicts[r.id] === "good").length;
}

/**
 * Did the pass close its rung?
 *
 * Two thirds of the rubric, rounded up — the same standard the Crucible sets
 * for a transfer attempt. A miss is diagnostic, not a wall: the report names
 * every row, and the learner can write it again.
 */
export function recitePassed(session: ReciteSession, content: ReciteContent): boolean {
  if (!content.rubric.length) return session.reported;
  return reciteScore(session, content) >= Math.ceil(content.rubric.length * (2 / 3));
}

const RECITE_COPY = {
  en: {
    recall: {
      kicker: "Recall",
      lead: "From memory, with nothing in front of you.",
      passed: "Retrieved cold — that is the signal review is built on.",
      missed: "Some of it did not come back unaided. That is the finding.",
    },
  },
  "pt-BR": {
    recall: {
      kicker: "Recall",
      lead: "De memória, sem nada na sua frente.",
      passed: "Recuperado do zero — é esse o sinal em que a revisão se apoia.",
      missed: "Parte disso não voltou sozinha. Essa é a descoberta.",
    },
  },
} as const;

/** The phase's own framing copy, in the learner's language. */
export function reciteCopy(phase: RecitePhase, lang: Language = "en") {
  return RECITE_COPY[lang][phase];
}
