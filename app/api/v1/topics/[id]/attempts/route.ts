// One phase close, pass or fail (W0.2). A log: rows are only ever added.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { PHASE_ORDER, type PhaseId } from "@/lib/curriculum";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const who = await caller("attempts");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{
    nodeId?: string;
    phase?: string;
    passed?: boolean;
    score?: number;
    detail?: Record<string, unknown>;
  }>(request);
  if (
    !body?.nodeId ||
    typeof body.passed !== "boolean" ||
    !PHASE_ORDER.includes(body.phase as PhaseId)
  )
    return apiError("invalid", { requestId: who.requestId, reason: "attempt" });
  const score = Number(body.score);
  const detail =
    body.detail &&
    typeof body.detail === "object" &&
    JSON.stringify(body.detail).length < 4000
      ? body.detail
      : {};
  try {
    // RLS checks the topic is the caller's; a foreign topic_id is refused there.
    const { error } = await who.db.from("phase_attempts").insert({
      user_id: who.userId,
      topic_id: id,
      node_id: body.nodeId.slice(0, 200),
      phase: body.phase,
      passed: body.passed,
      score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null,
      detail,
    });
    if (error) throw error;
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("attempt_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
