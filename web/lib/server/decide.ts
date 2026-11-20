// Server-side System One client (OpenRouter `/systemone`, TypeSafe's Jev).
//
// A decision model, not a writer: it takes a state and typed questions and
// returns calibrated probabilities in ~0.5s for a fraction of a cent. Atlas
// uses it wherever a call's job is to *pick from a fixed set* — a judge's
// verdict, a blind-solve's pick, a node's kind — and keeps the LLM for every
// word a learner reads.
//
// It never throws and never blocks for long. A missing key, a timeout, a
// provider error or an unsure answer all come back as "no decision", and the
// caller runs exactly what it ran before Jev existed. So Jev can only ever
// replace a decision it is confident in; it can never cost a learner a screen.
//
// Env:
//   DECIDE_MODEL       — System One model (default below); "off" disables it
//   DECIDE_TIMEOUT_MS  — whole-call cap (default 2500)

import { logEvent, logWarning } from "@/lib/log";

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
/** Pinned, not `~typesafe/jev-latest`: a verdict that drives mastery writes
 *  must not change model under us between two deploys. */
const DEFAULT_DECIDE_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = Number(process.env.DECIDE_TIMEOUT_MS || 2500);

/** At or above this a decision stands; below it the LLM decides as before.
 *  ponytail: one global bar — tune per label from the `decide` log lines. */
export const SURE = 0.85;

type Guidance = string | Record<string, unknown> | unknown[];

export type Question =
  | { type: "choice"; instructions: Guidance; criteria: Record<string, Guidance> }
  | {
      type: "noul";
      instructions: Guidance;
      criteria: { true: Guidance; false: Guidance };
    }
  | { type: "score"; instructions: Guidance; criteria: Guidance[] };

export type Answer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "noul"; noul: number }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
    };

const model = () => process.env.DECIDE_MODEL || DEFAULT_DECIDE_MODEL;

/**
 * Ask several questions about one state, in one call. Resolves to the answers
 * by question name, or null when there is no decision to be had.
 */
export async function decide(
  state: string | Record<string, unknown>,
  questions: Record<string, Question>,
  label: string,
): Promise<Record<string, Answer> | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || model() === "off" || process.env.ATLAS_FIXTURES === "1") return null;
  if (Object.keys(questions).length === 0) return null;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://atlas.local",
        "X-Title": "Atlas Learning Platform",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({ model: model(), state, questions }),
    });
    if (!res.ok)
      throw new Error(`systemone ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      answers?: Record<string, Answer>;
      usage?: { cost?: number };
    };
    if (!data.answers || typeof data.answers !== "object")
      throw new Error("systemone returned no answers");
    logEvent("decide", {
      label,
      ms: Date.now() - started,
      questions: Object.keys(questions).length,
      cost: data.usage?.cost,
    });
    return data.answers;
  } catch (err) {
    logWarning("decide_failed", err, { label, ms: Date.now() - started });
    return null;
  }
}

/** A choice answer's pick when it clears the bar, else undefined. */
export function sureChoice(a: Answer | undefined): string | undefined {
  return a?.type === "choice" && a.confidence >= SURE ? a.choice : undefined;
}

/** A yes/no answer that clears the bar either way, else undefined. */
export function sureNoul(a: Answer | undefined): boolean | undefined {
  if (a?.type !== "noul") return undefined;
  if (a.noul >= SURE) return true;
  if (a.noul <= 1 - SURE) return false;
  return undefined;
}

export const choice = (
  instructions: string,
  criteria: Record<string, string>,
): Question => ({
  type: "choice",
  instructions,
  criteria,
});

export const noul = (instructions: string, yes: string, no: string): Question => ({
  type: "noul",
  instructions,
  criteria: { true: yes, false: no },
});
