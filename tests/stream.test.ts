import { describe, expect, it } from "vitest";
import {
  framesToPayload,
  payloadToFrames,
  type StreamFrame,
  type StreamShape,
} from "@/lib/server/stream";
import {
  CONSUME_SECTION_SHAPE,
  MODEL_BEAT_SHAPE,
} from "@/lib/server/generate/shapes";

// The assembler is what lets a streamed generation share a cache row with a
// single-shot one. Two properties matter and nothing else does: a complete set
// of frames must rebuild the exact payload `run()` would have returned, and an
// incomplete set must rebuild nothing at all — a cache hit skips validation, so
// a truncated payload written here would flow straight into the renderer for
// every learner after.

const CONSUME: StreamShape = { chunks: { min: 4, max: 6 } };

const chunkFrames = (n: number): StreamFrame[] =>
  Array.from({ length: n }, (_, i) => ({ p: "chunks", i, v: { id: `c${i + 1}` } }));

describe("framesToPayload", () => {
  // Token-by-token redraws are rendered, never validated. If one could be
  // assembled it would be cached, and a cache hit skips validation — every
  // later learner would be served half a sentence.
  it("ignores partial redraws of a slot", () => {
    const frames: StreamFrame[] = [
      { p: "chunks", i: 0, v: { id: "hal" }, partial: true },
      ...chunkFrames(4),
      { p: "chunks", i: 4, v: { id: "half-written" }, partial: true },
    ];
    expect(framesToPayload(frames, CONSUME)).toEqual({
      chunks: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    });
  });

  it("refuses a set whose only frame for a slot is partial", () => {
    const frames: StreamFrame[] = [
      ...chunkFrames(3),
      { p: "chunks", i: 3, v: { id: "c4" }, partial: true },
    ];
    expect(framesToPayload(frames, CONSUME)).toBeNull();
  });

  it("folds indexed frames into an ordered array", () => {
    expect(framesToPayload(chunkFrames(5), CONSUME)).toEqual({
      chunks: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }],
    });
  });

  it("orders by index, not by arrival", () => {
    const shuffled: StreamFrame[] = [
      { p: "chunks", i: 3, v: "d" },
      { p: "chunks", i: 0, v: "a" },
      { p: "chunks", i: 2, v: "c" },
      { p: "chunks", i: 1, v: "b" },
    ];
    expect(framesToPayload(shuffled, CONSUME)).toEqual({ chunks: ["a", "b", "c", "d"] });
  });

  it("replaces a re-sent slot instead of appending it — the Consume alt pass", () => {
    // Every section arrives once as reading material and again once its
    // adaptive rewrites are ready. Appending would cache 10 sections, not 5.
    const frames: StreamFrame[] = [
      ...chunkFrames(4),
      ...Array.from({ length: 4 }, (_, i): StreamFrame => ({
        p: "chunks",
        i,
        v: { id: `c${i + 1}`, alt: { simpler: "…" } },
      })),
    ];
    const payload = framesToPayload(frames, CONSUME);
    expect(payload?.chunks).toHaveLength(4);
    expect((payload?.chunks as Array<{ alt?: unknown }>)[0].alt).toBeDefined();
  });

  it("rejects a short set — nothing incomplete may be cached", () => {
    expect(framesToPayload(chunkFrames(3), CONSUME)).toBeNull();
  });

  it("rejects an over-long set", () => {
    expect(framesToPayload(chunkFrames(7), CONSUME)).toBeNull();
  });

  it("rejects a gap in the indices rather than silently renumbering", () => {
    const gappy: StreamFrame[] = [
      { p: "chunks", i: 0, v: "a" },
      { p: "chunks", i: 1, v: "b" },
      { p: "chunks", i: 2, v: "c" },
      { p: "chunks", i: 4, v: "e" }, // index 3 never arrived
    ];
    expect(framesToPayload(gappy, CONSUME)).toBeNull();
  });

  it("handles a mixed scalar + list shape, and rejects a missing scalar", () => {
    const shape: StreamShape = { graph: "one", diagnostic: { min: 3, max: 3 } };
    const diagnostic: StreamFrame[] = [
      { p: "diagnostic", i: 0, v: "q1" },
      { p: "diagnostic", i: 1, v: "q2" },
      { p: "diagnostic", i: 2, v: "q3" },
    ];
    expect(framesToPayload([{ p: "graph", v: { nodes: [] } }, ...diagnostic], shape)).toEqual({
      graph: { nodes: [] },
      diagnostic: ["q1", "q2", "q3"],
    });
    expect(framesToPayload(diagnostic, shape)).toBeNull();
  });
});

describe("payloadToFrames", () => {
  it("round-trips a cache hit back through the assembler unchanged", () => {
    const shape: StreamShape = { graph: "one", diagnostic: { min: 3, max: 3 } };
    const payload = { graph: { nodes: ["a"] }, diagnostic: ["q1", "q2", "q3"] };
    expect(framesToPayload(payloadToFrames(payload, shape), shape)).toEqual(payload);
  });

  it("replays a consume payload as one frame per section", () => {
    const payload = { chunks: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }] };
    const frames = payloadToFrames(payload, CONSUME);
    expect(frames).toHaveLength(4);
    expect(frames[2]).toEqual({ p: "chunks", i: 2, v: { id: "c3" } });
  });
});

describe("prompt shapes", () => {
  // A shape that stops asking for a field the validator requires fails at
  // generation time, on the model's reply, with nothing in the type system or
  // the test suite between the two. These are that guard.
  it("asks for every section field the validator requires", () => {
    for (const field of ["kicker", "body", "example", "takeaway", "cite", "figure", "ask"])
      expect(CONSUME_SECTION_SHAPE).toContain(`"${field}"`);
  });

  // The four rewrites the section shape used to carry are the `model` kind
  // now, generated one lens at a time. A section that asks for them again is
  // paying for four rewrites per section that nothing renders.
  it("no longer asks a section for its four rewrites", () => {
    expect(CONSUME_SECTION_SHAPE).not.toContain('"alt"');
    expect(CONSUME_SECTION_SHAPE).not.toContain('"simpler"');
  });

  it("asks for every model-view beat field the validator requires", () => {
    for (const field of ["label", "text"]) expect(MODEL_BEAT_SHAPE).toContain(`"${field}"`);
  });
});
