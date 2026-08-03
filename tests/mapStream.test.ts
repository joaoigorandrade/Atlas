import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurriculumMapStream } from "@/lib/api";
import { graphFromMapNodes, type MapNode } from "@/lib/curriculum";

// The client half of the streamed map: NDJSON off the wire → a growing node
// list the canvas can paint. The server half is covered end-to-end in
// tests/streamGeneration.test.ts; what matters here is that a slot arriving a
// second time *patches* the first (the settling pass re-sends every node once
// its column height is known) rather than appending a duplicate concept.

const node = (id: string, y: number, prereqs: string[] = []): MapNode => ({
  id,
  label: id.toUpperCase(),
  prereqs,
  state: "unknown",
  g: prereqs.length + 1,
  week: 0,
  x: 110,
  y,
});

/** Stub `/api/generate` with a fixed NDJSON body, one frame per chunk. */
function serveFrames(frames: unknown[]) {
  const enc = new TextEncoder();
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(enc.encode(JSON.stringify(f) + "\n"));
        controller.close();
      },
    }),
  }));
}

afterEach(() => vi.unstubAllGlobals());

const params = { topic: "Rust", goal: "mastery" as const };

describe("fetchCurriculumMapStream", () => {
  it("reports a growing map, and patches a slot that arrives twice", async () => {
    serveFrames([
      { p: "nodes", i: 0, v: node("a", 440) },
      { p: "nodes", i: 1, v: node("b", 580, ["a"]) },
      // The settling pass: same slots, re-centred column.
      { p: "nodes", i: 0, v: node("a", 370) },
      { p: "nodes", i: 1, v: node("b", 510, ["a"]) },
    ]);

    const seen: number[] = [];
    const result = await fetchCurriculumMapStream(params, (nodes) => seen.push(nodes.length));

    // One callback per frame, and the map never shrinks or grows past its size:
    // the re-sends patch in place.
    expect(seen).toEqual([1, 2, 2, 2]);
    if ("scopes" in result) throw new Error("expected a map, not scope offers");
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.nodes.map((n) => n.y)).toEqual([370, 510]);
  });

  it("hands the canvas a real graph at every step, not just at the end", async () => {
    // Why the payload is a flat node list carrying its own prereqs: a partial
    // list is still a graph, so the map can paint before the stream finishes.
    serveFrames([
      { p: "nodes", i: 0, v: node("a", 440) },
      { p: "nodes", i: 1, v: node("b", 440, ["a"]) },
      { p: "nodes", i: 2, v: node("c", 580, ["b"]) },
    ]);

    const partials: Array<{ nodes: number; edges: number }> = [];
    await fetchCurriculumMapStream(params, (nodes) => {
      const graph = graphFromMapNodes(nodes);
      partials.push({ nodes: graph.nodes.length, edges: graph.edges.length });
    });

    expect(partials).toEqual([
      { nodes: 1, edges: 0 },
      { nodes: 2, edges: 1 },
      { nodes: 3, edges: 2 },
    ]);
  });

  it("reads a too-broad answer as scope offers, with no map (#30)", async () => {
    serveFrames([
      { p: "scopes", i: 0, v: { label: "Ownership", note: "the memory model" } },
      { p: "scopes", i: 1, v: { label: "Async Rust", note: "futures and executors" } },
    ]);

    const seen: number[] = [];
    const result = await fetchCurriculumMapStream(params, (nodes) => seen.push(nodes.length));

    expect(seen).toEqual([]);
    if (!("scopes" in result)) throw new Error("expected scope offers, not a map");
    expect(result.scopes.map((s) => s.label)).toEqual(["Ownership", "Async Rust"]);
  });

  it("surfaces a failed build as a thrown error the caller can toast", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 429,
      body: null,
      json: async () => ({ error: "You've hit today's generation limit" }),
    }));

    await expect(fetchCurriculumMapStream(params, () => {})).rejects.toThrow(
      /today's generation limit/,
    );
  });
});
