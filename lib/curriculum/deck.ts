// ---- The deck engine · Discriminate (and Predict, Trace, Drill) ------------
// A short run of items, answered one at a time, each committed before it is
// revealed. The interaction is the same for four phases; what differs is what
// the items ARE, which is where a phase's signal actually lives:
//
//   discriminate  boundary                is this an instance, and which one
//   predict       forecast before the     what happens, said before it is shown
//                 answer
//   trace         following a mechanism   what this step hands the next one
//                 step by step
//   drill         speed and automaticity  the same call, made fast
//
// One engine, four prompts. A separate reducer per phase would be four copies
// of "index, pick, reveal, advance" differing in nothing.
//
// Every item carries a closed form. That is not a shortcut around
// AGENTS.md §"every question is asked open-ended first" — the learner still
// answers in their own words by default, and `OpenAnswer` maps that onto the
// option index through the `choice` judge. The options exist so the *grading*
// is local: the one thing these phases must never do is make the learner wait
// on a model between items.

import { PhaseId } from "./phases";
import { Language } from "@/lib/i18n";

/** The phases this engine runs, built ones only — see `RECITE_PHASES` for why
 *  a member here without a screen behind it would be a type that lies. */
export const DECK_PHASES = ["discriminate", "drill"] as const;
export type DeckPhase = (typeof DECK_PHASES)[number];

export function isDeckPhase(phase: PhaseId): phase is DeckPhase {
  return (DECK_PHASES as readonly string[]).includes(phase);
}

/** Per-phase accent. Discriminate takes a boundary-drawing slate blue; Drill
 *  a warmer copper, the colour of something being worn smooth. */
export const DECK_COLOR: Record<DeckPhase, { accent: string; soft: string }> = {
  discriminate: { accent: "#4f6f8f", soft: "rgba(79,111,143,0.08)" },
  drill: { accent: "#a3672f", soft: "rgba(163,103,47,0.08)" },
};

/**
 * How the deck presents an item, per phase. A small table rather than four
 * views: the differences are genuinely presentational, and each one is a
 * property of the phase, not of the item.
 */
export const DECK_SHAPE: Record<
  DeckPhase,
  {
    /** Show the time each item took — Drill's whole signal. */
    timed: boolean;
    /** Keep the answered items on screen above the current one, as a chain —
     *  Trace's, where the point is that each step feeds the next. */
    chain: boolean;
  }
> = {
  discriminate: { timed: false, chain: false },
  drill: { timed: true, chain: false },
};

/** One item: something to judge, a closed form to judge it into, and the
 *  reason — which is shown only after the learner has committed. */
export interface DeckItem {
  id: string;
  /** What the item is about: the candidate instance, the setup, the state so
   *  far. Optional — a drill item is the prompt and nothing else. */
  context?: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  /** Why that answer. Revealed with the verdict, never before it. */
  why: string;
}

export interface DeckContent {
  nodeId: string;
  nodeLabel: string;
  items: DeckItem[];
}

export interface DeckSession {
  nodeId: string;
  phase: DeckPhase;
  /** Which item is open. Equal to `items.length` once the run is finished. */
  index: number;
  /** The committed pick per item id. An item with a pick is answered. */
  picks: Record<string, number>;
  /** The judge's one-line read, when the answer came in the learner's own
   *  words rather than as a tap. */
  reads: Record<string, string>;
  /** Milliseconds spent on each item — measured always, gated on never. */
  elapsed: Record<string, number>;
  /** When the open item was opened. */
  openedAt: number;
  done: boolean;
}

export function deckStart(
  nodeId: string,
  phase: DeckPhase,
  now = Date.now(),
): DeckSession {
  return {
    nodeId,
    phase,
    index: 0,
    picks: {},
    reads: {},
    elapsed: {},
    openedAt: now,
    done: false,
  };
}

export type DeckAction =
  | { type: "answer"; index: number; read?: string; now?: number }
  | { type: "next"; now?: number };

export function deckReducer(
  session: DeckSession,
  action: DeckAction,
  content: DeckContent,
): DeckSession {
  const item = content.items[session.index];
  switch (action.type) {
    case "answer": {
      // Answering twice would let a learner tap through the options until the
      // reveal turns green, which is the one thing a boundary test cannot
      // allow. The first commit is the answer.
      if (!item || session.picks[item.id] !== undefined) return session;
      const now = action.now ?? Date.now();
      return {
        ...session,
        picks: { ...session.picks, [item.id]: action.index },
        ...(action.read ? { reads: { ...session.reads, [item.id]: action.read } } : {}),
        elapsed: {
          ...session.elapsed,
          [item.id]: Math.max(0, now - session.openedAt),
        },
      };
    }
    case "next": {
      // Nothing advances past an unanswered item — the reveal is the payoff
      // for having committed.
      if (!item || session.picks[item.id] === undefined) return session;
      const index = session.index + 1;
      return {
        ...session,
        index,
        openedAt: action.now ?? Date.now(),
        done: index >= content.items.length,
      };
    }
    default:
      return session;
  }
}

/** How many items the learner got right. */
export function deckScore(session: DeckSession, content: DeckContent): number {
  return content.items.filter((i) => session.picks[i.id] === i.answerIndex).length;
}

/** Median milliseconds per answered item — what a timed phase reports. Median
 *  rather than mean because one interrupted item should not describe the run. */
export function deckMedianMs(session: DeckSession, content: DeckContent): number {
  const times = content.items
    .map((i) => session.elapsed[i.id])
    .filter((ms): ms is number => typeof ms === "number")
    .sort((a, b) => a - b);
  if (!times.length) return 0;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
}

/**
 * Did the run close its rung? Two thirds right, the same bar the recite family
 * sets — and the same reason: a miss is diagnostic, not a wall.
 *
 * ponytail: correctness only, even on a timed phase. Drill measures speed and
 * shows it, because a phase that extracts no new signal is a setting rather
 * than a phase — but gating on it would fail a learner who is right and
 * careful, which is a dead end, not a standard. Put a clock on the gate only
 * with real evidence that slow-and-right is the failure worth catching.
 */
export function deckPassed(session: DeckSession, content: DeckContent): boolean {
  if (!content.items.length) return session.done;
  return deckScore(session, content) >= Math.ceil(content.items.length * (2 / 3));
}

const DECK_COPY = {
  en: {
    discriminate: {
      kicker: "Discriminate",
      lead: "Where does this concept stop and the next one start?",
      passed: "You can tell it from its neighbours. That is what having it means.",
      missed: "The boundary is still soft in places. The reasons above say where.",
    },
    drill: {
      kicker: "Drill",
      lead: "The same call, made without stopping to derive it.",
      passed: "It comes without working for it. That is what automatic means.",
      missed: "Still being reasoned out rather than known. Run it again.",
    },
  },
  "pt-BR": {
    discriminate: {
      kicker: "Discriminate",
      lead: "Onde esse conceito termina e o vizinho começa?",
      passed: "Você distingue isso dos vizinhos. É isso que significa ter o conceito.",
      missed:
        "A fronteira ainda está solta em alguns pontos. Os motivos acima dizem onde.",
    },
    drill: {
      kicker: "Drill",
      lead: "A mesma decisão, sem parar para deduzir.",
      passed: "Sai sem esforço. É isso que significa estar automático.",
      missed: "Ainda está sendo deduzido em vez de sabido. Rode de novo.",
    },
  },
} as const;

/** The phase's own framing copy, in the learner's language. */
export function deckCopy(phase: DeckPhase, lang: Language = "en") {
  return DECK_COPY[lang][phase];
}
