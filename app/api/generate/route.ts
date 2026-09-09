// The single content-generation endpoint. The browser posts a kind + context;
// the server returns validated content in the exact shapes the client renders.
// The API key stays server-side.
//
// Cache first (see lib/server/contentCache.ts): every cacheable kind is
// addressed by a hash of its prompt inputs, so a request whose content already
// exists returns from Postgres in milliseconds — no model call, no overlay.
// Only a genuine miss reaches OpenRouter.
//
// Protection (#18): requires a signed-in Supabase session, caps every input
// length (in lib/server/job.ts), and logs every call that actually generates to
// the generation_log table. There is deliberately no quota and no spend
// ceiling: generation is metered by the log, not gated by it, so the only
// brakes on cost are the cache, the prompt caps and the model chosen.

import { NextResponse } from "next/server";
import { graphFromMapNodes, type MapNode } from "@/lib/curriculum";
import { logError, logEvent } from "@/lib/log";
import {
  apiError,
  apiErrorFrom,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { readContent, writeContent } from "@/lib/server/contentCache";
import {
  logGenerationCalls,
  recordContent,
  startCurriculumWarm,
} from "@/lib/server/afterBuild";
import { resolveJob, type GenerateBody, type Job } from "@/lib/server/job";
import {
  framesToPayload,
  ndjsonResponse,
  ndjsonStream,
  payloadToFrames,
} from "@/lib/server/stream";
import { createClient } from "@/lib/supabase/server";

// Content generation is a real LLM round-trip — allow it time. It has to fit
// TWO of them back to back: `generateMapStream` falls back to the single-shot
// `generateMap` when the stream dies before its first concept, and each call is
// capped at `OPENROUTER_TIMEOUT_MS` (90s). At 120 the fallback was started with
// 30s left and killed by the platform mid-flight, so a slow map came back as a
// 504 — "Não conseguimos montar seu mapa agora" — instead of the map the
// fallback was about to produce.
export const maxDuration = 300;

/** Same error → response mapping used by the plain path and the "peek the
 *  first streamed frame before committing to a streaming response" path.
 *
 *  `apiErrorFrom` classifies: a `BadRequest` becomes a 400 `invalid`, an
 *  `OpenRouterError` keeps its own status, anything else is a 502 `upstream`.
 *  The upstream body never travels — only the code does. */
function errorResponse(err: unknown, prefetch: boolean, requestId: string): NextResponse {
  // A failed warm is silent — nobody is looking at it.
  if (prefetch) return new NextResponse(null, { status: 204 });
  return apiErrorFrom(err, { requestId });
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  // Auth first: an anonymous caller must never spend OpenRouter credit.
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  // A Supabase outage is not a signed-out learner. Answering 401 here would
  // send a perfectly valid session to the login screen; 503 keeps them where
  // they are and offers a retry.
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "generate" });
    return apiError("upstream", { requestId, status: 503 });
  }
  const userId = claims?.claims?.sub;
  if (!userId) return apiError("auth", { requestId });

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return apiError("invalid", { requestId, reason: "body" });
  }

  let job;
  try {
    job = resolveJob(body);
  } catch (err) {
    // Every failure here answers, including the ones that used to escape as an
    // uncaught 500 with a Next stack page attached.
    logError("resolve_job_failed", err, { req: requestId });
    return apiErrorFrom(err, { requestId });
  }

  // A background warm that misses is not worth making the learner wait for on
  // some later request — but it is worth generating.
  const prefetch = body.prefetch === true;
  // Only a real (non-prefetch) request streams — nobody's watching a background
  // warm, so it stays on the simple await-the-whole-thing path.
  const streaming = !prefetch && !!job.stream && !!job.shape;

  // ---- the fast path: someone has already generated exactly this ----------
  if (job.key) {
    const hit = await readContent<Record<string, unknown>>(job.key);
    if (hit) {
      logEvent("generate_cache_hit", {
        user: userId,
        kind: job.kind,
        req: requestId,
      });
      // A hit is content the learner now has, even though nothing was
      // generated for it — record it against their topic exactly as a miss is.
      recordContent(supabase, body, job, userId, hit);
      // A hit is replayed in whichever format the caller asked for, so the
      // client reads one wire shape whether the content is seconds or weeks old.
      if (streaming)
        return ndjsonResponse(payloadToFrames(hit, job.shape!), "hit", requestId);
      return withRequestId(
        NextResponse.json(hit, { headers: { "x-atlas-cache": "hit" } }),
        requestId,
      );
    }
  }

  // Accounting in one place — the background warm in startCurriculumWarm goes
  // through the same helper, so every model call this server makes lands in the
  // log whether a learner asked for it or the warm did.
  const jobId = crypto.randomUUID();
  await logGenerationCalls(supabase, job, { jobId, requestId });

  logEvent("generate_request", {
    user: userId,
    kind: job.kind,
    job: jobId,
    calls: job.cost ?? 1,
    prefetch,
    req: requestId,
  });

  // A finished build is the one moment the next click is perfectly
  // predictable — and the learner is about to spend half a minute on the
  // placement questions. Fill the frontier behind the response.
  const onPayload = (payload: Record<string, unknown>) => {
    if (job.kind !== "curriculum" || !Array.isArray(payload.nodes)) return;
    // Same derivation the client uses — the map travels as a flat node list and
    // the graph is derived from it on both sides (see `graphFromMapNodes`).
    const graph = graphFromMapNodes(payload.nodes as MapNode[]);
    startCurriculumWarm(supabase, graph, body, userId);
  };

  /** Everything that happens when a complete payload lands, whichever path
   *  produced it. The streaming path assembles its payload from frames, so
   *  this is the only place both paths meet. */
  const onLanded = (payload: Record<string, unknown>) => {
    recordContent(supabase, body, job, userId, payload);
    onPayload(payload);
  };

  if (streaming) return streamGeneration(job, userId, prefetch, onLanded, requestId);

  try {
    const payload = await job.run();
    // Write-through, not awaited: the learner gets their content immediately
    // and everyone after them gets it from Postgres.
    if (job.key) void writeContent(job.key, job.kind, payload);
    recordContent(supabase, body, job, userId, payload);
    onPayload(payload);
    return withRequestId(
      NextResponse.json(payload, { headers: { "x-atlas-cache": "miss" } }),
      requestId,
    );
  } catch (err) {
    logError("generate_failed", err, {
      user: userId,
      kind: job.kind,
      req: requestId,
    });
    return errorResponse(err, prefetch, requestId);
  }
}

/**
 * Stream a job's frames, and cache the assembled payload when — and only when
 * — a complete set of them arrives.
 *
 * `ndjsonStream` peeks the first frame before committing to a 200, so a
 * genuine failure (bad key, upstream down) still surfaces as a normal error
 * instead of an empty stream. Each streaming generator already falls back to
 * its single-shot, retried path internally, so reaching the error branch here
 * means that fallback failed too.
 */
function streamGeneration(
  job: Job,
  userId: string,
  prefetch: boolean,
  onPayload: (payload: Record<string, unknown>) => void,
  requestId: string,
): Promise<Response> {
  return ndjsonStream(job.stream!(), {
    requestId,
    onComplete: async (frames) => {
      // `framesToPayload` returns null on a short or gappy set. Caching that
      // would be the worst kind of bug: hits skip validation, so a truncated
      // payload would flow straight into the renderer for everyone after.
      const payload = framesToPayload(frames, job.shape!);
      if (!payload) {
        logEvent("generate_stream_incomplete", {
          user: userId,
          kind: job.kind,
          frames: frames.length,
          req: requestId,
        });
        return;
      }
      // Awaited, unlike the unary path's: there, the write is started before
      // the response is returned and the request is still open behind it. Here
      // the last frame *is* the end of the request, so a write left running
      // after it is one that may never land — which is exactly what happened
      // to a lens the learner opened, generated and was billed for twice.
      if (job.key) await writeContent(job.key, job.kind, payload);
      onPayload(payload);
    },
    onError: (err, phase) => {
      // Mid-stream, bytes are already flowing as a 200 — the status can't
      // change now. `ndjsonStream` writes a terminal `__error` frame instead,
      // which is what lets the client stop treating a truncated stream as a
      // finished one. Nothing gets cached either way, so a retry regenerates.
      logError(phase === "first" ? "generate_failed" : "generate_stream_failed", err, {
        user: userId,
        kind: job.kind,
        req: requestId,
      });
    },
    errorResponse: (err) => errorResponse(err, prefetch, requestId),
  });
}
