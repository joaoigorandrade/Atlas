// The map's only write path: a batch of node deltas.
//
// A drag is one node's x/y. Finishing Crucible is one node's state. What used
// to be a whole-run JSON upload on every change is now a payload the size of
// what actually changed.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import {
  applyNodeDeltas,
  deleteNodes,
  ownsTopic,
  type NodeDelta,
} from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

/** Bounded so one request can't rewrite an unbounded map. A real batch is a
 *  handful of nodes; the largest honest one is a re-plan laying down a map. */
const MAX_DELTAS = 200;

export async function PATCH(request: Request, { params }: Params) {
  const who = await caller("nodes");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ deltas?: NodeDelta[]; remove?: string[] }>(request);
  const deltas = Array.isArray(body?.deltas) ? body.deltas : null;
  const remove = Array.isArray(body?.remove) ? body.remove.slice(0, MAX_DELTAS) : [];
  if (!deltas) return apiError("invalid", { requestId: who.requestId, reason: "deltas" });
  if (deltas.length > MAX_DELTAS)
    return apiError("invalid", { requestId: who.requestId, reason: "too_many" });
  if (deltas.some((d) => typeof d?.id !== "string" || !d.id))
    return apiError("invalid", { requestId: who.requestId, reason: "node_id" });

  try {
    // The upsert would otherwise create rows under a topic the caller doesn't
    // own — RLS checks `user_id`, which this route supplies, not `topic_id`.
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await applyNodeDeltas(who.db, who.userId, id, deltas);
    // After the upserts, so a re-plan that replaces a gap with a real node in
    // one batch lands the replacement before the old row goes.
    await deleteNodes(who.db, id, remove);
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("nodes_patch_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
