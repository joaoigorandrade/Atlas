// The learner's own row: daily target, interface language, and the adherence
// streak that used to be copied into every topic's snapshot (and a third time
// into the iOS UserDefaults, agreeing with neither).

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { getProfile, patchProfile, type ProfilePatch } from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

export async function GET() {
  const who = await caller("profile");
  if (isResponse(who)) return who;
  try {
    return withRequestId(
      NextResponse.json(await getProfile(who.db, who.userId)),
      who.requestId,
    );
  } catch (err) {
    logError("profile_read_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function PATCH(request: Request) {
  const who = await caller("profile");
  if (isResponse(who)) return who;
  const patch = await jsonBody<ProfilePatch>(request);
  if (!patch) return apiError("invalid", { requestId: who.requestId, reason: "body" });
  try {
    return withRequestId(
      NextResponse.json(await patchProfile(who.db, who.userId, patch)),
      who.requestId,
    );
  } catch (err) {
    logError("profile_write_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
