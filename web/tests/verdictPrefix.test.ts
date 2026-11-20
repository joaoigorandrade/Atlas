import { describe, expect, it } from "vitest";
import { verdictPrefix } from "@/lib/server/generate/judge";
import { steelmanVerdictPrefix } from "@/lib/server/generate/steelman";

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

// Steelman shipped with the pre-fix reader — a thin wrapper that only accepted
// the wrapped array — so its streamed half contributed nothing in production:
// every position was dropped, `objects: 0`, and each submission paid 3.6s and
// a whole generation before falling back to a second call. Same lesson, one
// phase later; these are the cases that would have caught it.

describe("steelmanVerdictPrefix", () => {
  const ids = ["sm-a-1", "sm-a-2"];

  it("reads the shape that was actually asked for", () => {
    const read = steelmanVerdictPrefix(ids);
    expect(
      read({
        verdicts: [
          { positionId: "sm-a-1", verdict: "strong", quote: "" },
          { positionId: "sm-a-2", verdict: "thin", quote: "a shrug" },
        ],
      }),
    ).toEqual({
      verdicts: [
        { positionId: "sm-a-1", verdict: "strong", quote: "" },
        { positionId: "sm-a-2", verdict: "thin", quote: "a shrug" },
      ],
    });
  });

  it("assembles positions streamed one top-level object at a time", () => {
    const read = steelmanVerdictPrefix(ids);
    // Dropped while incomplete: half a ruling would mark the unjudged side
    // clean, and that side is the whole point of the phase.
    expect(() =>
      read({ positionId: "sm-a-2", verdict: "thin", quote: "a shrug" }),
    ).toThrow();
    // Assembled in the positions' own order, whatever order they arrived in.
    expect(read({ positionId: "sm-a-1", verdict: "strong", quote: "" })).toEqual({
      verdicts: [
        { positionId: "sm-a-1", verdict: "strong", quote: "" },
        { positionId: "sm-a-2", verdict: "thin", quote: "a shrug" },
      ],
    });
  });

  it("says it is buffering rather than repeating the validator's complaint", () => {
    const read = steelmanVerdictPrefix(ids);
    // The ordinary path for every position but the last. Re-throwing "verdicts
    // must be an array" here is what put lines that look like a broken judge on
    // the error dashboard each time one worked.
    expect(() => read({ positionId: "sm-a-1", verdict: "strong" })).toThrow(/buffered/);
  });

  it("rejects an object that is neither shape", () => {
    const read = steelmanVerdictPrefix(ids);
    expect(() => read({ response: "both held" })).toThrow();
    expect(() => read({ positionId: "sm-other", verdict: "strong" })).toThrow();
    expect(() => read({ positionId: "sm-a-1", verdict: "excellent" })).toThrow();
  });
});
