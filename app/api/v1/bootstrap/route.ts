// Everything the app draws, in one round trip.
//
// This replaces three separate reads (the run core, the library list, and the
// generated-content column) with a single request that returns the learner's
// profile and their whole library — every topic, its map, its mastery states
// and its cards. It is a few hundred rows; the large thing, generated content,
// is deliberately not here and is fetched per node by the content route for the
// nodes about to be shown.
//
// One round trip is what makes first paint instant, and what lets a client keep
// a complete offline mirror without inventing a sync protocol.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { getProfile, loadLibrary } from "@/lib/server/store";
import { caller, isResponse } from "@/lib/server/v1";

export async function GET() {
  const who = await caller("bootstrap");
  if (isResponse(who)) return who;
  try {
    const [profile, topics] = await Promise.all([
      getProfile(who.db, who.userId),
      loadLibrary(who.db),
    ]);
    return withRequestId(NextResponse.json({ profile, topics }), who.requestId);
  } catch (err) {
    logError("bootstrap_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
