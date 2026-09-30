// W2.1: closed items are blind-solved before caching; a confidently disputed
// key is dropped while the kind's floor holds, else the payload is written again.
import { beforeEach, describe, expect, it, vi } from "vitest";

const solverAnswers: Array<Record<string, { pick: number; confidence: number }>> = [];
vi.mock("@/lib/server/openrouter", () => ({
  generateJson: vi.fn(async (_m: unknown, validate: (raw: unknown) => unknown) => {
    const next = solverAnswers.shift() ?? {};
    return validate({
      answers: Object.entries(next).map(([id, a]) => ({ id, ...a })),
    });
  }),
}));

import { disputedIds, verified, type ClosedItem } from "@/lib/server/generate/verify";
import type { DrillContent } from "@/lib/curriculum";

const drill = (n: number, tag = "a"): DrillContent => ({
  nodeId: "n",
  nodeLabel: "N",
  reps: Array.from({ length: n }, (_, i) => ({
    id: `${tag}${i}`,
    prompt: `p${i}`,
    answers: ["x", "y"],
    answerIndex: 0,
    rule: "r",
  })),
});
const meta = { topic: "T", nodeLabel: "N" };

beforeEach(() => void (solverAnswers.length = 0));

describe("disputedIds", () => {
  const items: ClosedItem[] = [
    { id: "a", stem: "", options: ["1", "2"], key: 0 },
    { id: "b", stem: "", options: ["1", "2"], key: 0 },
    { id: "c", stem: "", options: ["1", "2"], key: 0 },
  ];
  it("flags only a confident different pick", () => {
    expect(
      disputedIds(items, {
        a: { pick: 1, confidence: 0.9 },
        b: { pick: 1, confidence: 0.4 },
        c: { pick: 0, confidence: 1 },
      }),
    ).toEqual(["a"]);
  });
});

describe("verified", () => {
  it("drops a disputed rep while the floor holds", async () => {
    solverAnswers.push({ a0: { pick: 1, confidence: 0.95 } });
    const out = await verified("drill", meta, async () => drill(6));
    expect(out.reps.map((r) => r.id)).not.toContain("a0");
    expect(out.reps).toHaveLength(5);
  });
  it("regenerates once when dropping would breach the floor", async () => {
    solverAnswers.push({ a0: { pick: 1, confidence: 0.95 } }, {});
    let made = 0;
    const out = await verified("drill", meta, async () => drill(5, made++ ? "b" : "a"));
    expect(made).toBe(2);
    expect(out.reps[0].id).toBe("b0");
  });
  it("ships unverified when the solver fails", async () => {
    const { generateJson } = await import("@/lib/server/openrouter");
    vi.mocked(generateJson).mockRejectedValueOnce(new Error("down"));
    const out = await verified("drill", meta, async () => drill(5));
    expect(out.reps).toHaveLength(5);
  });
});
