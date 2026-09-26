// ---- one concept of the map, as the model writes it ------------------------
// The validation a streamed map applies per object, split from `map.ts` (the
// prompt, layout and stream) because it changes for its own reasons: a new
// field on a node, a new way the model restates itself.

import { fail, obj, slug, str } from "./common";
import { nodeAxes, type GoalKind } from "@/lib/curriculum";
import { logEvent } from "@/lib/log";

/** A validated concept before layout — the same shape whether it arrived in one
 *  payload or one streamed object at a time. */
export type RawConcept = { id: string; label: string; summary?: string } & ReturnType<
  typeof nodeAxes
>;

/** Every name a written concept answers to — its id and its folded label —
 *  mapped to the id that stays on the map. A model padding a map restates
 *  concepts ("João Batista" twice, under two ids); the restatement is dropped
 *  and whatever names it resolves to the concept written first. */
export type SeenConcepts = Map<string, string>;

/** Registers `id`/`label`, or answers the id they already belong to. */
export function claim(seen: SeenConcepts, id: string, label: string): string | null {
  const kept = seen.get(id) ?? seen.get(slug(label, "label"));
  if (kept) seen.set(id, kept);
  else seen.set(id, id).set(slug(label, "label"), id);
  return kept ?? null;
}

/** One streamed concept, before layout: its id, its label, and the concepts it
 *  depends on — which must already have been written, so a forward reference is
 *  dropped rather than believed. That one rule is what makes a prerequisite
 *  cycle structurally impossible without a whole-graph check. */
export function validateMapConcept(
  raw: unknown,
  index: number,
  seen: SeenConcepts,
  goal?: GoalKind,
): RawConcept & { prereqs: string[] } {
  const c = obj(raw, `concept[${index}]`);
  const id = slug(c.id, `concept[${index}].id`);
  const label = str(c.label, `concept[${index}].label`);
  // Resolved before `claim`, which registers this concept: a self-reference
  // must not find it.
  const prereqs = Array.isArray(c.prereqs)
    ? c.prereqs
        .filter((p): p is string => typeof p === "string" && p.trim() !== "")
        // Forward and self references are dropped, not failed: one hallucinated
        // id must not cost the learner the whole map.
        .map((p) => seen.get(slug(p, "prereq")))
        .filter((p): p is string => p !== undefined)
    : [];
  const kept = claim(seen, id, label);
  if (kept) fail(`duplicate concept "${label}" — already written as "${kept}"`);
  return {
    id,
    label,
    // Soft, like the single-shot validator: a concept that arrives without its
    // sentence still lands on the map.
    summary: c.summary ? str(c.summary, `concept[${index}].summary`) : undefined,
    ...nodeAxes(c, goal),
    prereqs: [...new Set(prereqs)],
  };
}

/**
 * Wrap the per-object validator so a model that has run out of concepts and
 * started the map over from the top ends the stream instead of writing a
 * second copy of it. Three restatements running is that, not a slip — a single
 * restatement (one concept under two names) is still just dropped.
 */
export function restartGuard<T>(
  validate: (raw: unknown, index: number) => T,
): (raw: unknown, index: number) => T | { restarted: true } {
  let restated = 0;
  return (raw, index) => {
    try {
      const value = validate(raw, index);
      restated = 0;
      return value;
    } catch (err) {
      if (String(err).includes("duplicate concept") && ++restated >= 3) {
        logEvent("map_stream_restarted", { at: index });
        return { restarted: true };
      }
      throw err;
    }
  };
}
