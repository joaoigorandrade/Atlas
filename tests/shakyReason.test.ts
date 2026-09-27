import { describe, expect, it } from "vitest";
import { PHASE_PLAN, reasonAfter, stateFromPlan } from "@/lib/curriculum";

// A Shaky reason used to be cleared by one thing only: a passed Crucible. A
// plan without one — every fact, every use/recognise node — stayed Shaky for
// good after a placement hesitation or a missed review card.

const fact = PHASE_PLAN.fact; // consume, discriminate, drill, connect, recall, retain
const gates = fact.filter((p) => p !== "retain");

describe("reasonAfter", () => {
  it("clears a held reason when the plan's last gate closes cleanly on a full ledger", () => {
    const reason = reasonAfter(fact, gates, "recall", undefined, "review-miss");
    expect(reason).toBeUndefined();
    expect(stateFromPlan(fact, gates, { shaky: reason })).toBe("mastered");
  });

  it("keeps it when an earlier phase is re-done", () => {
    expect(reasonAfter(fact, gates, "drill", undefined, "review-miss")).toBe(
      "review-miss",
    );
  });

  it("keeps it while a gate is still open, so a failing Crucible can't be skipped", () => {
    const concept = PHASE_PLAN.concept;
    const noCrucible = concept.filter((p) => p !== "crucible" && p !== "retain");
    expect(reasonAfter(concept, noCrucible, "recall", undefined, "crucible-fail")).toBe(
      "crucible-fail",
    );
  });

  it("lets an explicit verdict win either way", () => {
    expect(reasonAfter(fact, gates, "recall", "socratic-told", undefined)).toBe(
      "socratic-told",
    );
    expect(
      reasonAfter(fact, ["consume"], "consume", null, "review-miss"),
    ).toBeUndefined();
  });
});
