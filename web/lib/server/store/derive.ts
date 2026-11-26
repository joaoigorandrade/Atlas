// The server is the authority on mastery state (W0.1).
//
// Both clients derive a node's state from its ledger — `stateFromPlan` in TS,
// its hand-kept mirror in Swift — and used to send the answer, which the store
// wrote as given. Two mirrors can disagree silently, and a hand-crafted delta
// could write `mastered` on an empty ledger. So after every node write the
// server re-derives state from what the row now says (plan, phases done, shaky
// reason, open gap children), with the web's own pure function, and stores
// that. The route hands corrections back and both clients adopt them.
//
// It also stamps `phase_closed_at` — when each phase first entered the ledger —
// which only the server can do honestly, since a client clock can be anything.

import {
  phasePlan,
  stateFromPlan,
  type PhaseId,
  type ProgressState,
} from "@/lib/curriculum";
import { fail, type Db } from "@/lib/server/store/shared";

export interface LedgerRow {
  id: string;
  is_gap: boolean;
  state: ProgressState;
  shaky_reason: string | null;
  phase_plan: PhaseId[] | null;
  phases_done: PhaseId[] | null;
  consume_progress: unknown;
  phase_closed_at: Record<string, string> | null;
}

/** A node's ledger after a write: what the client sent, plus every phase the
 *  row already holds or ever closed (`phase_closed_at`). The ledger only grows
 *  (`ledgerAfter`), so a shorter list is a stale device, not an undo — a second
 *  tab still on an old snapshot wrote `[consume, explain]` over a perform pass
 *  logged a minute before, and the node fell back to Learning.
 *  ponytail: the placement diagnostic can legitimately drop a node's last gate
 *  (`applyDiagnosticLedger`); it runs on a fresh map, so nothing is stored yet. */
export function mergeLedger(
  sent: readonly PhaseId[],
  stored: readonly PhaseId[] | null | undefined,
  closedAt: Record<string, string> | null | undefined,
): PhaseId[] {
  const kept = [...(stored ?? []), ...(Object.keys(closedAt ?? {}) as PhaseId[])];
  return [...sent, ...kept.filter((p, i) => !sent.includes(p) && kept.indexOf(p) === i)];
}

/** What one row should say, given how many gap children are still open under
 *  it. Pure — the half of `settleNodes` the tests pin. A gap node's state is
 *  its own flag, not a ledger, so it is left as stored. */
export function deriveRow(
  row: LedgerRow,
  gaps: number,
  now: string,
): { state: ProgressState; closedAt: Record<string, string> } {
  const done = row.phases_done ?? [];
  const closedAt = { ...(row.phase_closed_at ?? {}) };
  for (const p of done) closedAt[p] ??= now;
  if (row.is_gap) return { state: row.state, closedAt };
  const state = stateFromPlan(
    phasePlan({ phasePlan: row.phase_plan ?? undefined }),
    done,
    {
      shaky: (row.shaky_reason ?? undefined) as never,
      gaps,
      // Work begun with nothing finished — a part-read reading pass. A client
      // saying "learning" is not a mastery claim, so it is believed.
      started: row.consume_progress != null || row.state !== "unknown",
    },
  );
  return { state, closedAt };
}

/**
 * Re-derive `ids` (plus nothing else) on `topicId` and write back what moved.
 * Returns the stored state of every settled node, so the route can tell each
 * client where it disagreed.
 */
export async function settleNodes(
  db: Db,
  topicId: string,
  ids: string[],
): Promise<Record<string, ProgressState>> {
  if (ids.length === 0) return {};
  const [{ data: rows, error }, { data: edges, error: edgeError }] = await Promise.all([
    db
      .from("nodes")
      .select(
        "id, is_gap, state, shaky_reason, phase_plan, phases_done, consume_progress, phase_closed_at",
      )
      .eq("topic_id", topicId),
    db.from("edges").select("from_id, to_id").eq("topic_id", topicId),
  ]);
  if (error) fail("settleNodes", error);
  if (edgeError) fail("settleNodes/edges", edgeError);
  const all = (rows ?? []) as LedgerRow[];
  const gapIds = new Set(all.filter((r) => r.is_gap).map((r) => r.id));
  const want = new Set(ids);
  const now = new Date().toISOString();
  const out: Record<string, ProgressState> = {};
  for (const row of all) {
    if (!want.has(row.id)) continue;
    const gaps = (edges ?? []).filter(
      (e) => e.from_id === row.id && gapIds.has(e.to_id),
    ).length;
    const { state, closedAt } = deriveRow(row, gaps, now);
    out[row.id] = state;
    const stamped =
      Object.keys(closedAt).length !== Object.keys(row.phase_closed_at ?? {}).length;
    if (state === row.state && !stamped) continue;
    const { error: upError } = await db
      .from("nodes")
      .update({ state, phase_closed_at: closedAt })
      .eq("topic_id", topicId)
      .eq("id", row.id);
    if (upError) fail("settleNodes/update", upError);
  }
  return out;
}

/** The parents a set of removed gap nodes hang off — read before the delete,
 *  since the edges go with it. Closing the last gap is what lifts a parent. */
export async function gapParents(db: Db, topicId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("edges")
    .select("from_id")
    .eq("topic_id", topicId)
    .in("to_id", ids);
  if (error) fail("gapParents", error);
  return (data ?? []).map((e) => e.from_id as string);
}
