// ---- Phase · Perform (execution under real conditions) ---------------------
// One real case, carried out end to end, with the work shown. Not "explain the
// procedure" (Feynman) and not "recite its steps" (which is the rehearsal a
// procedure most easily fakes) — the learner runs it, and what is graded is
// what each step actually produced on this case.
//
// Only a `procedure` runs this. A fact is had, a concept is told apart, a
// principle is a mechanism you forecast and walk.

import { TeachVerdict } from "./feynman";
import { Language } from "@/lib/i18n";

/** Perform's accent: a working green — the colour of something being done
 *  rather than discussed. */
export const PERFORM_COLOR = {
  accent: "#4b6b3a",
  soft: "rgba(75,107,58,0.08)",
  border: "rgba(75,107,58,0.32)",
} as const;

/** One thing a correct run on *this* case has to show. Not "understands step
 *  two" — what step two produces here. */
export interface PerformStep {
  id: string;
  /** The step's label in the run report. */
  step: string;
  /** What the learner's work has to show for this step to count as run. */
  mustShow: string[];
  /** True when getting this step wrong invalidates everything after it. The
   *  gate leans on this: a run can omit a check and still be a run. */
  loadBearing: boolean;
}

export interface PerformContent {
  nodeId: string;
  nodeLabel: string;
  /** The concrete case, with its real values — the whole brief. */
  task: string;
  /** The nudge offered only if they stall, never a step of the answer. */
  scaffold: string;
  steps: PerformStep[];
}

export interface PerformSession {
  nodeId: string;
  /** The work, as they showed it. */
  work: string;
  /** True once they have taken the nudge. */
  nudged: boolean;
  /** The checker's read on the whole run. */
  response: string;
  pending: boolean;
  /** Verdict per step id — empty until the run is checked. */
  ran: Record<string, TeachVerdict>;
  /** Their own work that earned each finding. */
  quotes: Record<string, string>;
  reported: boolean;
}

export function performStart(nodeId: string): PerformSession {
  return {
    nodeId,
    work: "",
    nudged: false,
    response: "",
    pending: false,
    ran: {},
    quotes: {},
    reported: false,
  };
}

export type PerformAction =
  | { type: "work"; value: string }
  | { type: "nudge" }
  | { type: "pending" }
  | {
      type: "report";
      response: string;
      ran: Record<string, TeachVerdict>;
      quotes: Record<string, string>;
    }
  | { type: "rerun" };

export function performReducer(
  session: PerformSession,
  action: PerformAction,
): PerformSession {
  switch (action.type) {
    case "work":
      return { ...session, work: action.value };
    case "nudge":
      return { ...session, nudged: true };
    case "pending":
      return { ...session, pending: true, response: "" };
    case "report":
      return {
        ...session,
        pending: false,
        reported: true,
        response: action.response,
        ran: action.ran,
        quotes: action.quotes,
      };
    // A re-run keeps the case and clears the work: running it again is the
    // point, and the case is the same case.
    case "rerun":
      return performStart(session.nodeId);
    default:
      return session;
  }
}

/** Steps whose result is wrong — not merely absent. */
export function performBroken(
  session: PerformSession,
  content: PerformContent,
): PerformStep[] {
  return content.steps.filter((s) => session.ran[s.id] === "confused");
}

/**
 * Perform's gate, and deliberately not Recall's.
 *
 * Retrieval takes partial credit because memory is partial. Execution does
 * not: a run with a wrong intermediate result is a failed run of that step,
 * however much of the rest was right, so *any* wrong step fails — and every
 * load-bearing step must actually have been carried out. A step the learner
 * skipped that nothing downstream depends on (a sanity check, a units note)
 * is a thinner run, not a wrong one, so it is allowed through.
 */
export function performPassed(session: PerformSession, content: PerformContent): boolean {
  if (!content.steps.length) return session.reported;
  if (performBroken(session, content).length) return false;
  return content.steps
    .filter((s) => s.loadBearing)
    .every((s) => session.ran[s.id] === "good");
}

const PERFORM_COPY = {
  en: {
    kicker: "Perform",
    lead: "Carry it out on this case, the way you would for real.",
    theCase: "The case",
    yourWork: "Your work",
    placeholder: "Work it through — show each step and what it gives you…",
    passed: "Executed under real conditions — the procedure is yours.",
    brokeAt: "The run breaks at a step. A wrong result is a failed run of it.",
    thin: "A load-bearing step was never carried out.",
    rerun: "Run it again →",
  },
  "pt-BR": {
    kicker: "Perform",
    lead: "Execute neste caso, do jeito que você faria de verdade.",
    theCase: "O caso",
    yourWork: "Sua execução",
    placeholder: "Resolva — mostre cada passo e o que ele produz…",
    passed: "Executado em condições reais — o procedimento é seu.",
    brokeAt: "A execução quebra num passo. Resultado errado é passo falhado.",
    thin: "Um passo essencial não chegou a ser executado.",
    rerun: "Executar de novo →",
  },
} as const;

export function performCopy(lang: Language = "en") {
  return PERFORM_COPY[lang];
}
