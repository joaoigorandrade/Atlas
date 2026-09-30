// The map's rows: a node's own fields, and the edges that hang off it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";
import type { NodeDelta } from "@/lib/persistence";
import type { NodeDifficulty, NodeImportance } from "@/lib/curriculum";
import type { GenerateBody } from "@/lib/server/jobInput";

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
    // `!= null` on every NOT NULL column, `!== undefined` on the nullable ones.
    // The split is the whole point: a wire `null` on a NOT NULL column is a
    // client saying nothing useful, and letting it fall through leaves the
    // column default standing (`kind` → 'concept') instead of 500ing the batch
    // — which is what `null value in column "kind"` was in production. On a
    // nullable column `null` is the real signal for "clear it", so un-shaking a
    // node and clearing a finished session must still go through.
    ...(d.label != null ? { label: d.label } : null),
    ...(d.summary !== undefined ? { summary: d.summary } : null),
    ...(d.g != null ? { g: d.g } : null),
    ...(d.week != null ? { week: d.week } : null),
    ...(d.x != null ? { x: d.x } : null),
    ...(d.y != null ? { y: d.y } : null),
    ...(d.isGap != null ? { is_gap: d.isGap } : null),
    ...(d.state != null ? { state: d.state } : null),
    ...(d.shakyReason !== undefined ? { shaky_reason: d.shakyReason } : null),
    ...(d.reviewed != null ? { reviewed: d.reviewed } : null),
    ...(d.kind != null ? { kind: d.kind } : null),
    ...(d.domain != null ? { domain: d.domain } : null),
    ...(d.importance != null ? { importance: d.importance } : null),
    ...(d.difficulty != null ? { difficulty: d.difficulty } : null),
    ...(d.phasePlan != null ? { phase_plan: d.phasePlan } : null),
    ...(d.phasesDone != null ? { phases_done: d.phasesDone } : null),
    ...(d.consumeProgress !== undefined ? { consume_progress: d.consumeProgress } : null),
    ...(d.socraticProgress !== undefined
      ? { socratic_progress: d.socraticProgress }
      : null),
    ...(d.feynmanProgress !== undefined ? { feynman_progress: d.feynmanProgress } : null),
    ...(d.connectProgress !== undefined ? { connect_progress: d.connectProgress } : null),
    ...(d.phaseProgress != null ? { phase_progress: d.phaseProgress } : null),
  }));
  // One upsert per column shape. PostgREST pads a batch out to the *union* of
  // its rows' keys, filling what a row doesn't name with NULL — so sending a
  // freshly spawned gap (no `kind`, no `phase_plan`) alongside a node that
  // carries both wrote NULL into two NOT NULL columns and 502'd the whole
  // batch, wedging every later write for that run. Grouping keeps each
  // statement homogeneous, so an unnamed column falls to its default.
  const shapes = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = Object.keys(row).sort().join(",");
    const group = shapes.get(key);
    if (group) group.push(row);
    else shapes.set(key, [row]);
  }
  for (const group of shapes.values()) {
    const { error } = await db.from("nodes").upsert(group, { onConflict: "topic_id,id" });
    if (error) fail("applyNodeDeltas", error);
  }

  const edges = deltas.flatMap((d) =>
    (d.prereqs ?? []).map((from) => ({
      topic_id: topicId,
      from_id: from,
      to_id: d.id,
      user_id: userId,
      // A gap hangs off its parent by a dashed edge — the map draws it that
      // way, and it is not a prerequisite. Written solid, it came back as one.
      dashed: d.isGap === true,
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

// ------------------------------------------------------------------ cells --

type CellRows = Map<
  string,
  {
    importance?: NodeImportance;
    difficulty?: NodeDifficulty;
    rerun?: Record<string, number>;
  }
>;

/**
 * Stamp a per-node generation with the node's stored importance and
 * difficulty, *on the server* — the same move as `withTopicAxes`, for the
 * same reason: every path that hashes a job calls it first, so the browser,
 * the phone and the frontier warm address the same row without either client
 * carrying the cell. Whatever a client sends is dropped.
 *
 * `rerun` rides the same read (W1.2, W1.4). Which time through a node's
 * Crucible or Perform this is comes from the attempts log — a Crucible pass
 * (cold or guided) and every Perform run bump it — so a redo, the cold
 * re-attempt after a guided pass, and a re-run after a report all get a case
 * the learner has not already solved, and neither client keeps a counter.
 */
export async function withNodeCell<T extends GenerateBody>(
  db: SupabaseClient,
  body: T,
  memo?: Map<string, Promise<CellRows>>,
): Promise<T> {
  const { importance: _i, nodeDifficulty: _d, rerun: _r, ...rest } = body;
  if (!body.topicId || !body.nodeId) return rest as T;
  let pending = memo?.get(body.topicId);
  if (!pending) {
    pending = cellRows(db, body.topicId);
    memo?.set(body.topicId, pending);
  }
  const row = (await pending).get(body.nodeId);
  if (!row) return rest as T;
  const rerun = row.rerun?.[body.kind] ?? 0;
  return {
    ...rest,
    importance: row.importance,
    nodeDifficulty: row.difficulty,
    ...(rerun ? { rerun } : null),
  } as T;
}

/** What bumps a node's `rerun` for each kind that has one. */
const RERUN: Record<string, (passed: boolean) => boolean> = {
  crucible: (passed) => passed,
  perform: () => true,
};

async function cellRows(db: SupabaseClient, topicId: string): Promise<CellRows> {
  const [{ data, error }, { data: tries, error: triesError }] = await Promise.all([
    db.from("nodes").select("id, importance, difficulty").eq("topic_id", topicId),
    db
      .from("phase_attempts")
      .select("node_id, phase, passed")
      .eq("topic_id", topicId)
      .in("phase", Object.keys(RERUN)),
  ]);
  if (error) fail("read node cells", error);
  if (triesError) fail("read node attempts", triesError);
  const rows: CellRows = new Map(
    (data ?? []).map((r) => [
      r.id,
      { importance: r.importance, difficulty: r.difficulty },
    ]),
  );
  for (const t of (tries ?? []) as {
    node_id: string;
    phase: string;
    passed: boolean;
  }[]) {
    const row = rows.get(t.node_id);
    if (!row || !RERUN[t.phase]?.(t.passed)) continue;
    row.rerun = { ...row.rerun, [t.phase]: (row.rerun?.[t.phase] ?? 0) + 1 };
  }
  return rows;
}
