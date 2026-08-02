import { describe, expect, it } from "vitest";
import {
  framesToPayload,
  payloadToFrames,
  type StreamFrame,
  type StreamShape,
} from "@/lib/server/stream";
import { consumeSectionShape } from "@/lib/server/generate/shapes";

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

describe("consumeSectionShape", () => {
  // The guard the old regex derivation never had. `CONSUME_SECTION_SHAPE_FAST`
  // used to be produced by stripping the `alt` block out of the full shape with
  // a regex; reformatting that block made the strip a silent no-op and the
  // streaming pass went back to requesting the four rewrites it exists to
  // defer — no type error, no failing test, just a section that took twice as
  // long to close.
  it("omits the adaptive rewrites from the streaming shape", () => {
    expect(consumeSectionShape(false)).not.toContain('"alt"');
    expect(consumeSectionShape(false)).not.toContain('"simpler"');
  });

  it("includes them in the single-shot shape", () => {
    expect(consumeSectionShape(true)).toContain('"alt"');
    expect(consumeSectionShape(true)).toContain('"deeper"');
  });

  it("differs only by the alt block", () => {
    const core = consumeSectionShape(false).replace(/\s*\}$/, "");
    expect(consumeSectionShape(true).startsWith(core)).toBe(true);
  });

  it("still asks for every field the validator requires", () => {
    for (const field of ["kicker", "body", "example", "takeaway", "cite", "figure", "ask"])
      expect(consumeSectionShape(false)).toContain(`"${field}"`);
  });
});
