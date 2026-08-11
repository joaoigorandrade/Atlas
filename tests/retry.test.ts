import { describe, expect, it, vi } from "vitest";
import { AtlasError } from "@/lib/errors";
import { RETRY_DELAYS_MS, withRetry } from "@/lib/retry";

/** Run `fn` with timers faked, letting every scheduled delay elapse. */
async function runWithFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const pending = fn();
    // Observed immediately: the rejection lands several timer-advances before
    // the `await` below, and an unobserved rejection in between is reported as
    // an unhandled error even though the test does handle it.
    const settled = pending.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    // The delays are awaited one at a time, so the queue has to be drained
    // repeatedly rather than in a single advance.
    for (let i = 0; i <= RETRY_DELAYS_MS.length + 1; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }
    const result = await settled;
    if (!result.ok) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

describe("withRetry", () => {
  it("returns the first success without waiting", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure and returns the eventual success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new AtlasError("upstream", "502"))
      .mockResolvedValue("landed");
    await expect(runWithFakeTimers(() => withRetry(fn))).resolves.toBe("landed");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the delay ladder is spent", async () => {
    const fn = vi.fn().mockRejectedValue(new AtlasError("upstream", "502"));
    await expect(runWithFakeTimers(() => withRetry(fn))).rejects.toThrow();
    // One initial attempt plus one per delay — never more.
    expect(fn).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it("does not retry a failure that cannot succeed on a second try", async () => {
    // The money question: a 400 or an expired session must not be replayed,
    // and a generation is a real model call.
    const fn = vi.fn().mockRejectedValue(new AtlasError("invalid", "bad input"));
    await expect(withRetry(fn)).rejects.toMatchObject({ code: "invalid" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours an explicit delay ladder", async () => {
    const fn = vi.fn().mockRejectedValue(new AtlasError("timeout", "slow"));
    await expect(
      runWithFakeTimers(() => withRetry(fn, { delays: [1] })),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("always rejects with a classified error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("something raw"));
    await expect(withRetry(fn)).rejects.toBeInstanceOf(AtlasError);
  });

  it("lets shouldRetry override the error's own verdict", async () => {
    const fn = vi.fn().mockRejectedValue(new AtlasError("upstream", "502"));
    await expect(
      withRetry(fn, { shouldRetry: () => false }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
