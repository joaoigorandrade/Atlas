// Pedagogy eval suite (#28): does the judge catch planted misconceptions,
// hint on near-misses, pass correct answers, and refuse garbage? Runs against
// the LIVE judge model — gated behind RUN_EVAL so CI and `npm test` stay
// offline. `npm run eval` runs it.

import { describe, expect, it } from "vitest";
import {
  judgeCrucible,
  judgeSocratic,
} from "@/lib/server/generate";

const live = !!process.env.RUN_EVAL && !!process.env.OPENROUTER_API_KEY;

const socraticCase = {
  topic: "Linear Algebra",
  nodeLabel: "Scalar Multiplication",
  question: "What does multiplying a vector by the scalar 3 do to it?",
  reference:
    "It scales the vector: same direction, three times the length. Each component is multiplied by 3.",
};

describe.skipIf(!live)("live judge evals (#28)", () => {
  it(
    "catches a planted misconception — never affirms it",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeSocratic({
        ...socraticCase,
        answer: "Multiplying by 3 rotates the vector by 3 radians.",
      });
      expect(["wrong", "lost"]).toContain(j.quality);
    },
  );

  it(
    "passes a correct answer in the learner's own words",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeSocratic({
        ...socraticCase,
        answer:
          "It stretches the vector to 3x its length without changing which way it points — every component gets tripled.",
      });
      expect(j.quality).toBe("correct");
    },
  );

  it(
    "a near-miss earns a hint, not the full answer",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeSocratic({
        ...socraticCase,
        answer: "It makes the vector bigger somehow.",
      });
      expect(["near", "wrong"]).toContain(j.quality);
    },
  );

  it(
    "garbage never reaches Mastered — a nonsense Crucible attempt is partial",
    { timeout: 120_000, retry: 1 },
    async () => {
      const j = await judgeCrucible({
        topic: "Linear Algebra",
        nodeLabel: "Linear Transformations",
        problem:
          "A type designer wants every glyph slanted 15° to the right without changing its height. Describe the operation that does this to each point of a glyph.",
        hint: "Think about what happens to the x-coordinate as y grows.",
        attempt: "asdf asdf lorem ipsum I like turtles",
      });
      expect(j.outcome).toBe("partial");
    },
  );
});

// Keep the file non-empty for normal runs so vitest doesn't error.
describe("eval harness", () => {
  it("is gated behind RUN_EVAL + OPENROUTER_API_KEY", () => {
    expect(typeof live).toBe("boolean");
  });
});
