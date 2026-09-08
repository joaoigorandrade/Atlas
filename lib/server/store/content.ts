// One generated payload, addressed the way a screen asks for it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";

// ----------------------------------------------------------- node content --

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
 * `cacheKey` is preferred over `payload`: the shared `content_cache` already
 * holds the bytes once for every learner, so a pointer is all a topic needs.
 * A kind without a stable key stores its payload here instead.
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
      payload: content.cacheKey ? null : (content.payload ?? null),
    },
    { onConflict: "topic_id,node_id,kind,variant" },
  );
  if (error) fail("putContent", error);
}
