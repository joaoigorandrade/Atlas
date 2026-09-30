// ---- Blind-solve verification (W2.1, F7) ------------------------------------
// Every closed item's key used to be written by the same call as its question
// and never checked. Here a second model role, `verify` (the judge model at
// temperature 0), sees the items *without* their keys and picks, with a
// confidence. An item it confidently answers differently is disputed: dropped
// while the kind's lower bound holds, else the payload is regenerated once, and
// only then shipped minus its disputes. Dropping keeps the payload's shape, so
// cached rows stay valid and no VERSION bump is owed.
//
// The W0.3 eval panel measures the disputed-key rate with the same functions.

import type {
  ConsumeChunk,
  DiscriminateContent,
  DrillContent,
  PredictContent,
  ProvenanceContent,
  TraceContent,
} from "@/lib/curriculum";
import { PROVENANCE_RULINGS } from "@/lib/curriculum";
import { logEvent } from "@/lib/log";
import { generateJson } from "@/lib/server/openrouter";
import { arr, fail, obj, user } from "./common";
import { DISCRIMINATE_CASE_BOUNDS } from "./discriminate";
import { DRILL_REP_BOUNDS } from "./drill";
import { PREDICT_SETUP_BOUNDS } from "./predict";
import { PROVENANCE_CLAIM_BOUNDS } from "./provenance";

/** One closed item, as the solver sees it (minus `key`). */
export interface ClosedItem {
  id: string;
  stem: string;
  options: string[];
  key: number;
}

/** Below this the solver is guessing, and a guess disputes nothing. */
const SURE = 0.7;

export interface Solved {
  pick: number;
  confidence: number;
  /** Which method the solver used — W2.4 checks it against the node's own. */
  method?: string;
}

/**
 * Solve `items` blind. `context` is what every item shares (the question asked
 * of each case, the running scenario, the source excerpt).
 */
export async function blindSolve(p: {
  topic: string;
  nodeLabel: string;
  context?: string;
  items: ClosedItem[];
  withMethod?: boolean;
}): Promise<Record<string, Solved>> {
  if (p.items.length === 0) return {};
  const listing = p.items
    .map(
      (it, i) =>
        `${i + 1}. [${it.id}] ${it.stem}\n${it.options.map((o, j) => `   (${j}) ${o}`).join("\n")}`,
    )
    .join("\n\n");
  const out = await generateJson(
    user(`You are an expert examiner checking an answer key you cannot see. Topic: "${p.topic}", concept: "${p.nodeLabel}".
${p.context ? `\nShared context:\n${p.context}\n` : ""}
Answer every item below independently. For each, pick the ONE best option by its index, and say how sure you are (0 to 1). Be honest: if two options are defensible, or none is right, say so with a low confidence rather than guessing boldly.${p.withMethod ? ' Also name, in a few words, the method you used ("method").' : ""}

${listing}

Reply with JSON: {"answers": [{"id": "<the id in brackets>", "pick": 0, "confidence": 0.9${p.withMethod ? ', "method": "…"' : ""}}]}`),
    (raw) => {
      const answers = arr(obj(raw, "payload").answers, "answers", 1, 40);
      const got: Record<string, Solved> = {};
      for (const [i, v] of answers.entries()) {
        const a = obj(v, `answers[${i}]`);
        if (typeof a.id !== "string") fail(`answers[${i}].id must be a string`);
        got[a.id] = {
          pick: typeof a.pick === "number" ? Math.trunc(a.pick) : -1,
          confidence: typeof a.confidence === "number" ? a.confidence : 0,
          ...(typeof a.method === "string" ? { method: a.method } : null),
        };
      }
      return got;
    },
    { label: "verify", role: "verify" },
  );
  return out;
}

/** The items the solver confidently answered differently. */
export function disputedIds(items: ClosedItem[], solved: Record<string, Solved>): string[] {
  return items
    .filter((it) => {
      const s = solved[it.id];
      return s && s.confidence >= SURE && s.pick !== it.key;
    })
    .map((it) => it.id);
}

// ---- per-kind adapters -------------------------------------------------------

type Verifiable = "discriminate" | "predict" | "trace" | "drill" | "provenance";

interface Adapter<T> {
  items: (c: T) => { context?: string; items: ClosedItem[] };
  /** The payload without these items. */
  drop: (c: T, ids: string[]) => T;
  /** How many items the kind must keep. Trace is a chain: a stage cannot be
   *  lifted out of it, so any dispute regenerates. */
  min: (c: T) => number;
}

const RULINGS = [...PROVENANCE_RULINGS];

export const VERIFY: { [K in Verifiable]: Adapter<VerifyPayload[K]> } = {
  discriminate: {
    items: (c) => ({
      context: c.ask,
      items: c.cases.map((x) => ({
        id: x.id,
        stem: x.candidate,
        options: x.readings,
        key: x.answerIndex,
      })),
    }),
    drop: (c, ids) => ({ ...c, cases: c.cases.filter((x) => !ids.includes(x.id)) }),
    min: () => DISCRIMINATE_CASE_BOUNDS.min,
  },
  predict: {
    items: (c) => ({
      items: c.setups.map((x) => ({
        id: x.id,
        stem: x.situation,
        options: x.outcomes,
        key: x.answerIndex,
      })),
    }),
    drop: (c, ids) => ({ ...c, setups: c.setups.filter((x) => !ids.includes(x.id)) }),
    min: () => PREDICT_SETUP_BOUNDS.min,
  },
  trace: {
    items: (c) => ({
      context: `The running case: ${c.scenario}\nEach item gives where the case has got to; pick what happens next.`,
      items: c.stages.map((x) => ({
        id: x.id,
        stem: x.reached,
        options: x.nexts,
        key: x.answerIndex,
      })),
    }),
    drop: (c) => c,
    min: (c) => c.stages.length,
  },
  drill: {
    items: (c) => ({
      items: c.reps.map((x) => ({
        id: x.id,
        stem: x.prompt,
        options: x.answers,
        key: x.answerIndex,
      })),
    }),
    drop: (c, ids) => ({ ...c, reps: c.reps.filter((x) => !ids.includes(x.id)) }),
    min: () => DRILL_REP_BOUNDS.min,
  },
  provenance: {
    items: (c) => ({
      context: `The source: "${c.source.title}" — ${c.source.attribution}, ${c.source.date}.\nExcerpt: ${c.source.excerpt}\n\nFor each claim, rule what THIS source does: "asserts" (it states it, but its word is the only evidence), "proves" (the source is good evidence the claim is true — e.g. it is itself the record of the thing), or "neither" (the source does not speak to it).`,
      items: c.claims.map((x) => ({
        id: x.id,
        stem: x.claim,
        options: RULINGS,
        key: RULINGS.indexOf(x.ruling),
      })),
    }),
    drop: (c, ids) => ({ ...c, claims: c.claims.filter((x) => !ids.includes(x.id)) }),
    min: () => PROVENANCE_CLAIM_BOUNDS.min,
  },
};

interface VerifyPayload {
  discriminate: DiscriminateContent;
  predict: PredictContent;
  trace: TraceContent;
  drill: DrillContent;
  provenance: ProvenanceContent;
}

export const isVerifiable = (kind: string): kind is Verifiable => kind in VERIFY;

/**
 * Generate, verify, and repair once. `make` is the kind's own generator; the
 * payload comes back minus confidently disputed items, regenerated once when
 * dropping would breach the kind's floor. Verification failing (the verify
 * model down) ships the payload unverified rather than failing the learner.
 */
export async function verified<K extends Verifiable>(
  kind: K,
  meta: { topic: string; nodeLabel: string },
  make: () => Promise<VerifyPayload[K]>,
): Promise<VerifyPayload[K]> {
  const a = VERIFY[kind] as unknown as Adapter<VerifyPayload[K]>;
  let content = await make();
  for (let round = 0; round < 2; round++) {
    let disputed: string[];
    try {
      const { context, items } = a.items(content);
      disputed = disputedIds(items, await blindSolve({ ...meta, context, items }));
    } catch {
      return content;
    }
    if (disputed.length === 0) return content;
    const kept = a.drop(content, disputed);
    const size = a.items(kept).items.length;
    if (size >= a.min(kept) && size < a.items(content).items.length) {
      logEvent("verify_dropped", { kind, dropped: disputed.length });
      return kept;
    }
    if (round === 1) {
      logEvent("verify_disputed", { kind, disputed: disputed.length });
      return size >= 1 && kind !== "trace" ? kept : content;
    }
    content = await make();
  }
  return content;
}

/** A Consume section's check, as an item. Its disputed form is dropped from
 *  the section (the check is optional on a chunk), never regenerated. */
export function checkItem(chunk: ConsumeChunk): ClosedItem | null {
  const c = chunk.check;
  if (!c || c.opts.length < 2) return null;
  const key = c.opts.findIndex((o) => o.correct);
  return key < 0 ? null : { id: chunk.id, stem: c.q, options: c.opts.map((o) => o.label), key };
}

/** A section with a disputed check loses it; undisputed ones pass through. */
export async function verifyChunkCheck(
  meta: { topic: string; nodeLabel: string },
  chunk: ConsumeChunk,
): Promise<ConsumeChunk> {
  const item = checkItem(chunk);
  if (!item) return chunk;
  try {
    const solved = await blindSolve({ ...meta, context: chunk.body.join("\n"), items: [item] });
    if (!disputedIds([item], solved).length) return chunk;
  } catch {
    return chunk;
  }
  logEvent("verify_dropped", { kind: "consume", dropped: 1 });
  const { check: _dropped, ...rest } = chunk;
  return rest;
}

/** `verified` over a job's `run`, which wraps its payload as `{ content }`. */
export async function verifiedRun<P extends { topic: string; nodeLabel: string }>(
  kind: string,
  params: P,
  run: (p: P) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  if (!isVerifiable(kind)) return run(params);
  const content = await verified(kind, params, async () => (await run(params)).content as never);
  return { content };
}
