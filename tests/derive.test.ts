// W0.1: the server re-derives state from the ledger, so a delta can't write a
// state the ledger doesn't support.
import { describe, expect, it } from "vitest";
import { deriveRow, type LedgerRow } from "@/lib/server/store/derive";

const plan = [
  "consume",
  "trace",
  "feynman",
  "perform",
  "retain",
] as LedgerRow["phase_plan"];
const row = (over: Partial<LedgerRow>): LedgerRow => ({
  id: "n",
  is_gap: false,
  state: "unknown",
  shaky_reason: null,
  phase_plan: plan,
  phases_done: [],
  consume_progress: null,
  phase_closed_at: {},
  ...over,
});
const now = "2026-09-30T00:00:00.000Z";

describe("deriveRow", () => {
  it("a delta claiming mastered on an unfinished ledger is stored learning", () => {
    expect(
      deriveRow(row({ state: "mastered", phases_done: ["consume"] }), 0, now).state,
    ).toBe("learning");
  });
  it("a claim of mastered with nothing done is at most learning", () => {
    expect(deriveRow(row({ state: "mastered" }), 0, now).state).toBe("learning");
  });
  it("an untouched node stays unknown", () => {
    expect(deriveRow(row({}), 0, now).state).toBe("unknown");
  });
  it("a full ledger masters, a shaky reason holds it, an open gap holds it", () => {
    const full = {
      phases_done: ["consume", "trace", "feynman", "perform"],
    } as Partial<LedgerRow>;
    expect(deriveRow(row(full), 0, now).state).toBe("mastered");
    expect(deriveRow(row({ ...full, shaky_reason: "crucible-fail" }), 0, now).state).toBe(
      "shaky",
    );
    expect(deriveRow(row(full), 1, now).state).toBe("learning");
  });
  it("stamps each phase the first time it closes and never moves a stamp", () => {
    const { closedAt } = deriveRow(
      row({ phases_done: ["consume", "trace"], phase_closed_at: { consume: "earlier" } }),
      0,
      now,
    );
    expect(closedAt).toEqual({ consume: "earlier", trace: now });
  });
  it("leaves a gap node's own state alone", () => {
    expect(deriveRow(row({ is_gap: true, state: "gap" }), 0, now).state).toBe("gap");
  });
});
