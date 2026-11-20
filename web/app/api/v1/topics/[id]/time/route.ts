// Active time on one phase of one node — the measurement the per-cell time
// budgets (`CELL_BUDGET`) are tuned against. Both clients count only visible,
// recently-used seconds and post them here when the phase closes or the page
// hides; the database adds them atomically (`add_phase_seconds`).

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { PHASE_ORDER, type PhaseId } from "@/lib/curriculum";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const who = await caller("phaseTime");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ nodeId?: string; phase?: string; seconds?: number }>(
    request,
  );
  const seconds = Math.round(Number(body?.seconds));
  if (
    !body?.nodeId ||
    !PHASE_ORDER.includes(body.phase as PhaseId) ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    return apiError("invalid", { requestId: who.requestId, reason: "time" });
  try {
    const { error } = await who.db.rpc("add_phase_seconds", {
      p_topic: id,
      p_node: body.nodeId.slice(0, 200),
      p_phase: body.phase,
      p_seconds: Math.min(seconds, 3600),
    });
    if (error) throw error;
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("phase_time_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
