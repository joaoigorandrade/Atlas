// ---- one concept of the map, as the model writes it ------------------------
// The validation a streamed map applies per object, split from `map.ts` (the
// prompt, layout and stream) because it changes for its own reasons: a new
// field on a node, a new way the model restates itself.

import { fail, obj, slug, str } from "./common";
import { nodeAxes, type DepthSpec, type Domain, type GoalKind } from "@/lib/curriculum";

/**
 * One domain per map (W2.3): a node takes the topic's unless it says why its
 * own warrant differs. Tags written node by node were noisy enough to put
 * budgeting on an `executable` ladder; a stated reason is the price of
 * overriding the map.
 */
export function inherit(
  c: Record<string, unknown>,
  topicDomain?: Domain,
): Record<string, unknown> {
  if (!topicDomain) return c;
  const why = typeof c.domainWhy === "string" && c.domainWhy.trim().length > 8;
  return why ? c : { ...c, domain: topicDomain };
}
import { logEvent } from "@/lib/log";

/** A validated concept before layout — the same shape whether it arrived in one
 *  payload or one streamed object at a time. */
export type RawConcept = {
  id: string;
  label: string;
  summary?: string;
  deeper?: DepthSpec[];
} & ReturnType<typeof nodeAxes>;

/**
 * A concept's deeper levels, as far as they can be trusted: at most two, each a
 * label and a sentence. Soft like `summary` — a malformed level is dropped, never
 * the concept. Spread, so a concept without levels carries no key at all.
 */
export function deeperOf(raw: unknown): { deeper?: DepthSpec[] } {
  const deeper = (Array.isArray(raw) ? raw : [])
    .filter(
      (d): d is DepthSpec =>
        typeof d?.label === "string" &&
        d.label.trim() !== "" &&
        typeof d?.summary === "string" &&
        d.summary.trim() !== "",
    )
    .slice(0, 2)
    .map((d) => ({ label: d.label.trim(), summary: d.summary.trim() }));
  return deeper.length ? { deeper } : {};
}

/** Drop every level that only restates a concept already on the map — the
 *  whole-map check one streamed concept can't make, run once it has ended. */
export function pruneDeeper<N extends { label: string; deeper?: DepthSpec[] }>(
  nodes: N[],
): N[] {
  const labels = new Set(nodes.map((n) => slug(n.label, "label")));
  return nodes.map(({ deeper, ...n }) => {
    const kept = deeper?.filter((d) => !labels.has(slug(d.label, "label")));
    return (kept?.length ? { ...n, deeper: kept } : n) as N;
  });
}

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

/** Content words, accents folded: what two labels or sentences share. */
const STOP = new Set(
  "uma que para com por dos das nos nas pelo pela sua seu como mais the and for with from that this into".split(
    " ",
  ),
);
const words = (s = "") =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
const nests = (a: Set<string>, b: Set<string>) =>
  a.size > 0 &&
  b.size > 0 &&
  ([...a].every((w) => b.has(w)) || [...b].every((w) => a.has(w)));
const overlap = (a: Set<string>, b: Set<string>) =>
  [...a].filter((w) => b.has(w)).length / (new Set([...a, ...b]).size || 1);

/** What a quick look has written so far, per map (keyed by its `seen`). */
const written = new WeakMap<
  SeenConcepts,
  Array<{ id: string; kind: string; label: Set<string>; summary: Set<string> }>
>();

/**
 * A quick look's 1-3 concepts padded to a set size restate one another under
 * new words ("Entropia" beside "Entropia termodinâmica"; two summaries of
 * ΔS = Q/T). On a map that small, nested label words on the same kind, or a
 * mostly shared summary, is the same concept ("Calcular juros compostos", a
 * procedure, still applies "Juros compostos"); a full map keeps "Derivada"
 * and "Derivada parcial" apart, so only a glance is checked. ponytail: word overlap, not
 * meaning — a Jev "same concept?" question if it misses rewordings.
 */
export function restates(
  seen: SeenConcepts,
  c: { id: string; kind?: string; label: string; summary?: string },
): string | null {
  const mine = {
    id: c.id,
    kind: c.kind ?? "",
    label: words(c.label),
    summary: words(c.summary),
  };
  const prior = written.get(seen) ?? [];
  const twin = prior.find(
    (p) =>
      (p.kind === mine.kind && nests(p.label, mine.label)) ||
      overlap(p.summary, mine.summary) >= 0.4,
  );
  if (twin) return twin.id;
  written.set(seen, [...prior, mine]);
  return null;
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
  topicDomain?: Domain,
): RawConcept & { prereqs: string[] } {
  const c = inherit(obj(raw, `concept[${index}]`), topicDomain);
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
  const twin =
    goal === "glance"
      ? restates(seen, {
          id,
          label,
          kind: String(c.kind ?? ""),
          summary: String(c.summary ?? ""),
        })
      : null;
  if (twin) {
    seen.set(id, twin).set(slug(label, "label"), twin); // later prereqs fold onto it
    fail(`duplicate concept "${label}" — already written as "${twin}"`);
  }
  return {
    id,
    label,
    // Soft, like the single-shot validator: a concept that arrives without its
    // sentence still lands on the map.
    summary: c.summary ? str(c.summary, `concept[${index}].summary`) : undefined,
    ...deeperOf(c.deeper),
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
