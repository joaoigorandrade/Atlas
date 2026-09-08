// One topic: read it, patch its run-level fields, or delete it.
//
// DELETE is one statement. `topics` is the root of the cascade, so nodes,
// edges, cards and node_content go with it and cannot be left behind — the
// guarantee lives in the foreign keys, not in cleanup code that has to be
// remembered at every call site. The shared content_cache is deliberately out
// of reach: it holds no learner text, only payloads addressed by a hash of
// prompt inputs, and is shared with every other learner on the same topic.

import { NextResponse } from "next/server";
import { logError, logEvent } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { deleteTopic, loadTopic, patchTopic, type TopicPatch } from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const who = await caller("topic");
  if (isResponse(who)) return who;
  const { id } = await params;
  try {
    const topic = await loadTopic(who.db, id);
    if (!topic) return apiError("notfound", { requestId: who.requestId });
    return withRequestId(NextResponse.json(topic), who.requestId);
  } catch (err) {
    logError("topic_read_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const who = await caller("topic");
  if (isResponse(who)) return who;
  const { id } = await params;
  const patch = await jsonBody<TopicPatch>(request);
  if (!patch) return apiError("invalid", { requestId: who.requestId, reason: "body" });
  try {
    await patchTopic(who.db, id, patch);
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("topic_patch_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const who = await caller("topic");
  if (isResponse(who)) return who;
  const { id } = await params;
  try {
    await deleteTopic(who.db, id);
    logEvent("topic_deleted", { user: who.userId, topic: id, req: who.requestId });
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("topic_delete_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
