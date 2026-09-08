// The map's rows: a node's own fields, and the edges that hang off it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";
import type { NodeDelta } from "@/lib/persistence";

// ------------------------------------------------------------------ nodes --

/**
 * Apply a batch of node deltas. This is the only write path for the map.
 *
 * A drag is one row's x/y; finishing Crucible is one row's state. What used to
 * be a whole-run upload on a 1.2-second debounce is now a payload proportional
 * to what actually changed — which is what makes the map feel live rather than
 * saved.
 *
 * Upsert, not update: `spawnGap` invents a node client-side and the same call
 * that sets its state has to be able to create it.
 */
export async function applyNodeDeltas(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  deltas: NodeDelta[],
): Promise<void> {
  if (deltas.length === 0) return;
  const rows = deltas.map((d) => ({
    topic_id: topicId,
    id: d.id,
    user_id: userId,
    ...(d.label !== undefined ? { label: d.label } : null),
    ...(d.summary !== undefined ? { summary: d.summary } : null),
    ...(d.g !== undefined ? { g: d.g } : null),
    ...(d.week !== undefined ? { week: d.week } : null),
    ...(d.x !== undefined ? { x: d.x } : null),
    ...(d.y !== undefined ? { y: d.y } : null),
    ...(d.isGap !== undefined ? { is_gap: d.isGap } : null),
    ...(d.state !== undefined ? { state: d.state } : null),
    ...(d.shakyReason !== undefined ? { shaky_reason: d.shakyReason } : null),
    ...(d.reviewed !== undefined ? { reviewed: d.reviewed } : null),
    ...(d.consumeProgress !== undefined ? { consume_progress: d.consumeProgress } : null),
    ...(d.socraticProgress !== undefined
      ? { socratic_progress: d.socraticProgress }
      : null),
    ...(d.feynmanProgress !== undefined ? { feynman_progress: d.feynmanProgress } : null),
    ...(d.connectProgress !== undefined ? { connect_progress: d.connectProgress } : null),
  }));
  const { error } = await db.from("nodes").upsert(rows, { onConflict: "topic_id,id" });
  if (error) fail("applyNodeDeltas", error);

  const edges = deltas.flatMap((d) =>
    (d.prereqs ?? []).map((from) => ({
      topic_id: topicId,
      from_id: from,
      to_id: d.id,
      user_id: userId,
      dashed: false,
    })),
  );
  if (edges.length) {
    const { error: edgeError } = await db
      .from("edges")
      .upsert(edges, { onConflict: "topic_id,from_id,to_id", ignoreDuplicates: true });
    if (edgeError) fail("applyNodeDeltas/edges", edgeError);
  }
}

/** Remove nodes and every edge touching them — a resolved gap leaving the map.
 *  Two statements rather than a cascade: `edges` hangs off the topic, not off
 *  the node, because an edge outlives either endpoint being re-planned. */
export async function deleteNodes(
  db: SupabaseClient,
  topicId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.from("nodes").delete().eq("topic_id", topicId).in("id", ids);
  if (error) fail("deleteNodes", error);
  for (const column of ["from_id", "to_id"] as const) {
    const { error: edgeError } = await db
      .from("edges")
      .delete()
      .eq("topic_id", topicId)
      .in(column, ids);
    if (edgeError) fail("deleteNodes/edges", edgeError);
  }
}
