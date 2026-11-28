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

const explain = (tag = "a"): import("@/lib/curriculum").ExplainContent => ({
  nodeId: "n",
  nodeLabel: "N",
  problem: "p",
  analogy: { text: "a", breaks: "b" },
  order: ["o1", "o2", "o3"],
  misconception: { belief: "m", tempting: "t" },
  checkBack: { question: "q", rightAnswer: "r" },
  listener: {
    says: `says-${tag}`,
    replies: [
      { label: "right reply here", correct: true, why: "w" },
      { label: "wrong reply here", correct: false, why: "w" },
    ],
  },
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
  it("flags an item that leans on what it never states, even when the key matches", () => {
    expect(
      disputedIds(items, {
        a: { pick: 0, confidence: 1, unstated: true },
        b: { pick: 0, confidence: 1 },
      }),
    ).toEqual(["a"]);
  });
});

describe("verified", () => {
  it("regenerates once when the listener check is disputed", async () => {
    solverAnswers.push({ "ex-n": { pick: 1, confidence: 0.95 } }, {});
    let made = 0;
    const out = await verified("explain", meta, async () => explain(made++ ? "b" : "a"));
    expect(made).toBe(2);
    expect(out.listener.says).toBe("says-b");
  });
  it("ships unverified when the solver fails", async () => {
    const { generateJson } = await import("@/lib/server/openrouter");
    vi.mocked(generateJson).mockRejectedValueOnce(new Error("down"));
    const out = await verified("explain", meta, async () => explain());
    expect(out.listener.says).toBe("says-a");
  });
});
