import { describe, expect, it, vi } from "vitest";
import {
  ERROR_PART,
  framesToPayload,
  ndjsonStream,
  type StreamFrame,
  type StreamShape,
} from "@/lib/server/stream";
import { ERROR_PART as CLIENT_ERROR_PART, collectFrames, fetchStream } from "@/lib/api";
import { AtlasError } from "@/lib/errors";

// The terminal error frame closes the app's oldest silent failure. Once the
// first frame is out the status is fixed at 200, so a stream that collapses
// halfway used to reach the client as a short-but-successful response: four of
// six sections, and no way for the reader to know six were coming.

const CONSUME: StreamShape = { chunks: { min: 4, max: 6 } };

const chunkFrames = (n: number): StreamFrame[] =>
  Array.from({ length: n }, (_, i) => ({
    p: "chunks",
    i,
    v: { id: `c${i + 1}` },
  }));

const errorFrame: StreamFrame = {
  p: ERROR_PART,
  v: { code: "upstream", message: "the model stopped", requestId: "abc123" },
};

describe("the error part name", () => {
  it("is the same string on both sides of the wire", () => {
    // Declared twice on purpose — client code never imports from lib/server —
    // so nothing but this test keeps them in step.
    expect(CLIENT_ERROR_PART).toBe(ERROR_PART);
  });
});

describe("framesToPayload", () => {
  it("refuses a set containing an error frame, even a complete-looking one", () => {
    // The guard has to be explicit: `assemble` walks the *shape's* parts and
    // would never look at `__error`, so without it a set that happens to
    // satisfy the shape would assemble and be cached despite having failed.
    const frames = [...chunkFrames(5), errorFrame];
    expect(framesToPayload(frames, CONSUME)).toBeNull();
  });

  it("still assembles the same set without the error frame", () => {
    // Proving the refusal above is caused by the frame and nothing else.
    expect(framesToPayload(chunkFrames(5), CONSUME)).not.toBeNull();
  });
});

describe("collectFrames", () => {
  it("ignores the error frame rather than folding it into the list", () => {
    const collected = collectFrames<{ id: string }>(
      [...chunkFrames(3), errorFrame],
      "chunks",
    );
    expect(collected).toEqual([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
  });
});

/** A Response whose body streams the given NDJSON lines. */
function ndjsonResponseOf(lines: string[], requestId = "req-1"): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(enc.encode(line + "\n"));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "x-atlas-request-id": requestId,
    },
  });
}

describe("fetchStream", () => {
  it("throws on a terminal error frame while keeping what already landed", async () => {
    const lines = [
      ...chunkFrames(2).map((f) => JSON.stringify(f)),
      JSON.stringify(errorFrame),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponseOf(lines)));
    const seen: StreamFrame[] = [];
    try {
      await expect(
        fetchStream({ kind: "consume" }, (f) => seen.push(f)),
      ).rejects.toMatchObject({
        code: "upstream",
        requestId: "abc123",
      });
      // The two sections that arrived were handed to the caller and stay on
      // screen. Throwing stops the caller treating a half pass as a whole one;
      // it does not take back what was delivered.
      expect(seen).toHaveLength(2);
      // …and the error frame itself is never delivered as content.
      expect(seen.every((f) => f.p === "chunks")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips a malformed line instead of throwing a raw SyntaxError", async () => {
    // This used to surface to the learner as the literal text of a JSON parse
    // error, via the toast.
    const lines = [
      JSON.stringify(chunkFrames(1)[0]),
      "{not json at all",
      JSON.stringify({ p: "chunks", i: 1, v: { id: "c2" } }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponseOf(lines)));
    try {
      const frames = await fetchStream({ kind: "consume" }, () => {});
      expect(collectFrames(frames, "chunks")).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("classifies a non-OK response from the server's own code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "nope", code: "rate_limit" }), {
          status: 429,
          headers: { "x-atlas-request-id": "r9" },
        }),
      ),
    );
    try {
      await expect(fetchStream({}, () => {})).rejects.toMatchObject({
        code: "rate_limit",
        status: 429,
        requestId: "r9",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("ndjsonStream", () => {
  it("writes a terminal error frame when the generator fails mid-stream", async () => {
    async function* dying(): AsyncGenerator<StreamFrame> {
      yield { p: "chunks", i: 0, v: { id: "c1" } };
      throw new AtlasError("upstream", "the model stopped");
    }
    const onComplete = vi.fn();
    const res = await ndjsonStream(dying(), {
      onComplete,
      onError: () => {},
      errorResponse: () => new Response(null, { status: 502 }),
      requestId: "req-7",
    });
    // Committed to a 200 by the first frame, exactly as before.
    expect(res.status).toBe(200);
    const text = await res.text();
    const frames = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as StreamFrame);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({
      p: ERROR_PART,
      v: { code: "upstream", requestId: "req-7" },
    });
    // Nothing incomplete may ever be handed to the cache writer.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps a clean finish free of any error frame", async () => {
    async function* fine(): AsyncGenerator<StreamFrame> {
      yield { p: "chunks", i: 0, v: { id: "c1" } };
    }
    const onComplete = vi.fn();
    const res = await ndjsonStream(fine(), {
      onComplete,
      onError: () => {},
      errorResponse: () => new Response(null, { status: 502 }),
    });
    expect(await res.text()).not.toContain(ERROR_PART);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
