// Pedagogy eval suite (#28): does the card grader pass a correct answer in the
// learner's own words and refuse a wrong one? Runs against the LIVE judge
// model — gated behind RUN_EVAL so CI and `npm test` stay offline.
// `npm run eval` runs it.

import { describe, expect, it } from "vitest";
import { judgeRecall } from "@/lib/server/generate";

const live = !!process.env.RUN_EVAL && !!process.env.OPENROUTER_API_KEY;

const card = {
  topic: "Linear Algebra",
  nodeLabel: "Scalar Multiplication",
  brief: "What does multiplying a vector by the scalar 3 do to it?",
  rubric: [
    {
      subPoint: "Scaling changes length, not direction",
      mustConvey: ["three times as long, pointing the same way"],
    },
  ],
};

describe.skipIf(!live)("live judge evals (#28)", () => {
  it(
    "passes a correct answer in the learner's own words",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeRecall({
        ...card,
        written: "It stretches it to 3x its length; it still points the same way.",
      });
      expect(j.verdicts[0]?.verdict).toBe("good");
    },
  );

  it(
    "catches a planted misconception — never affirms it",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeRecall({
        ...card,
        written: "Multiplying by 3 rotates the vector by 3 radians.",
      });
      expect(j.verdicts[0]?.verdict).toBe("confused");
    },
  );
});

// Keep the file non-empty for normal runs so vitest doesn't error.
describe("eval harness", () => {
  it("is gated behind RUN_EVAL + OPENROUTER_API_KEY", () => {
    expect(typeof live).toBe("boolean");
  });
});
