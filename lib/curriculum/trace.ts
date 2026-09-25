// ---- Phase · Trace (following a mechanism step by step) --------------------
// One case, walked stage by stage: given where it has got to, what does this
// stage hand the next? The links of a single chain, in order — not independent
// items that happen to be about the same concept.
//
// The chain is why this is its own phase and its own surface. What an answered
// stage established stays on screen, because it is the input to the next one,
// and a broken link stops the walk: everything after a stage you got wrong is
// being carried forward from the wrong place, so the run reports where it
// broke rather than a bare score.

import { Language } from "@/lib/i18n";

/** Trace's accent: a following-the-thread teal. */
export const TRACE_COLOR = {
  accent: "#3d6e62",
  soft: "rgba(61,110,98,0.08)",
  border: "rgba(61,110,98,0.32)",
} as const;

/** One link of the chain. */
export interface TraceStage {
  id: string;
  /** Where the case has got to — what the previous stage produced. */
  reached: string;
  /** Candidate next stages: the right one, plus a skipped stage, a reversed
   *  pair, or a quantity carried forward that the last stage changed. */
  nexts: string[];
  answerIndex: number;
  /** What this stage consumes, what it produces, and what would break if it
   *  ran out of order. Revealed after the commit. */
  handsOn: string;
}

export interface TraceContent {
  nodeId: string;
  nodeLabel: string;
  /** The one running case the whole chain walks. */
  scenario: string;
  stages: TraceStage[];
}

export interface TraceSession {
  nodeId: string;
  index: number;
  /** Committed next-stage per stage id. */
  walked: Record<string, number>;
  /** The judge's one-line read when the answer came in their own words. */
  reads: Record<string, string>;
  done: boolean;
}

export function traceStart(nodeId: string): TraceSession {
  return { nodeId, index: 0, walked: {}, reads: {}, done: false };
}

export type TraceAction =
  { type: "step"; index: number; read?: string } | { type: "next" };

export function traceReducer(
  session: TraceSession,
  action: TraceAction,
  content: TraceContent,
): TraceSession {
  const item = content.stages[session.index];
  switch (action.type) {
    case "step": {
      if (!item || session.walked[item.id] !== undefined) return session;
      return {
        ...session,
        walked: { ...session.walked, [item.id]: action.index },
        ...(action.read ? { reads: { ...session.reads, [item.id]: action.read } } : {}),
      };
    }
    case "next": {
      if (!item || session.walked[item.id] === undefined) return session;
      const index = session.index + 1;
      return { ...session, index, done: index >= content.stages.length };
    }
    default:
      return session;
  }
}

export function traceScore(session: TraceSession, content: TraceContent): number {
  return content.stages.filter((s) => session.walked[s.id] === s.answerIndex).length;
}

/**
 * Where the chain first broke — the index of the earliest wrong stage, or -1.
 *
 * The first break is the one that matters: every stage after it was answered
 * from a position the learner had already left, so a run that breaks at stage
 * two and recovers at stage four has not walked the chain, it has re-joined it.
 */
export function traceBreak(session: TraceSession, content: TraceContent): number {
  return content.stages.findIndex(
    (s) => session.walked[s.id] !== undefined && session.walked[s.id] !== s.answerIndex,
  );
}

/**
 * Trace's gate, and not a score threshold: the chain has to hold from the
 * start. The learner must walk at least the first two thirds of it unbroken.
 *
 * A fraction-correct gate would pass a run that broke at the first link and
 * guessed the rest, which is the opposite of following a mechanism.
 */
export function tracePassed(session: TraceSession, content: TraceContent): boolean {
  if (!content.stages.length) return session.done;
  const brokeAt = traceBreak(session, content);
  const unbroken = brokeAt < 0 ? content.stages.length : brokeAt;
  return unbroken >= Math.ceil(content.stages.length * (2 / 3));
}

const TRACE_COPY = {
  en: {
    kicker: "Trace",
    lead: "One stage at a time. What does this one hand the next?",
    scenario: "The case",
    soFar: "The chain so far",
    reached: "Where it has got to",
    handsOn: "What this stage hands on",
    passed: "You can walk it end to end. The chain is yours, not just its ends.",
    brokeAt: (n: number) =>
      `The chain breaks at stage ${n}. Everything after it was carried forward from there.`,
    next: "Next stage →",
  },
  "pt-BR": {
    kicker: "Trace",
    lead: "Um estágio por vez. O que este entrega ao próximo?",
    scenario: "O caso",
    soFar: "A cadeia até aqui",
    reached: "Onde chegou",
    handsOn: "O que este estágio entrega",
    passed: "Você percorre de ponta a ponta. A cadeia é sua, não só as pontas.",
    brokeAt: (n: number) =>
      `A cadeia quebra no estágio ${n}. Tudo depois disso partiu dali.`,
    next: "Próximo estágio →",
  },
} as const;

export function traceCopy(lang: Language = "en") {
  return TRACE_COPY[lang];
}
