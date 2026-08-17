// Phase 0.6 / 3 — the two ceilings on generation.
//
// Until this landed, generation was unmetered: any signed-in account could
// drive unbounded OpenRouter spend. Both counts come from functions that have
// existed since the job_id migration — `generation_jobs_today()` (this
// learner, this UTC day) and `generation_calls_this_month()` (everyone, this
// calendar month) — so this is a ceiling, not a new table and not a new
// dependency.
//
// The two measure different things on purpose. The daily quota is fairness: a
// learner's share of surfaces, counted in jobs. The monthly ceiling is the
// bill: model calls, which is what OpenRouter charges for and what a fanned-out
// job spends several of.
//
// Deliberately not in the route: a route file can only export handlers, and
// this is the one piece of that route worth testing on its own.

import { logError } from "@/lib/log";

/** Distinct jobs one learner may start per UTC day. 60 is the number the
 *  job_id migration named as a learner's fair share of surfaces. Set
 *  GENERATION_DAILY_QUOTA=0 to disable (local dev, evals). */
export const DAILY_JOB_QUOTA = Number(process.env.GENERATION_DAILY_QUOTA ?? 60);

/** Model calls this deployment may make in a calendar month, across every
 *  learner — the actual spend ceiling. Default 20,000: at DeepSeek's per-call
 *  cost that is single-digit dollars, and it is ~330 learner-days of the daily
 *  quota, so it only ever bites on runaway usage. Set
 *  GENERATION_MONTHLY_CALLS=0 to disable. */
export const MONTHLY_CALL_CEILING = Number(process.env.GENERATION_MONTHLY_CALLS ?? 20000);

type CountFn = "generation_jobs_today" | "generation_calls_this_month";

/** The one thing this needs from a Supabase client — narrow so a test can
 *  supply a two-line fake instead of a whole client. */
export interface QuotaSource {
  rpc(fn: CountFn): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

/** Why a generation was declined, or null to proceed. Both reasons answer 429
 *  `rate_limit` to the learner — the distinction is for the log, where "one
 *  learner is heavy" and "the month's budget is gone" need different responses
 *  from whoever is on call. */
export type BlockReason = "daily_quota" | "monthly_ceiling";

/** One count, failing **open**: a broken count is an outage of the meter, not
 *  of the app, and answering 429 to everyone because one RPC regressed is a far
 *  worse failure than a day of unmetered generation. */
async function over(
  supabase: QuotaSource,
  fn: CountFn,
  limit: number,
  requestId?: string,
): Promise<boolean> {
  if (limit <= 0) return false;
  try {
    const { data, error } = await supabase.rpc(fn);
    if (error) throw new Error(error.message);
    return Number(data ?? 0) >= limit;
  } catch (err) {
    logError("quota_check_failed", err, { req: requestId, count: fn });
    return false;
  }
}

/**
 * Whether this generation may proceed, and if not, which ceiling stopped it.
 *
 * Both counts are read at once — they are independent, and a request that is
 * about to spend a model call can afford one round trip, not two serial ones.
 */
export async function generationBlocked(
  supabase: QuotaSource,
  requestId?: string,
  limits: { daily?: number; monthly?: number } = {},
): Promise<BlockReason | null> {
  const [daily, monthly] = await Promise.all([
    over(supabase, "generation_jobs_today", limits.daily ?? DAILY_JOB_QUOTA, requestId),
    over(
      supabase,
      "generation_calls_this_month",
      limits.monthly ?? MONTHLY_CALL_CEILING,
      requestId,
    ),
  ]);
  // The month first: it is the louder fact, and the one that is true for
  // everyone rather than for this learner.
  if (monthly) return "monthly_ceiling";
  return daily ? "daily_quota" : null;
}
