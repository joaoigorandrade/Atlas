// ---- Phase · Produce (real-time production) ---------------------------------
// The learner says it. Out loud, unscripted, against the clock.
//
// The signal no other phase extracts. Feynman is unaided production too, but of
// an EXPLANATION, in whatever language the learner already has, graded on
// content. Drill is fast but closed. Perform runs a procedure on a case. None
// of them measures whether the learner can generate the target form live, which
// in a performative domain is the entire competence — and is why `performative`
// takes Socratic, Feynman and Crucible off the ladder to make room for this.
//
// The verdict that earns the phase is `thin`: understood, but the learner
// routed around the form they were unsure of. Avoidance reads as success in
// every other phase and in most conversations, which is exactly how a speaker
// fossilizes at "good enough" — so it is counted, and capped, here.

import { Language } from "@/lib/i18n";

/** Produce's accent: a spoken terracotta. */
export const PRODUCE_COLOR = {
  accent: "#b06a45",
  soft: "rgba(176,106,69,0.08)",
  border: "rgba(176,106,69,0.32)",
} as const;

export interface ProduceTurn {
  id: string;
  /** What to say, written in the LEARNER'S language so that reading the cue is
   *  never itself the test. */
  cue: string;
  /** The forms this turn exists to elicit. The learner never sees them — they
   *  are what `thin` is measured against. */
  targetForms: string[];
  /** How long they get. Short on purpose: production under time pressure is
   *  the signal, and an unbounded turn becomes a writing exercise. */
  seconds: number;
}

export interface ProduceContent {
  nodeId: string;
  nodeLabel: string;
  /** One sentence setting the situation all the turns happen inside. */
  scene: string;
  turns: ProduceTurn[];
}

/**
 * `good` — understood, and the target form was used.
 * `thin` — understood, but the target form was avoided.
 * `wrong` — not comprehensible, or the form was used incorrectly.
 */
export const PRODUCE_VERDICTS = ["good", "thin", "wrong"] as const;
export type ProduceVerdict = (typeof PRODUCE_VERDICTS)[number];

export interface ProduceSession {
  nodeId: string;
  /** Which turn is open; equal to `turns.length` when the run is finished. */
  index: number;
  /** What the learner actually said, per turn id, as dictation transcribed it. */
  saidBy: Record<string, string>;
  verdicts: Record<string, ProduceVerdict>;
  /** The judge's one-line read per turn. */
  reads: Record<string, string>;
  done: boolean;
}

export function produceStart(nodeId: string): ProduceSession {
  return { nodeId, index: 0, saidBy: {}, verdicts: {}, reads: {}, done: false };
}

export type ProduceAction =
  | { type: "said"; text: string }
  | { type: "judged"; verdict: ProduceVerdict; read: string }
  | { type: "next" };

export function produceReducer(
  session: ProduceSession,
  action: ProduceAction,
  content: ProduceContent,
): ProduceSession {
  const item = content.turns[session.index];
  if (!item) return session;
  switch (action.type) {
    case "said": {
      // One attempt per turn. A retry until it lands is rehearsal, and
      // rehearsal is what the next phase (Retain) is for.
      if (session.saidBy[item.id] !== undefined) return session;
      return { ...session, saidBy: { ...session.saidBy, [item.id]: action.text } };
    }
    case "judged":
      return {
        ...session,
        verdicts: { ...session.verdicts, [item.id]: action.verdict },
        reads: { ...session.reads, [item.id]: action.read },
      };
    case "next": {
      if (session.verdicts[item.id] === undefined) return session;
      const index = session.index + 1;
      return { ...session, index, done: index >= content.turns.length };
    }
    default:
      return session;
  }
}

export function produceScore(session: ProduceSession, content: ProduceContent): number {
  return content.turns.filter((t) => session.verdicts[t.id] === "good").length;
}

/** Turns the learner got across while dodging the form — understood, and no
 *  evidence they can produce the thing the turn was for. */
export function produceAvoided(
  session: ProduceSession,
  content: ProduceContent,
): ProduceTurn[] {
  return content.turns.filter((t) => session.verdicts[t.id] === "thin");
}

/**
 * Produce's gate: two thirds of the turns landed, and at most one was routed
 * around.
 *
 * The avoidance cap is the phase's own standard, and the reason it is not a
 * plain score: `thin` turns are comprehensible, so a learner who avoids every
 * hard form is understood every time and never improves. Counting `thin` as a
 * partial pass would encode exactly the habit that stalls a speaker for years.
 */
export function producePassed(session: ProduceSession, content: ProduceContent): boolean {
  if (!content.turns.length) return session.done;
  const enough =
    produceScore(session, content) >= Math.ceil(content.turns.length * (2 / 3));
  return enough && produceAvoided(session, content).length <= 1;
}

/** Exported so `tests/i18nCoverage.test.ts` can hold both halves against
 *  each other — a table outside its component is one this suite covers. */
export const PRODUCE_COPY = {
  en: {
    kicker: "Produce",
    lead: "Say it. Out loud, first try, no script.",
    theScene: "The situation",
    yourTurn: "Say this",
    youSaid: "What you said",
    good: "Landed",
    thin: "Understood — but you went around it",
    wrong: "Did not land",
    passed: "You produced it live. That is what having the language means.",
    missed: "Some of these did not land. The reads above say where.",
    avoided:
      "You kept going around the form instead of through it — that is the habit that stalls a speaker.",
    next: "Next →",
  },
  "pt-BR": {
    kicker: "Produce",
    lead: "Fale. Em voz alta, de primeira, sem roteiro.",
    theScene: "A situação",
    yourTurn: "Diga isto",
    youSaid: "O que você disse",
    good: "Saiu",
    thin: "Entendido — mas você desviou",
    wrong: "Não saiu",
    passed: "Você produziu ao vivo. É isso que significa ter a língua.",
    missed: "Algumas não saíram. As leituras acima dizem onde.",
    avoided:
      "Você contornou a forma em vez de atravessá-la — é esse o hábito que trava quem fala.",
    next: "Próxima →",
  },
} as const;

export function produceCopy(lang: Language = "en") {
  return PRODUCE_COPY[lang];
}
