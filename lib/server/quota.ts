// Phase 0.6 — the day's ceiling on generation.
//
// Until this landed, generation was unmetered: any signed-in account could
// drive unbounded OpenRouter spend. The count comes from
// `generation_jobs_today()`, the security-invoker function that has existed
// since the job_id migration and had never been called — so this is a ceiling,
// not a new table and not a new dependency.
//
// Deliberately not in the route: a route file can only export handlers, and
// this is the one piece of that route worth testing on its own.

import { logError } from "@/lib/log";

/** Distinct jobs one learner may start per UTC day. 60 is the number the
 *  job_id migration named as a learner's fair share of surfaces. Set
 *  GENERATION_DAILY_QUOTA=0 to disable (local dev, evals). */
export const DAILY_JOB_QUOTA = Number(process.env.GENERATION_DAILY_QUOTA ?? 60);

/** The one thing this needs from a Supabase client — narrow so a test can
 *  supply a two-line fake instead of a whole client. */
export interface QuotaSource {
  rpc(fn: "generation_jobs_today"): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

/**
 * True when this learner has spent their day's jobs.
 *
 * Fails **open**: a broken count is an outage of the meter, not of the app, and
 * answering 429 to everyone because one RPC regressed is a far worse failure
 * than a day of unmetered generation.
 */
export async function overQuota(
  supabase: QuotaSource,
  requestId?: string,
  limit: number = DAILY_JOB_QUOTA,
): Promise<boolean> {
  if (limit <= 0) return false;
  try {
    const { data, error } = await supabase.rpc("generation_jobs_today");
    if (error) throw new Error(error.message);
    return Number(data ?? 0) >= limit;
  } catch (err) {
    logError("quota_check_failed", err, { req: requestId });
    return false;
  }
}
