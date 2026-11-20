// One retry policy, shared.
//
// `lib/server/openrouter.ts` already retries model calls on a fixed delay
// ladder; this is the same shape for everything else, so the app has one
// convention instead of two. What it deliberately does *not* do is retry
// everything: `AtlasError.retryable` is the gate, and a generation is a real
// model call — see the call sites for how narrowly this is applied.

import { toAtlasError, type AtlasError } from "@/lib/errors";

/** Matches `RETRY_DELAYS_MS` in lib/server/openrouter.ts — two attempts after
 *  the first, backing off, which is as long as anyone will wait watching. */
export const RETRY_DELAYS_MS = [1000, 4000] as const;

export interface RetryOpts {
  /** One delay per retry; its length *is* the retry count. */
  delays?: readonly number[];
  /** Defaults to the error's own `retryable`. */
  shouldRetry?: (err: AtlasError, attempt: number) => boolean;
  /** Fired before each wait — for logging, never for control flow. */
  onRetry?: (err: AtlasError, attempt: number) => void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying while the failure is retryable and delays remain.
 *
 * Always rejects with an `AtlasError` — the last one seen — so a caller's catch
 * block gets the same classified shape whether it retried or not.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> {
  const delays = opts.delays ?? RETRY_DELAYS_MS;
  const shouldRetry = opts.shouldRetry ?? ((err) => err.retryable);

  let last: AtlasError;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = toAtlasError(err);
      if (attempt >= delays.length || !shouldRetry(last, attempt)) throw last;
      opts.onRetry?.(last, attempt);
      await wait(delays[attempt]);
    }
  }
}
