// One generated payload, addressed the way a screen asks for it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";

// ----------------------------------------------------------- node content --

/** The slot each generator writes its payload into — the envelope `job.run()`
 *  returns and `content_cache` therefore stores. See `renderShape`. */
const SLOT: Record<string, string> = {
  summary: "summary",
  consume: "chunks",
  model: "beats",
  socratic: "steps",
  feynman: "beats",
  connect: "content",
  crucible: "content",
  retain: "content",
};

/**
 * A stored payload as the screen renders it — the array, or the object, with
 * the generator's envelope taken off.
 *
 * This is the one place that envelope is ever removed, and the reason is that
 * every client would otherwise have to know it. A stored item now arrives in
 * exactly the shape a client assembles from live stream frames, so a screen
 * has one decoder instead of two. The web learned the alternative as
 * `chunks.map is not a function`; iOS learned it as a `try?` that dropped
 * every row in silence and regenerated content the topic already owned.
 *
 * Rows the normalization backfilled from the old `caches` column hold the
 * inner value already — so an absent slot means this is unwrapped, not that
 * it is malformed. See `docs/CONTENT-STORAGE.md`.
 */
export function renderShape(kind: string, payload: unknown): unknown {
  const slot = SLOT[kind];
  if (!slot || !payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  const held = (payload as Record<string, unknown>)[slot];
  return held === undefined ? payload : held;
}

/** Where a generated payload lives, as a screen asks for it. */
export interface ContentAddress {
  nodeId: string;
  kind: string;
  variant?: string;
}

export interface ContentRow extends ContentAddress {
  variant: string;
  cacheKey: string | null;
  payload: unknown;
}

export async function readContentRows(
  db: SupabaseClient,
  topicId: string,
  addresses: ContentAddress[],
): Promise<ContentRow[]> {
  let query = db
    .from("node_content")
    .select("node_id, kind, variant, cache_key, payload")
    .eq("topic_id", topicId);
  // An empty address list means "everything this topic has" — what an offline
  // mirror asks for once. Otherwise narrow to the nodes and kinds requested,
  // which is what a screen about to open asks for.
  if (addresses.length) {
    const nodes = [...new Set(addresses.map((a) => a.nodeId))];
    const kinds = [...new Set(addresses.map((a) => a.kind))];
    query = query.in("node_id", nodes).in("kind", kinds);
  }
  const { data, error } = await query;
  if (error) fail("readContentRows", error);
  return (
    (data ?? []) as Array<{
      node_id: string;
      kind: string;
      variant: string;
      cache_key: string | null;
      payload: unknown;
    }>
  ).map((r) => ({
    nodeId: r.node_id,
    kind: r.kind,
    variant: r.variant,
    cacheKey: r.cache_key,
    payload: r.payload,
  }));
}

/**
 * Record that this topic has this payload.
 *
 * Written by the generate route, never by a client: the moment content exists
 * — freshly generated or served from the shared cache — it belongs to the
 * topic, on the server, with no upload. That is what retired the `caches`
 * column and its 4-second debounce.
 *
 * Both the pointer and the bytes are stored when both are known. The pointer
 * is the fast path — the shared `content_cache` holds the payload once for
 * every learner, and a batch of pointers is one RPC — but it is only ever a
 * pointer, and two things delete what it points at: the TTL prune (now fenced
 * off by `prune_content_cache`) and a `CONTENT_CACHE_VERSION` bump, which
 * abandons every shared row on purpose. The copy here is what makes "a topic
 * keeps its content until the learner deletes the topic" true through both.
 *
 * A payload is never overwritten with nothing: a caller that has only the
 * pointer leaves whatever copy the row already holds alone.
 */
export async function putContent(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  at: ContentAddress,
  content: { cacheKey?: string; payload?: unknown },
): Promise<void> {
  const { error } = await db.from("node_content").upsert(
    {
      topic_id: topicId,
      node_id: at.nodeId,
      kind: at.kind,
      variant: at.variant ?? "",
      user_id: userId,
      cache_key: content.cacheKey ?? null,
      ...(content.payload === undefined ? null : { payload: content.payload }),
    },
    { onConflict: "topic_id,node_id,kind,variant" },
  );
  if (error) fail("putContent", error);
}
