// One continent: rename it, or dissolve it. Dissolving never takes a map with
// it — `topics.continent_id` is `on delete set null`.

import { NextResponse } from "next/server";
import { logError, logEvent } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { deleteContinent, ownsContinent, renameContinent } from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const who = await caller("continent");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ name?: unknown }>(request);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return apiError("invalid", { requestId: who.requestId, reason: "name" });
  try {
    if (!(await ownsContinent(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await renameContinent(who.db, id, name);
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("continent_patch_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const who = await caller("continent");
  if (isResponse(who)) return who;
  const { id } = await params;
  try {
    if (!(await ownsContinent(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await deleteContinent(who.db, id);
    logEvent("continent_deleted", {
      user: who.userId,
      continent: id,
      req: who.requestId,
    });
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("continent_delete_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
