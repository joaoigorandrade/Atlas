// The generated-content cache (see the 20260801 migration). Every cacheable
// generation is keyed by a hash of its exact prompt inputs, so identical
// inputs return the stored payload instead of re-billing an LLM round-trip —
// the difference between a screen that opens in 30 seconds and one that opens
// in 100 milliseconds.
//
// Service-role only: `content_cache` has RLS on with no policies, so the
// browser's publishable key can't reach it. Without SUPABASE_SECRET_KEY the
// whole module degrades to "always a miss" — the app still works, it just
// generates every time.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

/** Bump (or set CONTENT_CACHE_VERSION) to invalidate everything after a
 *  prompt change — old rows simply stop being addressed. A hit is returned
 *  straight to the client without re-validation, so a payload whose *shape*
 *  changed makes this mandatory, not just economical.
 *  v2: the reading-first Consume rewrite (body is paragraphs, sections carry a
 *  worked example, one prediction per pass).
 *  v3: cache key params now carry `language` — an en-cached row and a pt-BR
 *  row for the same node must never collide.
 *  v4: the Retain payload dropped `forecast` and per-card `fsrs`/`id`. Those
 *  were always rebuilt from the FSRS store on arrival, so old rows carry
 *  fields nothing reads — harmless, except that hits skip validation and the
 *  shape changed, which is exactly when this must move.
 *  v5: `curriculum` payloads dropped the embedded `diagnostic` array — the
 *  placement questions are generated one at a time by the uncached
 *  `diagnosticQuestion` kind now, so an old row would replay a map with no
 *  questions attached.
 *  v6: `curriculum` streams, so its payload is now a flat `nodes` list where
 *  each node carries its own `prereqs` (the graph is derived from it) rather
 *  than a `{graph: {nodes, edges}}` object — and its key params dropped
 *  `interests`, which the map prompt never used. Both alone would force this.
 *  v7: `consume` sections may now omit `diagram`/`figure` together when the
 *  content isn't structural — an old row always has both.
 *  v8: every `consume` section now carries a `check` — the comprehension
 *  question gating its Continue. An old row has none, so the pass would read
 *  as ungated. (The same version covers `consume` dropping `alt` when the four
 *  rewrites became the on-demand `model` kind. That one would not have forced
 *  a bump on its own — the field only ever disappeared, and nothing reads it
 *  any more — but it rides along here.)
 *  v10: the pt-BR language note was too weak against the English JSON
 *  templates — the model copied their example labels and wrote whole payloads
 *  in English. Those rows sit under pt-BR keys, so they must be abandoned,
 *  not just prevented. (`crucible`'s ladder is translated server-side now,
 *  which alone would force this.)
 *  v11: every sized prompt now asks for a RANGE picked from the material
 *  instead of a fixed count (map 6-16 concepts, Consume 2-5 sections, Socratic
 *  2-4 core probes + 1 spare, Feynman 2-4 beats, Retain scaled to the
 *  rotation), and the validators accept those smaller payloads. Rows written
 *  under the fixed-count prompts are all padded to the old quotas, and a hit is
 *  served without re-validation — so they have to be abandoned, not merely
 *  prevented.
 *  v12: every `curriculum` node now carries a `summary` — the one sentence the
 *  detail rail shows about the concept itself. An old row has none for any
 *  node, so a cached map would send every learner back to the state copy the
 *  summary replaced. */
const VERSION = process.env.CONTENT_CACHE_VERSION || "13";

/**
 * A prompt revision per kind, so a change to one kind's prompt reaches new
 * generations without abandoning every other kind's rows.
 *
 * `VERSION` is the whole table: bumping it re-bills every concept for every
 * learner who has not yet generated it. Most prompt changes touch one kind, so
 * they move one kind's address instead. A kind absent here hashes exactly as it
 * did before this existed. Bump a kind for a change a learner would notice in
 * the content, never for rewording, and never instead of `VERSION` when a
 * payload's SHAPE changes (hits skip validation; see above).
 *
 * A bump costs no learner their content: `node_content` keeps the payload a
 * learner already has beside its pointer (`docs/CONTENT-STORAGE.md`).
 *
 * 2: the learning-structure rewrite of Consume, Explain, Perform and Retain
 *    (`docs/RESEARCH-PROMPTS.md`, section 8).
 * 3: the second pass over the same four (`docs/RESEARCH-PHASES.md` §7): a
 *    reading that starts from a prerequisite, shorter prose, a check on a
 *    case the example did not work; a concrete Explain problem and the
 *    standard misconception; Perform's lesson first; Retain cards grounded in
 *    the reading's takeaways and typed by kind.
 * 4: consume only — the reading is written as beats, one phone card each, for
 *    the reels (`docs/RESEARCH-PHASES.md` §8).
 */
export const PROMPT_REV: Readonly<Partial<Record<CacheableKind, number>>> = {
  consume: 4,
  explain: 3,
  perform: 3,
  retain: 3,
};

const revOf = (kind: CacheableKind): string => {
  const rev = PROMPT_REV[kind];
  return rev ? `@${rev}` : "";
};

/**
 * Kinds whose output is a pure function of the request. `judge` is not one:
 * it grades a learner's own words, and caching that would replay someone
 * else's verdict.
 *
 * A runtime list rather than a bare union, because two things downstream have
 * to enumerate these and a hand-kept copy of the list drifts silently. It
 * already did: `RECORDED` in `afterBuild.ts` was its own `Set` of strings, and
 * the six phases the catalogue added in its growth to twelve generated content
 * that was never filed against the topic — so a `CONTENT_CACHE_VERSION` bump
 * or the TTL prune would have taken it back and re-billed the learner for it.
 * Deriving the set from this array is what makes that impossible rather than
 * merely fixed.
 */
export const CACHEABLE_KINDS = [
  "curriculum",
  "summary",
  "continentLinks",
  "consume",
  "explain",
  "discriminate",
  "socratic",
  "predict",
  "trace",
  "model",
  "feynman",
  "perform",
  "produce",
  "provenance",
  "steelman",
  "drill",
  "connect",
  "crucible",
  "recall",
  "retain",
] as const;

export type CacheableKind = (typeof CACHEABLE_KINDS)[number];

let cached: SupabaseClient | null | undefined;
let warned = false;

function admin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      warned = true;
      console.warn(
        JSON.stringify({
          evt: "content_cache_disabled",
          reason: "SUPABASE_SECRET_KEY is not set — every generation will hit the model",
        }),
      );
    }
    cached = null;
    return null;
  }
  cached = createClient(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Key-sorted stringify: two requests that differ only in property order —
 *  or in the order of a pool/label list — must land on the same key. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The address of one generation. Derived server-side from normalized inputs,
 *  never accepted from the client.
 *
 *  The separators are NUL bytes, not spaces — they cannot occur in a kind or
 *  in `stable()`'s output, so no two different inputs can collide by running
 *  together. (It is also why this file reads as binary to git and grep.)
 *
 *  Deliberately NOT split per output part: generation runs at temperature 0.6,
 *  so two runs with identical params produce different prose. A cached "part"
 *  keyed on params alone would be grafted onto text it was never written for
 *  — a "simpler version" of a section the learner never read. Parts of one
 *  payload are cached together, under this key, or not at all. */
export function contentKey(kind: CacheableKind, params: unknown): string {
  return createHash("sha256")
    .update(`v${VERSION} ${kind}${revOf(kind)} ${stable(params)}`)
    .digest("hex");
}

/** Has a person reviewed this row (W2.8)? False when the cache is unavailable. */
export async function isVerified(key: string): Promise<boolean> {
  const db = admin();
  if (!db) return false;
  const { data } = await db
    .from("content_cache")
    .select("verified")
    .eq("key", key)
    .maybeSingle();
  return (data as { verified?: boolean } | null)?.verified === true;
}

/** The stored payload, or null on a miss / when the cache is unavailable. */
export async function readContent<T>(key: string): Promise<T | null> {
  const db = admin();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc("content_cache_get", {
      cache_key: key,
    });
    if (error) throw new Error(error.message);
    return (data as T | null) ?? null;
  } catch (err) {
    // A cache that's down must never break a generation — fall through.
    console.error(
      JSON.stringify({
        evt: "content_cache_read_failed",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    return null;
  }
}

/** Batch read for the client's warm pass: one round-trip, keys → payloads. */
export async function readManyContent(keys: string[]): Promise<Record<string, unknown>> {
  const db = admin();
  if (!db || keys.length === 0) return {};
  try {
    const { data, error } = await db.rpc("content_cache_get_many", {
      cache_keys: keys,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ key: string; payload: unknown }>;
    return Object.fromEntries(rows.map((r) => [r.key, r.payload]));
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "content_cache_read_many_failed",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    return {};
  }
}

/**
 * Store a fresh generation. The promise is returned rather than swallowed: a
 * caller whose request ends the moment this is called — the streaming path,
 * where the last frame is the end of the response — has to await it, or the
 * write races the function shutting down. Everyone else lets it settle behind
 * the learner, who has their content already.
 */
export function writeContent(key: string, kind: string, payload: unknown): Promise<void> {
  const db = admin();
  if (!db) return Promise.resolve();
  // `.then` on a PostgrestBuilder is a thenable, not a Promise — wrapped so
  // the caller gets something it can await, catch and pass around.
  return Promise.resolve(
    db.from("content_cache").upsert({ key, kind, payload }, { onConflict: "key" }),
  ).then(({ error }) => {
    if (error)
      console.error(
        JSON.stringify({
          evt: "content_cache_write_failed",
          kind,
          error: error.message.slice(0, 300),
        }),
      );
  });
}

/** Keys per round trip when forgetting — an `.in()` travels in the URL. */
const FORGET_BATCH = 100;

/**
 * Forget the shared rows a deleted topic pointed at.
 *
 * Deleting a map used to leave every payload it had generated in the shared
 * cache, so rebuilding the same subject addressed the same rows and replayed
 * the exact cases, setups and rubrics the learner had already seen answered —
 * a second run that tested memory of the answer key. Deleting the topic now
 * takes its material with it, and the rebuild writes fresh.
 *
 * One exception, and it is the contract in `docs/CONTENT-STORAGE.md`: a row
 * another topic still holds *only as a pointer* stays, because that topic has
 * no copy of its own and removing the row would empty its screen. A topic that
 * kept the bytes loses nothing — its read falls back to the copy.
 *
 * Best-effort, like every write here: a failure costs a replayed pass, never
 * the delete that asked for it. Returns how many rows went.
 */
export async function forgetContent(
  keys: readonly string[],
  topicId: string,
  db: SupabaseClient | null = admin(),
): Promise<number> {
  if (!db || keys.length === 0) return 0;
  let gone = 0;
  try {
    for (let i = 0; i < keys.length; i += FORGET_BATCH) {
      const batch = keys.slice(i, i + FORGET_BATCH);
      const held = await db
        .from("node_content")
        .select("cache_key")
        .in("cache_key", batch)
        .neq("topic_id", topicId)
        .is("payload", null);
      if (held.error) throw new Error(held.error.message);
      const kept = new Set(
        ((held.data ?? []) as Array<{ cache_key: string }>).map((r) => r.cache_key),
      );
      const doomed = batch.filter((key) => !kept.has(key));
      if (!doomed.length) continue;
      const { error } = await db.from("content_cache").delete().in("key", doomed);
      if (error) throw new Error(error.message);
      gone += doomed.length;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "content_cache_forget_failed",
        topic: topicId,
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
  }
  return gone;
}
