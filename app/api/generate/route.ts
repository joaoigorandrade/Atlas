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
// length (in lib/server/job.ts), logs every call that actually generates to the
// generation_log table, and declines with a 429 once a learner has started
// GENERATION_DAILY_QUOTA jobs in a UTC day (Phase 0.6) or this deployment has
// made GENERATION_MONTHLY_CALLS model calls in the month (Phase 3). A cache hit
// is free and is answered before either ceiling is consulted.

import { after, NextResponse } from "next/server";
import {
  displayStates,
  graphFromMapNodes,
  initialStates,
  type ConceptGraph,
  type ConceptNode,
  type MapNode,
} from "@/lib/curriculum";
import { logError, logEvent } from "@/lib/log";
import {
  apiError,
  apiErrorFrom,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { readContent, writeContent } from "@/lib/server/contentCache";
import { resolveJob, type GenerateBody, type Job } from "@/lib/server/job";
import {
  framesToPayload,
  ndjsonResponse,
  ndjsonStream,
  payloadToFrames,
} from "@/lib/server/stream";
import { generationBlocked } from "@/lib/server/quota";
import { createClient } from "@/lib/supabase/server";

// Content generation is a real LLM round-trip — allow it time.
export const maxDuration = 120;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/**
 * Record the job's model calls in `generation_log`.
 *
 * Nothing here can decline a job — `generationBlocked` already did. The rows are written
 * before the work runs so a generation that fails upstream still shows up in
 * the spend picture — one row per model call the job may make, all sharing a
 * `job_id` so calls can still be grouped back into the surface that caused
 * them.
 */
async function logGenerationCalls(
  supabase: SupabaseLike,
  job: Job,
  opts: { jobId: string; requestId?: string },
): Promise<void> {
  const calls = Math.max(1, job.cost ?? 1);
  const { error } = await supabase.from("generation_log").insert(
    Array.from({ length: calls }, () => ({
      kind: job.kind.slice(0, 40),
      job_id: opts.jobId,
    })),
  );
  // Non-fatal (the table may lag a migration) but loudly logged.
  if (error) logError("generation_log_insert_failed", error, { req: opts.requestId });
}

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

  // Everything from here on costs money, so this is where the day's ceiling
  // applies — after the free cache hit, before the first model call.
  const blocked = await generationBlocked(supabase, requestId);
  if (blocked) {
    logEvent("generate_quota_exceeded", {
      user: userId,
      kind: job.kind,
      limit: blocked,
      req: requestId,
    });
    // A background warm is nobody's click: decline it silently, exactly as a
    // failed warm is declined, rather than surfacing a 429 no one asked for.
    if (prefetch) return new NextResponse(null, { status: 204 });
    return apiError("rate_limit", { requestId });
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

  if (streaming) return streamGeneration(job, userId, prefetch, onPayload, requestId);

  try {
    const payload = await job.run();
    // Write-through, not awaited: the learner gets their content immediately
    // and everyone after them gets it from Postgres.
    if (job.key) writeContent(job.key, job.kind, payload);
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

/** Frontier nodes warmed behind a finished build. Each costs two calls
 *  (Consume and Socratic), so the default of 3 spends ~6. */
const CURRICULUM_WARM_NODES = Number(process.env.CURRICULUM_WARM_NODES || 3);

/**
 * Generate the first thing the learner will click, before they click it.
 *
 * A fresh map's frontier is the one part of the spiral we can predict with
 * certainty, and the learner is about to spend a good half-minute answering
 * three placement questions. `after()` runs this once the response has been
 * flushed, so the build isn't slowed by it, and the results land in the shared
 * `content_cache` — which means the *next* learner on this topic gets them
 * too, not just this one.
 *
 * This also covers a gap the client-side warm structurally cannot: `warm.ts`
 * runs two requests at a time from the browser and only starts once the map is
 * on screen.
 *
 * Everything here is best-effort. A failure is logged and dropped — the click
 * it was meant to cover simply generates the way it does today.
 */
function startCurriculumWarm(
  supabase: SupabaseLike,
  graph: ConceptGraph,
  body: GenerateBody,
  userId: string,
): void {
  if (CURRICULUM_WARM_NODES <= 0) return;
  // The same derivation the client uses, not a second heuristic that could
  // drift from it: on a fresh map every state is `unknown`, so `frontier` is
  // exactly the nodes whose prerequisites are already met.
  const display = displayStates(initialStates(graph), graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const frontier = graph.nodes
    .filter((n) => display[n.id] === "frontier")
    .slice(0, CURRICULUM_WARM_NODES);
  if (frontier.length === 0) return;

  /** A node's solid prerequisites, derived exactly as `consumeParams` does on
   *  the client — the labels are part of the cache key, so a different
   *  derivation here would write rows nobody ever reads. */
  const prereqLabels = (node: ConceptNode): string[] =>
    graph.edges
      .filter(([, to, dashed]) => to === node.id && !dashed)
      .map(([from]) => byId.get(from)?.label)
      .filter((label): label is string => !!label);

  after(async () => {
    // The warm is real spend — six calls at the default depth — and it runs
    // after the response, where nothing else would stop it. The month's
    // ceiling is checked once for the whole pass; the learner's own daily
    // quota is not, because this is the server's speculation, not their click.
    if ((await generationBlocked(supabase, undefined, { daily: 0 })) !== null) {
      logEvent("curriculum_warm_skipped", { user: userId, reason: "ceiling" });
      return;
    }
    for (const node of frontier) {
      for (const kind of ["consume", "socratic"] as const) {
        try {
          // Through resolveJob, so these hash to the row the learner's own
          // request will later address.
          const warm = resolveJob({
            kind,
            topic: body.topic,
            interests: body.interests,
            language: body.language,
            nodeId: node.id,
            nodeLabel: node.label,
            ...(kind === "consume" ? { prereqLabels: prereqLabels(node) } : null),
          });
          if (!warm.key) continue;
          if (await readContent(warm.key)) continue;
          const jobId = crypto.randomUUID();
          await logGenerationCalls(supabase, warm, { jobId });
          writeContent(warm.key, warm.kind, await warm.run());
          logEvent("curriculum_warm", { user: userId, kind, node: node.id });
        } catch (err) {
          logError("curriculum_warm_failed", err, { kind, node: node.id });
        }
      }
    }
  });
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
    onComplete: (frames) => {
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
      if (job.key) writeContent(job.key, job.kind, payload);
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
