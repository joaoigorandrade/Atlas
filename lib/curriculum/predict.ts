// ---- Phase · Predict (forecast before the answer) --------------------------
// A situation the principle governs, and one question: what happens? Said
// before being shown, and committed — a forecast you can read off the screen
// is not a forecast.
//
// Only a `principle` runs this. The test of having a mechanism is whether it
// forecasts; a concept classifies, a fact is had, and a procedure's forecast
// is just running it, which is Perform.
//
// What Predict grades that nothing else does: the learner states a confidence
// before committing, so a wrong forecast held confidently is separated from a
// wrong one held loosely. That reading feeds the same calibration curve the
// Crucible's confidence tap does.

import { Language } from "@/lib/i18n";

/** Predict's accent: a forecasting indigo. */
export const PREDICT_COLOR = {
  accent: "#5a4f7d",
  soft: "rgba(90,79,125,0.08)",
  border: "rgba(90,79,125,0.32)",
} as const;

/** How sure the learner is, taken before the outcome is revealed. Held against
 *  what actually happened, this is a calibration reading. */
export const PREDICT_CONFIDENCE = [35, 65, 90] as const;

export interface PredictSetup {
  id: string;
  /** The situation, with whatever the forecast turns on. Never hints at the
   *  outcome. */
  situation: string;
  /** Candidate outcomes — the right one, plus what a learner forecasts when
   *  they hold the relation backwards or drop a condition. */
  outcomes: string[];
  answerIndex: number;
  /** The causal chain that made this outcome the one that had to happen.
   *  Revealed only after the commit. */
  because: string;
}

export interface PredictContent {
  nodeId: string;
  nodeLabel: string;
  setups: PredictSetup[];
}

export interface PredictSession {
  nodeId: string;
  index: number;
  /** Committed forecast per setup id. */
  forecasts: Record<string, number>;
  /** Confidence stated before committing, per setup id (index into
   *  PREDICT_CONFIDENCE). Null while the current setup is unrated. */
  sureness: Record<string, number>;
  /** The judge's one-line read when the forecast came in their own words. */
  reads: Record<string, string>;
  done: boolean;
}

export function predictStart(nodeId: string): PredictSession {
  return { nodeId, index: 0, forecasts: {}, sureness: {}, reads: {}, done: false };
}

export type PredictAction =
  | { type: "sure"; level: number }
  | { type: "commit"; index: number; read?: string }
  | { type: "next" };

export function predictReducer(
  session: PredictSession,
  action: PredictAction,
  content: PredictContent,
): PredictSession {
  const item = content.setups[session.index];
  if (!item) return session;
  switch (action.type) {
    case "sure":
      // Only before the forecast is in. Afterwards it would be a rating of a
      // result already seen, which is not calibration.
      if (session.forecasts[item.id] !== undefined) return session;
      return { ...session, sureness: { ...session.sureness, [item.id]: action.level } };
    case "commit": {
      if (session.forecasts[item.id] !== undefined) return session;
      return {
        ...session,
        forecasts: { ...session.forecasts, [item.id]: action.index },
        ...(action.read ? { reads: { ...session.reads, [item.id]: action.read } } : {}),
      };
    }
    case "next": {
      if (session.forecasts[item.id] === undefined) return session;
      const index = session.index + 1;
      return { ...session, index, done: index >= content.setups.length };
    }
    default:
      return session;
  }
}

export function predictScore(session: PredictSession, content: PredictContent): number {
  return content.setups.filter((s) => session.forecasts[s.id] === s.answerIndex).length;
}

/**
 * Forecasts held confidently and still wrong — the reading Predict exists to
 * surface. A mechanism you trust and that does not hold is worse than one you
 * were unsure of, and the closing panel says so.
 */
export function predictOverconfident(
  session: PredictSession,
  content: PredictContent,
): PredictSetup[] {
  return content.setups.filter(
    (s) =>
      session.forecasts[s.id] !== undefined &&
      session.forecasts[s.id] !== s.answerIndex &&
      (session.sureness[s.id] ?? 0) >= PREDICT_CONFIDENCE.length - 1,
  );
}

/** Felt-vs-real pairs for the calibration curve: what they said they knew,
 *  against whether the forecast actually held. */
export function predictCalibration(
  session: PredictSession,
  content: PredictContent,
): Array<{ felt: number; real: number }> {
  return content.setups
    .filter((s) => session.sureness[s.id] !== undefined)
    .map((s) => ({
      felt: PREDICT_CONFIDENCE[session.sureness[s.id]],
      real: session.forecasts[s.id] === s.answerIndex ? 90 : 20,
    }));
}

/** Predict's gate: two thirds forecast correctly. Confidence is measured and
 *  reported, never gated on — being unsure and right is a good forecast. */
export function predictPassed(session: PredictSession, content: PredictContent): boolean {
  if (!content.setups.length) return session.done;
  return predictScore(session, content) >= Math.ceil(content.setups.length * (2 / 3));
}

const PREDICT_COPY = {
  en: {
    kicker: "Predict",
    lead: "Say what happens before you are shown. Commit to it.",
    situation: "The situation",
    howSure: "How sure are you?",
    sureness: ["Guessing", "Fairly sure", "Certain"],
    because: "Why it had to go that way",
    passed: "The mechanism forecasts for you. That is what having one is for.",
    missed: "Some of these went the other way. The reasons say what you left out.",
    overconfident: "The ones you were certain of and got wrong are the ones to look at.",
    next: "Next →",
  },
  "pt-BR": {
    kicker: "Predict",
    lead: "Diga o que acontece antes de ver. Comprometa-se.",
    situation: "A situação",
    howSure: "Quanta certeza você tem?",
    sureness: ["Chutando", "Bem confiante", "Certeza"],
    because: "Por que tinha de ser assim",
    passed: "O mecanismo prevê por você. É para isso que serve ter um.",
    missed: "Alguns foram para o outro lado. Os motivos dizem o que ficou de fora.",
    overconfident: "Os que você tinha certeza e errou são os que valem revisitar.",
    next: "Próximo →",
  },
} as const;

export function predictCopy(lang: Language = "en") {
  return PREDICT_COPY[lang];
}
