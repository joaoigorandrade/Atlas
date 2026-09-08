// Reshaping stored content that predates the shape the app renders.
//
// These used to live in `lib/persistence.ts`, where they ran over the `caches`
// column on every load. That column is gone, but the material is not: the
// normalization backfilled every payload it held straight into `node_content`,
// so a row written by a deploy from before the reading-first Consume rewrite is
// still out there and still has to render.
//
// Detected by shape, never by a version. These payloads carry no version of
// their own — they are addressed by a hash of the prompt that produced them,
// and a hit is served without re-validation, which is exactly why the shape has
// to be checked here rather than assumed.

import type { ConsumeChunk, FeynmanBeat } from "@/lib/curriculum";

/** A cached chunk from before the reading-first Consume rewrite: one short
 *  body string, a prediction on every chunk, verdict copy hanging off the
 *  chunk, and no example or takeaway. */
export type LegacyConsumeChunk = Omit<ConsumeChunk, "body" | "example" | "takeaway"> & {
  body: string | string[];
  example?: ConsumeChunk["example"];
  takeaway?: string;
  right?: string;
  wrong?: string;
  pred?: unknown;
};

/** Reshape a quiz-shaped reading pass into the current one. The old material is
 *  all we have — it stays short — but it renders, and it stops gating: the
 *  pre-reading prediction hook is dropped along with its verdict copy, since
 *  nothing renders it any more. */
export function migrateConsume(
  cached: Record<string, LegacyConsumeChunk[]> | undefined,
): Record<string, ConsumeChunk[]> {
  return Object.fromEntries(
    Object.entries(cached ?? {}).map(([nodeId, chunks]) => [
      nodeId,
      chunks.map((c) => {
        const { right: _right, wrong: _wrong, pred: _pred, ...rest } = c;
        return {
          ...rest,
          body: Array.isArray(c.body) ? c.body : [c.body],
          example: c.example ?? {
            title: "Worked through",
            steps: [c.alt?.example ?? "See the passage above."],
          },
          takeaway: c.takeaway ?? c.alt?.simpler ?? "",
          terms: c.terms ?? [],
          ask: c.ask ?? "",
        };
      }),
    ]),
  );
}

/** Teach-back rubrics written before the blank-page rewrite are scripts, not
 *  rubrics: a learner monologue and three canned replies, with nothing to grade
 *  an explanation against. There is no `mustConvey` to recover from them, so
 *  they are dropped and the node writes a fresh rubric on its next teach-back. */
export function usableRubrics(
  cached: Record<string, FeynmanBeat[]> | undefined,
): Record<string, FeynmanBeat[]> {
  return Object.fromEntries(
    Object.entries(cached ?? {}).filter(([, beats]) =>
      beats?.every((b) => Array.isArray(b?.mustConvey) && b.mustConvey.length),
    ),
  );
}
