import { describe, expect, it } from "vitest";
import { verdictPrefix } from "@/lib/server/generate/judge";

// The three rubric judges (Feynman, Recall, Perform) ask for the verdict array
// as one object and are routinely answered with one object per row. Before this
// reader existed every such row was dropped, the stream produced nothing, and a
// whole streamed generation was billed and thrown away on every graded answer.

describe("verdictPrefix", () => {
  it("reads the shape that was actually asked for", () => {
    const read = verdictPrefix(2);
    expect(
      read({
        verdicts: [
          { i: 0, verdict: "good", quote: "" },
          { i: 1, verdict: "skipped", quote: "hand-waved it" },
        ],
      }),
    ).toEqual({
      verdicts: [
        { i: 0, verdict: "good" },
        { i: 1, verdict: "skipped", quote: "hand-waved it" },
      ],
    });
  });

  it("assembles rows streamed one top-level object at a time", () => {
    const read = verdictPrefix(3);
    // Incomplete: the slot is dropped rather than handing the client a partial
    // array, which would mark an unjudged row clean.
    expect(() => read({ i: 0, verdict: "good", quote: "" })).toThrow();
    expect(() => read({ i: 1, verdict: "confused", quote: "backwards" })).toThrow();
    // The last row completes the prefix, in rubric order whatever order it came.
    expect(read({ i: 2, verdict: "skipped", quote: "" })).toEqual({
      verdicts: [
        { i: 0, verdict: "good" },
        { i: 1, verdict: "confused", quote: "backwards" },
        { i: 2, verdict: "skipped" },
      ],
    });
  });

  it("takes the first ruling when the model second-guesses an index", () => {
    const read = verdictPrefix(2);
    expect(() => read({ i: 0, verdict: "good" })).toThrow();
    expect(() => read({ i: 0, verdict: "confused" })).toThrow();
    expect(read({ i: 1, verdict: "good" })).toEqual({
      verdicts: [
        { i: 0, verdict: "good" },
        { i: 1, verdict: "good" },
      ],
    });
  });

  it("rejects an object that is neither shape", () => {
    const read = verdictPrefix(2);
    expect(() => read({ response: "nice work" })).toThrow();
    expect(() => read({ i: 9, verdict: "good" })).toThrow();
    expect(() => read({ i: 0, verdict: "excellent" })).toThrow();
  });
});
