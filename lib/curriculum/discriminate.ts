// ---- Phase · Discriminate (the boundary) -----------------------------------
// Case by case: is this an instance of the concept, and if not, which
// neighbour is it? A concept IS a classification, so telling instances from
// near-misses is not a warm-up for the ladder — it is the thing being learned,
// which is why it sits directly behind the reading.
//
// Every case is committed before it is revealed. A learner who can see the
// verdict while choosing is doing recognition, which is the one thing a
// boundary test may not measure.

import { Language } from "@/lib/i18n";

/** Discriminate's accent: a boundary-drawing slate blue. */
export const DISCRIMINATE_COLOR = {
  accent: "#4f6f8f",
  soft: "rgba(79,111,143,0.08)",
  border: "rgba(79,111,143,0.32)",
} as const;

/** One candidate case, described without naming any concept. */
export interface DiscriminateCase {
  id: string;
  /** The case itself — a situation, not a question. */
  candidate: string;
  /** Candidate readings: the right one, plus the neighbours really confused
   *  with it. Never "none of the above". */
  readings: string[];
  answerIndex: number;
  /** The feature present or missing that decides THIS case. Revealed only
   *  after the commit. */
  decidedBy: string;
  /** True when the case is genuinely an instance — the report separates
   *  "called a non-instance an instance" from the reverse, because they are
   *  different errors. */
  isInstance: boolean;
}

export interface DiscriminateContent {
  nodeId: string;
  nodeLabel: string;
  /** The question asked of every case, so it is asked once rather than per
   *  case — the cases vary, the question does not. */
  ask: string;
  cases: DiscriminateCase[];
}

export interface DiscriminateSession {
  nodeId: string;
  /** Which case is open; equal to `cases.length` when the run is finished. */
  index: number;
  /** Committed reading per case id. A case with one is answered. */
  calls: Record<string, number>;
  /** The judge's one-line read when the call came in the learner's own words. */
  reads: Record<string, string>;
  done: boolean;
}

export function discriminateStart(nodeId: string): DiscriminateSession {
  return { nodeId, index: 0, calls: {}, reads: {}, done: false };
}

export type DiscriminateAction =
  { type: "call"; index: number; read?: string } | { type: "next" };

export function discriminateReducer(
  session: DiscriminateSession,
  action: DiscriminateAction,
  content: DiscriminateContent,
): DiscriminateSession {
  const item = content.cases[session.index];
  switch (action.type) {
    case "call": {
      // One call per case. Re-calling would let a learner cycle the readings
      // until the reveal turns green, which is not a boundary test.
      if (!item || session.calls[item.id] !== undefined) return session;
      return {
        ...session,
        calls: { ...session.calls, [item.id]: action.index },
        ...(action.read ? { reads: { ...session.reads, [item.id]: action.read } } : {}),
      };
    }
    case "next": {
      if (!item || session.calls[item.id] === undefined) return session;
      const index = session.index + 1;
      return { ...session, index, done: index >= content.cases.length };
    }
    default:
      return session;
  }
}

export function discriminateScore(
  session: DiscriminateSession,
  content: DiscriminateContent,
): number {
  return content.cases.filter((c) => session.calls[c.id] === c.answerIndex).length;
}

/** Cases wrongly waved through as instances — the over-inclusive error, and
 *  the one a learner who memorised the definition actually makes. */
export function discriminateFalsePositives(
  session: DiscriminateSession,
  content: DiscriminateContent,
): DiscriminateCase[] {
  return content.cases.filter(
    (c) =>
      !c.isInstance &&
      session.calls[c.id] !== undefined &&
      session.calls[c.id] !== c.answerIndex,
  );
}

/**
 * Discriminate's gate: two thirds of the cases, and no more than one
 * over-inclusive miss.
 *
 * The second clause is the phase's own standard. A learner who calls every
 * case an instance scores whatever fraction of the run happens to be
 * instances — by luck, not by the boundary — and waving near-misses through is
 * precisely the failure this phase exists to catch.
 */
export function discriminatePassed(
  session: DiscriminateSession,
  content: DiscriminateContent,
): boolean {
  if (!content.cases.length) return session.done;
  const enough =
    discriminateScore(session, content) >= Math.ceil(content.cases.length * (2 / 3));
  return enough && discriminateFalsePositives(session, content).length <= 1;
}

const DISCRIMINATE_COPY = {
  en: {
    kicker: "Discriminate",
    lead: "Where does this concept stop and the next one start?",
    theCase: "The case",
    decidedBy: "What decides it",
    passed: "You can tell it from its neighbours. That is what having it means.",
    missed: "The boundary is still soft in places. The reasons above say where.",
    overIncluded:
      "You waved near-misses through — that is the boundary, not the definition.",
    next: "Next case →",
  },
  "pt-BR": {
    kicker: "Discriminate",
    lead: "Onde esse conceito termina e o vizinho começa?",
    theCase: "O caso",
    decidedBy: "O que decide",
    passed: "Você distingue isso dos vizinhos. É isso que significa ter o conceito.",
    missed: "A fronteira ainda está solta em alguns pontos. Os motivos acima dizem onde.",
    overIncluded:
      "Você deixou passar casos que só parecem. É aí que está a fronteira, não na definição.",
    next: "Próximo caso →",
  },
} as const;

export function discriminateCopy(lang: Language = "en") {
  return DISCRIMINATE_COPY[lang];
}
