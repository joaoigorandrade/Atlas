import { describe, expect, it } from "vitest";
import {
  GLANCE_PLAN,
  PHASE_ORDER,
  lastGate,
  nextStopOf,
  withGoalPlan,
} from "@/lib/curriculum";
import { mapNodeBounds } from "@/lib/server/generate";
import { fixturePayload } from "@/lib/server/fixtures";

describe("just want to know", () => {
  it("runs Consume, Explain, Perform, Retain — a subsequence of the catalogue", () => {
    expect(GLANCE_PLAN).toEqual(["consume", "explain", "perform", "retain"]);
    expect(
      GLANCE_PLAN.every(
        (p, i) =>
          i === 0 || PHASE_ORDER.indexOf(GLANCE_PLAN[i - 1]) < PHASE_ORDER.indexOf(p),
      ),
    ).toBe(true);
    expect(lastGate(GLANCE_PLAN)).toBe("perform");
  });

  it("asks for one to three concepts", () => {
    expect(mapNodeBounds(undefined, "glance")).toEqual({ ask: [1, 3], min: 1, max: 3 });
  });

  it("stamps the quick plan only on a glance map", () => {
    const nodes = [{ phasePlan: ["consume", "retain"] as const }];
    expect(withGoalPlan(nodes, "glance")[0].phasePlan).toBe(GLANCE_PLAN);
    expect(withGoalPlan(nodes, "exam")).toBe(nodes);
  });

  it("fixture mode builds a small quick map", () => {
    const map = fixturePayload("curriculum", {
      kind: "curriculum",
      topic: "x",
      goal: "glance",
    }) as {
      nodes: { phasePlan: readonly string[] }[];
    };
    expect(map.nodes.length).toBeLessThanOrEqual(3);
    expect(map.nodes.every((n) => n.phasePlan === GLANCE_PLAN)).toBe(true);
  });

  it("a learned stop walks on to what it opened, not into reviewing itself", () => {
    const display = { a: "mastered", b: "frontier", c: "unknown" } as const;
    expect(nextStopOf("mastered", ["c", "b"], display)).toBe("b");
    expect(nextStopOf("mastered", ["c"], display)).toBeUndefined();
    expect(nextStopOf("learning", ["b"], display)).toBeUndefined();
  });
});
