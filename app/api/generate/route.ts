// The single content-generation endpoint. The browser posts a kind + context;
// the server returns validated content in the exact shapes the client renders.
// The API key stays server-side.
//
// Cache first (see lib/server/contentCache.ts): every cacheable kind is
// addressed by a hash of its prompt inputs, so a request whose content already
// exists returns from Postgres in milliseconds — no model call, no quota spent,
// no overlay. Only a genuine miss reaches OpenRouter.
//
// Protection (#18): requires a signed-in Supabase session, caps every input
// length (in lib/server/job.ts), enforces a per-user daily quota and a global
// monthly call ceiling (both counted from the generation_log table), and logs
// every call that actually generates.

import { NextResponse } from "next/server";
import { readContent, writeContent } from "@/lib/server/contentCache";
import { BadRequest, resolveJob, type GenerateBody, type Job } from "@/lib/server/job";
import { OpenRouterError } from "@/lib/server/openrouter";
import {
  framesToPayload,
  ndjsonResponse,
  ndjsonStream,
  payloadToFrames,
} from "@/lib/server/stream";
import { createClient } from "@/lib/supabase/server";

// Content generation is a real LLM round-trip — allow it time.
export const maxDuration = 120;

/** Per-user calls per UTC day; a learner's full node spiral is ~7 calls. */
const DAILY_QUOTA = Number(process.env.GENERATION_DAILY_QUOTA || 60);
/** Global calls per month — the hard spend ceiling across all users.
 *  ponytail: counted in calls, not dollars — switch to usage-cost accounting
 *  when a billing feed exists. */
const MONTHLY_CALL_CAP = Number(process.env.GENERATION_MONTHLY_CALL_CAP || 20000);
/** Calls held back from background warming, so prefetching the next screen can
 *  never eat the generation the learner is about to ask for by hand. */
const PREFETCH_RESERVE = Number(process.env.GENERATION_PREFETCH_RESERVE || 10);

const QUOTA_MESSAGE =
  "You've hit today's generation limit — it resets at midnight UTC. Your map and cards still work offline of the writer.";

/** Same error → response mapping used by the plain path and the "peek the
 *  first streamed frame before committing to a streaming response" path. */
function errorResponse(err: unknown, prefetch: boolean): NextResponse {
  if (err instanceof BadRequest)
    return NextResponse.json({ error: err.message }, { status: 400 });
  const message = err instanceof Error ? err.message : "content generation failed";
  const status = err instanceof OpenRouterError ? err.status : 502;
  // A failed warm is silent — nobody is looking at it.
  if (prefetch) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // Auth first: an anonymous caller must never spend OpenRouter credit.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId)
    return NextResponse.json({ error: "sign in to generate content" }, { status: 401 });

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let job;
  try {
    job = resolveJob(body);
  } catch (err) {
    if (err instanceof BadRequest)
      return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  // A background warm that misses is not worth making the learner wait for on
  // some later request — but it is worth generating, quota permitting.
  const prefetch = body.prefetch === true;
  // Only a real (non-prefetch) request streams — nobody's watching a background
  // warm, so it stays on the simple await-the-whole-thing path.
  const streaming = !prefetch && !!job.stream && !!job.shape;

  // ---- the fast path: someone has already generated exactly this ----------
  if (job.key) {
    const hit = await readContent<Record<string, unknown>>(job.key);
    if (hit) {
      console.log(
        JSON.stringify({ evt: "generate_cache_hit", user: userId, kind: job.kind }),
      );
      // A hit is replayed in whichever format the caller asked for, so the
      // client reads one wire shape whether the content is seconds or weeks old.
      if (streaming) return ndjsonResponse(payloadToFrames(hit, job.shape!), "hit");
      return NextResponse.json(hit, { headers: { "x-atlas-cache": "hit" } });
    }
  }

  // Quotas: per-user per-day and the global monthly ceiling, together.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [dayRes, monthRes] = await Promise.all([
    supabase
      .from("generation_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart.toISOString()),
    supabase.rpc("generation_calls_this_month"),
  ]);
  const used = dayRes.error ? 0 : dayRes.count ?? 0;
  const ceiling = prefetch ? Math.max(0, DAILY_QUOTA - PREFETCH_RESERVE) : DAILY_QUOTA;
  if (used >= ceiling)
    return prefetch
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: QUOTA_MESSAGE }, { status: 429 });
  const monthCount = monthRes.data;
  if (typeof monthCount === "number" && monthCount >= MONTHLY_CALL_CAP) {
    console.error(
      JSON.stringify({ evt: "spend_ceiling_hit", monthCount, cap: MONTHLY_CALL_CAP }),
    );
    return prefetch
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(
          {
            error:
              "Atlas has reached this month's generation budget — back at the start of the month.",
          },
          { status: 429 },
        );
  }

  // Log before the (long) generation so the quota can't be raced past by
  // firing many concurrent requests. Failures here are non-fatal (the table
  // may lag a migration) but loudly logged.
  const { error: logError } = await supabase
    .from("generation_log")
    .insert({ kind: job.kind.slice(0, 40) });
  if (logError)
    console.error(JSON.stringify({ evt: "generation_log_insert_failed", error: logError.message }));
  console.log(
    JSON.stringify({
      evt: "generate_request",
      user: userId,
      kind: job.kind,
      prefetch,
    }),
  );

  if (streaming) return streamGeneration(job, userId, prefetch);

  try {
    const payload = await job.run();
    // Write-through, not awaited: the learner gets their content immediately
    // and everyone after them gets it from Postgres.
    if (job.key) writeContent(job.key, job.kind, payload);
    return NextResponse.json(payload, { headers: { "x-atlas-cache": "miss" } });
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "generate_failed",
        user: userId,
        kind: job.kind,
        error: String(err instanceof Error ? err.message : err).slice(0, 600),
      }),
    );
    return errorResponse(err, prefetch);
  }
}

/**
 * Stream a job's frames, and cache the assembled payload when — and only when
 * — a complete set of them arrives.
 *
 * `ndjsonStream` peeks the first frame before committing to a 200, so a
 * genuine failure (bad key, quota race, upstream down) still surfaces as a
 * normal error instead of an empty stream. Each streaming generator already
 * falls back to its single-shot, retried path internally, so reaching the
 * error branch here means that fallback failed too.
 */
function streamGeneration(job: Job, userId: string, prefetch: boolean): Promise<Response> {
  return ndjsonStream(job.stream!(), {
    onComplete: (frames) => {
      // `framesToPayload` returns null on a short or gappy set. Caching that
      // would be the worst kind of bug: hits skip validation, so a truncated
      // payload would flow straight into the renderer for everyone after.
      const payload = framesToPayload(frames, job.shape!);
      if (!payload) {
        console.error(
          JSON.stringify({
            evt: "generate_stream_incomplete",
            user: userId,
            kind: job.kind,
            frames: frames.length,
          }),
        );
        return;
      }
      if (job.key) writeContent(job.key, job.kind, payload);
    },
    onError: (err, phase) => {
      // Mid-stream, bytes are already flowing as a 200 — there's no clean way
      // to turn this into an error status now. The client keeps whatever
      // landed; since nothing gets cached, reopening retries.
      console.error(
        JSON.stringify({
          evt: phase === "first" ? "generate_failed" : "generate_stream_failed",
          user: userId,
          kind: job.kind,
          error: String(err instanceof Error ? err.message : err).slice(0, 600),
        }),
      );
    },
    errorResponse: (err) => errorResponse(err, prefetch),
  });
}
