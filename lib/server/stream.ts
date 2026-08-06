// The progressive-delivery wire, shared by every streamed kind.
//
// A generator yields *frames* — one named slot of the eventual payload — and
// this module turns them into NDJSON on the way out and back into the exact
// payload shape `Job.run()` would have returned on the way into the cache.
// That round-trip equality is the whole contract: `/api/generate` writes the
// assembled payload under the job's normal cache key, so a streamed generation
// and a single-shot one are indistinguishable to `content_cache`, to
// `/api/content`, and to every client that reads a hit.
//
// Lifted out of app/api/generate/route.ts, which had all of this hard-coded to
// ConsumeChunk. The one behaviour worth preserving verbatim is the peek in
// `ndjsonStream`: the first frame is pulled *before* committing to a 200, so a
// genuine failure still surfaces as an error status instead of an empty stream.

/** One slot of a payload. `i` is present iff the slot is a list item.
 *
 *  `partial: true` marks a redraw of the slot currently being written — the
 *  token-by-token layer. It is for rendering only: it never validated, so it is
 *  dropped before assembly (below) and before caching, and a complete frame for
 *  the same slot always follows and replaces it. */
export type StreamFrame =
  | { p: string; v: unknown; partial?: true }
  | { p: string; i: number; v: unknown; partial?: true };

/**
 * What a complete payload looks like: each part name mapped to `"one"` (a
 * scalar slot) or the item count a list slot must carry. This is what makes
 * "incomplete" decidable — without it a stream that dies after two of five
 * sections would assemble into a plausible-looking payload and get cached, and
 * cache hits skip validation.
 *
 * List bounds mirror the per-kind validators rather than the number the prompt
 * asks for: Consume asks for 5 sections but `validateConsume` accepts 4-6, and
 * a stream that legitimately produced 4 must still be cacheable.
 */
export type StreamShape = Record<string, "one" | { min: number; max: number }>;

/**
 * Some kinds have more than one legal payload. Curriculum is the case that
 * forced this: a normal topic yields a map plus placement questions, while a
 * too-broad one yields scope offers instead and nothing else — both are
 * complete, cacheable answers. Shapes are tried in order and the first that
 * fits wins, so list the more specific one first.
 */
export type StreamShapes = StreamShape | StreamShape[];

const asList = (shapes: StreamShapes): StreamShape[] =>
  Array.isArray(shapes) ? shapes : [shapes];

function isItem(f: StreamFrame): f is { p: string; i: number; v: unknown } {
  return typeof (f as { i?: number }).i === "number";
}

/**
 * Fold frames into the payload shape. Later frames for the same slot replace
 * earlier ones — Consume relies on this: each section arrives once as pure
 * reading material and again once its adaptive rewrites are ready, and the
 * second arrival must patch the first rather than append a sixth section.
 *
 * Returns null when any part is missing or short, which is the caller's signal
 * not to cache.
 */
export function framesToPayload(
  frames: StreamFrame[],
  shapes: StreamShapes,
): Record<string, unknown> | null {
  // Partial redraws are never part of a payload: they were never validated,
  // and a cache hit is served without re-validation.
  const complete = frames.filter((f) => !f.partial);
  for (const shape of asList(shapes)) {
    const payload = assemble(complete, shape);
    if (payload) return payload;
  }
  return null;
}

function assemble(
  frames: StreamFrame[],
  shape: StreamShape,
): Record<string, unknown> | null {
  const scalars = new Map<string, unknown>();
  const lists = new Map<string, Map<number, unknown>>();
  for (const f of frames) {
    if (isItem(f)) {
      let slot = lists.get(f.p);
      if (!slot) lists.set(f.p, (slot = new Map()));
      slot.set(f.i, f.v);
    } else {
      scalars.set(f.p, f.v);
    }
  }

  const payload: Record<string, unknown> = {};
  for (const [part, expected] of Object.entries(shape)) {
    if (expected === "one") {
      if (!scalars.has(part)) return null;
      payload[part] = scalars.get(part);
      continue;
    }
    const slot = lists.get(part);
    if (!slot || slot.size < expected.min || slot.size > expected.max) return null;
    const items: unknown[] = [];
    for (let i = 0; i < slot.size; i++) {
      // Indices must be dense from 0: a hole means a frame was lost, and the
      // resulting array would silently renumber everything after it.
      if (!slot.has(i)) return null;
      items.push(slot.get(i));
    }
    payload[part] = items;
  }
  return payload;
}

/** The inverse: replay an already-assembled payload (a cache hit) as frames,
 *  so the client reads one wire format whether the content was just written or
 *  came out of Postgres. */
export function payloadToFrames(
  payload: Record<string, unknown>,
  shapes: StreamShapes,
): StreamFrame[] {
  // Pick the variant this payload actually is, or a hit on a too-broad topic
  // would replay as zero frames and the client would see an empty stream.
  const shape =
    asList(shapes).find((s) =>
      Object.keys(s).every((part) => payload[part] !== undefined),
    ) ?? asList(shapes)[0];
  const frames: StreamFrame[] = [];
  for (const [part, expected] of Object.entries(shape)) {
    const value = payload[part];
    if (expected === "one") {
      if (value !== undefined) frames.push({ p: part, v: value });
      continue;
    }
    if (Array.isArray(value)) value.forEach((v, i) => frames.push({ p: part, i, v }));
  }
  return frames;
}

const NDJSON_HEADERS = (cache: "hit" | "miss") => ({
  "Content-Type": "application/x-ndjson",
  "x-atlas-cache": cache,
});

/** A fully-known frame list, written out at once. Used for cache hits. */
export function ndjsonResponse(frames: StreamFrame[], cache: "hit" | "miss"): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(JSON.stringify(f) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS(cache) });
}

/**
 * Stream a generator's frames to the client as they are produced.
 *
 * The first frame is awaited before any bytes are committed, so a generation
 * that fails outright still becomes a normal error response — `errorResponse`
 * decides what that looks like. Once the first frame is in hand the status is
 * fixed at 200 and a later failure can only be logged: the client keeps
 * whatever landed, and because `onComplete` never runs, nothing is cached and
 * reopening retries.
 */
export async function ndjsonStream(
  gen: AsyncGenerator<StreamFrame>,
  opts: {
    /** Every frame, in arrival order. Only called on a clean finish. */
    onComplete: (frames: StreamFrame[]) => void;
    onError: (err: unknown, phase: "first" | "mid") => void;
    errorResponse: (err: unknown) => Response;
  },
): Promise<Response> {
  let first: IteratorResult<StreamFrame>;
  try {
    first = await gen.next();
  } catch (err) {
    opts.onError(err, "first");
    return opts.errorResponse(err);
  }
  if (first.done) {
    const err = new Error("content generation produced nothing");
    opts.onError(err, "first");
    return opts.errorResponse(err);
  }

  const enc = new TextEncoder();
  const frames: StreamFrame[] = first.value.partial ? [] : [first.value];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(JSON.stringify(first.value) + "\n"));
      try {
        for await (const frame of gen) {
          // Redraws go out on the wire but are not retained: only the complete
          // frames are the payload, and a long prose stream produces hundreds.
          if (!frame.partial) frames.push(frame);
          controller.enqueue(enc.encode(JSON.stringify(frame) + "\n"));
        }
        opts.onComplete(frames);
      } catch (err) {
        opts.onError(err, "mid");
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS("miss") });
}
