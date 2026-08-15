// Phase 0.6 — the ceiling has to hold at the boundary and, more importantly,
// has to fail open. A quota check that 429s the whole app when its RPC breaks
// is worse than no quota at all.

import { describe, expect, it } from "vitest";
import { overQuota, type QuotaSource } from "@/lib/server/quota";

const counting = (n: number): QuotaSource => ({
  rpc: () => Promise.resolve({ data: n, error: null }),
});
const broken: QuotaSource = {
  rpc: () => Promise.resolve({ data: null, error: { message: "nope" } }),
};

describe("overQuota", () => {
  it("allows below the limit and declines at it", async () => {
    expect(await overQuota(counting(59), undefined, 60)).toBe(false);
    expect(await overQuota(counting(60), undefined, 60)).toBe(true);
    expect(await overQuota(counting(999), undefined, 60)).toBe(true);
  });

  it("fails open when the count is unavailable", async () => {
    expect(await overQuota(broken, undefined, 60)).toBe(false);
  });

  it("is disabled by a limit of zero, without calling the database", async () => {
    let called = false;
    const spy: QuotaSource = {
      rpc: () => {
        called = true;
        return Promise.resolve({ data: 9999, error: null });
      },
    };
    expect(await overQuota(spy, undefined, 0)).toBe(false);
    expect(called).toBe(false);
  });
});
