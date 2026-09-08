// Create a topic, map and all. Onboarding's one write.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { createTopic, type NewTopic } from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

export async function POST(request: Request) {
  const who = await caller("topics");
  if (isResponse(who)) return who;
  const body = await jsonBody<NewTopic>(request);
  if (!body?.subject?.trim())
    return apiError("invalid", { requestId: who.requestId, reason: "subject" });
  try {
    const topic = await createTopic(who.db, who.userId, body);
    return withRequestId(NextResponse.json(topic, { status: 201 }), who.requestId);
  } catch (err) {
    logError("topic_create_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
