import { color } from "@/lib/theme";
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
  accent: color.phasePerform,
  soft: "rgba(var(--phase-perform),.08)",
  border: "rgba(var(--phase-perform),.32)",
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
  /** The steps the previous run broke at, quoted on the re-run's report
   *  (W1.4). Absent on a first run, and on every session saved before it. */
  previous?: string[];
  /** Set once a failed run is being fixed in place: the steps it broke at.
   *  One fix per case — a second failure gets a new case. Absent on every
   *  session saved before it. */
  fixing?: string[];
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
      /** True on the streamed verdict frame: the report shows while the
       *  checker's comment is still being written. */
      pending?: boolean;
    }
  | { type: "stream"; text: string }
  | { type: "fix"; steps: string[] }
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
        pending: !!action.pending,
        reported: true,
        response: action.response,
        ran: action.ran,
        quotes: action.quotes,
      };
    case "stream":
      return { ...session, response: action.text };
    // Fixing keeps the case and the work, and clears the report: the learner
    // corrects the broken steps and submits again. The quotes stay so the view
    // can put the cursor on the line the report already pointed at.
    case "fix":
      return {
        ...session,
        pending: false,
        reported: false,
        response: "",
        ran: {},
        fixing: action.steps,
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

/** How many steps a run may leave out and still pass. */
export const PERFORM_SKIP_ALLOWANCE = 2;

/** Steps the run never carried out — absent, not wrong. */
export function performSkipped(
  session: PerformSession,
  content: PerformContent,
): PerformStep[] {
  return content.steps.filter((s) => !session.ran[s.id] || session.ran[s.id] === "skipped");
}

/**
 * Perform's gate. Only a mistake fails: any step carried out with a wrong
 * result is a failed run. A right run that leaves out one or two steps
 * passes (ponytail: flat allowance; scale it with step count if 6-step runs
 * prove too loose), as long as something was actually run.
 */
export function performPassed(session: PerformSession, content: PerformContent): boolean {
  if (!content.steps.length) return session.reported;
  if (performBroken(session, content).length) return false;
  if (!content.steps.some((s) => session.ran[s.id] === "good")) return false;
  return performSkipped(session, content).length <= PERFORM_SKIP_ALLOWANCE;
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
    thin: "Too much of the run is missing.",
    steps: "The steps",
    rerun: "Run it again →",
    fix: "Fix it on this case →",
    fixing: (steps: string) => `Fix what broke, then submit again: ${steps}.`,
    lastBroke: (steps: string) => `A new case. Last run broke at: ${steps}.`,
  },
  "pt-BR": {
    kicker: "Perform",
    lead: "Execute neste caso, do jeito que você faria de verdade.",
    theCase: "O caso",
    yourWork: "Sua execução",
    placeholder: "Resolva — mostre cada passo e o que ele produz…",
    passed: "Executado em condições reais — o procedimento é seu.",
    brokeAt: "A execução quebra num passo. Resultado errado é passo falhado.",
    thin: "Falta muito da execução.",
    steps: "Os passos",
    rerun: "Executar de novo →",
    fix: "Corrigir neste caso →",
    fixing: (steps: string) => `Corrija o que quebrou e envie de novo: ${steps}.`,
    lastBroke: (steps: string) => `Um caso novo. A última execução quebrou em: ${steps}.`,
  },
} as const;

export function performCopy(lang: Language = "en") {
  return PERFORM_COPY[lang];
}
