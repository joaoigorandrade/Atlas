// Phase 0.6 / 3 — the ceilings have to hold at the boundary and, more
// importantly, have to fail open. A quota check that 429s the whole app when
// its RPC breaks is worse than no quota at all.

import { describe, expect, it } from "vitest";
import { generationBlocked, type QuotaSource } from "@/lib/server/quota";

/** A source answering each count function with its own number. */
const counting = (jobs: number, calls = 0): QuotaSource => ({
  rpc: (fn) =>
    Promise.resolve({
      data: fn === "generation_jobs_today" ? jobs : calls,
      error: null,
    }),
});
const broken: QuotaSource = {
  rpc: () => Promise.resolve({ data: null, error: { message: "nope" } }),
};

const limits = { daily: 60, monthly: 20000 };

describe("generationBlocked", () => {
  it("allows below the daily limit and declines at it", async () => {
    expect(await generationBlocked(counting(59), undefined, limits)).toBe(null);
    expect(await generationBlocked(counting(60), undefined, limits)).toBe("daily_quota");
    expect(await generationBlocked(counting(999), undefined, limits)).toBe("daily_quota");
  });

  it("declines at the month's call ceiling, whoever is asking", async () => {
    expect(await generationBlocked(counting(0, 19999), undefined, limits)).toBe(null);
    expect(await generationBlocked(counting(0, 20000), undefined, limits)).toBe(
      "monthly_ceiling",
    );
    // The month outranks the day: it is true for everyone, not just this learner.
    expect(await generationBlocked(counting(999, 20000), undefined, limits)).toBe(
      "monthly_ceiling",
    );
  });

  it("fails open when a count is unavailable", async () => {
    expect(await generationBlocked(broken, undefined, limits)).toBe(null);
  });

  it("is disabled by a limit of zero, without calling the database", async () => {
    const asked: string[] = [];
    const spy: QuotaSource = {
      rpc: (fn) => {
        asked.push(fn);
        return Promise.resolve({ data: 9999, error: null });
      },
    };
    expect(await generationBlocked(spy, undefined, { daily: 0, monthly: 0 })).toBe(null);
    expect(asked).toEqual([]);
    // Each ceiling is independently disablable.
    expect(await generationBlocked(spy, undefined, { daily: 0, monthly: 100 })).toBe(
      "monthly_ceiling",
    );
    expect(asked).toEqual(["generation_calls_this_month"]);
  });
});
