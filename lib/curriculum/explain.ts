// ---- Phase · Explain (explanation design) ----------------------------------
// Straight after the reading: not what the concept is, but how to put it
// across to someone else. Consume teaches the content and Feynman, rungs
// later, grades the learner's own explanation against a hidden rubric — but
// nothing before this ever showed what a good explanation looks like.
//
// Five cards model one (the problem it answers, an analogy and where it breaks,
// the order to introduce the ideas, what the listener will get wrong, and how
// to check they got it), then one check: a listener voices the misconception,
// and the learner picks the reply that actually defuses it. That pick is the
// signal no other phase extracts. A miss is taught on the spot — why that reply
// fails — and the learner tries again, so there is no Shaky reason to write.

import { Language } from "@/lib/i18n";

/** Explain's accent: a schoolroom olive. */
export const EXPLAIN_COLOR = {
  accent: "#6b6a2e",
  soft: "rgba(107,106,46,0.08)",
  border: "rgba(107,106,46,0.32)",
} as const;

/** One reply to the listener. Exactly one per check defuses the misconception. */
export interface ExplainReply {
  label: string;
  correct: boolean;
  /** Why it works, or why it leaves the misconception standing. Shown after
   *  the pick. */
  why: string;
}

export interface ExplainContent {
  nodeId: string;
  nodeLabel: string;
  /** The question this concept answers — where an explanation starts. */
  problem: string;
  analogy: { text: string; breaks: string };
  /** 3-5 ideas, in the order to introduce them. */
  order: string[];
  misconception: { belief: string; tempting: string };
  /** One question to ask the listener, and what a right answer contains. */
  checkBack: { question: string; rightAnswer: string };
  /** The check: what the listener says, and the replies to choose from. */
  listener: { says: string; replies: ExplainReply[] };
}

/** The five cards, in the order they are revealed. */
export const EXPLAIN_CARDS = [
  "problem",
  "analogy",
  "order",
  "misconception",
  "checkBack",
] as const;

export interface ExplainSession {
  nodeId: string;
  /** Cards revealed so far, 1-5. The check opens once all five are. */
  revealed: number;
  /** Replies already tried and found wanting — never offered as a fresh pick. */
  tried: number[];
  /** The last reply picked, for the reveal under it. */
  picked?: number;
  /** The judge's one-line read when the pick came in the learner's own words. */
  read?: string;
  /** The defusing reply was picked. */
  done: boolean;
}

export function explainStart(nodeId: string): ExplainSession {
  return { nodeId, revealed: 1, tried: [], done: false };
}

export type ExplainAction =
  { type: "reveal" } | { type: "pick"; index: number; read?: string };

export function explainReducer(
  session: ExplainSession,
  action: ExplainAction,
  content: ExplainContent,
): ExplainSession {
  if (session.done) return session;
  switch (action.type) {
    case "reveal":
      return session.revealed >= EXPLAIN_CARDS.length
        ? session
        : { ...session, revealed: session.revealed + 1 };
    case "pick": {
      const reply = content.listener.replies[action.index];
      // The check waits on the whole model; a reply already ruled out is not
      // a second try.
      if (
        !reply ||
        session.revealed < EXPLAIN_CARDS.length ||
        session.tried.includes(action.index)
      )
        return session;
      return {
        ...session,
        picked: action.index,
        read: action.read,
        tried: reply.correct ? session.tried : [...session.tried, action.index],
        done: reply.correct,
      };
    }
    default:
      return session;
  }
}

/** Explain's gate: the defusing reply, found — however many tries it took. */
export function explainPassed(session: ExplainSession): boolean {
  return session.done;
}

/** 1 on a first-try pick, less for every reply ruled out on the way. */
export function explainScore(session: ExplainSession): number {
  return session.done ? 1 / (session.tried.length + 1) : 0;
}

export const EXPLAIN_COPY = {
  en: {
    kicker: "Explain",
    lead: "How would you explain this to someone who has never heard of it?",
    cards: {
      problem: "Start with the problem",
      analogy: "The analogy",
      order: "The order",
      misconception: "What your listener will get wrong",
      checkBack: "Check they got it",
    },
    breaks: "Where it breaks",
    tempting: "Why it is tempting",
    rightAnswer: "A right answer contains",
    listener: "Your listener says",
    pickReply: "What do you say back?",
    works: "That defuses it",
    fails: "That leaves it standing",
    tryAgain: "Try another reply.",
  },
  "pt-BR": {
    kicker: "Explain",
    lead: "Como você explicaria isso para alguém que nunca ouviu falar?",
    cards: {
      problem: "Comece pelo problema",
      analogy: "A analogia",
      order: "A ordem",
      misconception: "O que seu ouvinte vai entender errado",
      checkBack: "Confira se ele entendeu",
    },
    breaks: "Onde ela falha",
    tempting: "Por que é tentador",
    rightAnswer: "Uma resposta certa contém",
    listener: "Seu ouvinte diz",
    pickReply: "O que você responde?",
    works: "Isso desfaz o erro",
    fails: "Isso deixa o erro de pé",
    tryAgain: "Tente outra resposta.",
  },
} as const;

export function explainCopy(lang: Language = "en") {
  return EXPLAIN_COPY[lang];
}
