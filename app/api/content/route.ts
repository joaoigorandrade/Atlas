// The batch warm. The client posts the same request bodies it would send to
// /api/generate; this route answers only from `content_cache` and never calls
// a model, so it is cheap enough to fire on every map open.
//
// One round-trip fills the whole neighbourhood the learner is about to walk
// through — every phase of theirs (or anyone's) that has been generated before
// opens with no overlay at all. Misses come back as misses; the warm queue
// then generates them in the background, ahead of the click.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import {
  apiError,
  apiErrorFrom,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { readManyContent } from "@/lib/server/contentCache";
import { BadRequest, resolveJob, type GenerateBody } from "@/lib/server/job";
import { createClient } from "@/lib/supabase/server";

/** A pure cache read — bounded so one request can't sweep the table. */
const MAX_ITEMS = 24;

interface ContentBody {
  items?: GenerateBody[];
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  // An outage is not a sign-out — see the same guard in /api/generate.
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "content" });
    return apiError("upstream", { requestId, status: 503 });
  }
  if (!claims?.claims?.sub) return apiError("auth", { requestId });

  let body: ContentBody;
  try {
    body = (await request.json()) as ContentBody;
  } catch {
    return apiError("invalid", { requestId, reason: "body" });
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  // Map each item to its cache key, dropping anything malformed or uncacheable
  // rather than failing the batch — a warm is best-effort by nature.
  const keyed = items.map((item, index) => {
    try {
      const job = resolveJob(item);
      return job.key ? { index, key: job.key } : null;
    } catch (err) {
      // A malformed item is dropped — a warm is best-effort by nature. Anything
      // else used to escape as an uncaught 500 and fail the whole batch.
      if (err instanceof BadRequest) return null;
      logError("content_resolve_failed", err, { req: requestId });
      return null;
    }
  });

  const keys = [...new Set(keyed.filter((k) => k !== null).map((k) => k!.key))];
  let found: Record<string, unknown>;
  try {
    found = await readManyContent(keys);
  } catch (err) {
    logError("content_read_failed", err, { req: requestId });
    return apiErrorFrom(err, { requestId });
  }

  // Answer positionally: the client posted an ordered list and knows which
  // index is which screen.
  const hits: Record<number, unknown> = {};
  for (const entry of keyed) {
    if (!entry) continue;
    const payload = found[entry.key];
    if (payload !== undefined) hits[entry.index] = payload;
  }
  return withRequestId(NextResponse.json({ hits }), requestId);
}
