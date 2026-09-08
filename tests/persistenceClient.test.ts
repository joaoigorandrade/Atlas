// The client half of the wire contract: what the app asks `/api/v1` for, and
// what it makes of the answer.
//
// `loadContent` is the piece worth pinning. It is the only thing standing
// between a payload the topic owns and a screen that renders it, and its
// failure mode is silent: a kind folded into the wrong bucket, or a legacy
// shape passed through unreshaped, reads as "no content" and the app quietly
// pays to generate what it already had.

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadContent, loadReview, patchNodes } from "@/lib/persistence";

type Item = { nodeId: string; kind: string; variant: string; payload: unknown };

function answering(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const section = {
  id: "c1",
  kicker: "1",
  body: ["…"],
  takeaway: "t",
  terms: [],
  ask: "",
};

afterEach(() => vi.unstubAllGlobals());

describe("loadContent", () => {
  const items = (...list: Array<Partial<Item>>): { items: Item[] } => ({
    items: list.map((i) => ({
      nodeId: "lat",
      kind: "consume",
      variant: "",
      payload: [],
      ...i,
    })),
  });

  it("folds each kind into the bucket its screen reads", async () => {
    answering(
      items(
        { kind: "consume", payload: [section] },
        { kind: "socratic", payload: [{ id: "s1" }] },
        { kind: "feynman", payload: [{ mustConvey: ["x"] }] },
        { kind: "connect", payload: { centerId: "lat" } },
        { kind: "crucible", payload: { problem: "…" } },
      ),
    );
    const caches = await loadContent("t1");
    expect(caches.consume.lat).toHaveLength(1);
    expect(caches.socratic.lat).toHaveLength(1);
    expect(caches.feynman.lat).toHaveLength(1);
    expect(caches.connect.lat).toBeTruthy();
    expect(caches.crucible.lat).toBeTruthy();
  });

  // What a row actually holds: `recordContent` stores the whole object
  // `job.run()` returned, envelope and all, and `writeContent` puts the same
  // thing in the shared cache. The tests above hand in the inner value, which
  // is why the cast through the envelope went unnoticed until a cached reading
  // reached the screens as an object and died on `chunks.map`.
  it("unwraps the envelope the payload is actually stored in", async () => {
    answering(
      items(
        { kind: "consume", payload: { chunks: [section] } },
        { kind: "socratic", payload: { steps: [{ id: "s1" }] } },
        { kind: "feynman", payload: { beats: [{ mustConvey: ["x"] }] } },
        { kind: "model", variant: "c1:analogy", payload: { beats: [{ label: "a" }] } },
        { kind: "connect", payload: { content: { centerId: "lat" } } },
        { kind: "crucible", payload: { content: { problem: "…" } } },
      ),
    );
    const caches = await loadContent("t1");
    expect(Array.isArray(caches.consume.lat)).toBe(true);
    expect(caches.consume.lat).toHaveLength(1);
    expect(caches.socratic.lat).toHaveLength(1);
    expect(caches.feynman.lat).toHaveLength(1);
    expect(caches.models["model:lat:c1:analogy"]).toHaveLength(1);
    expect(caches.connect.lat).toEqual({ centerId: "lat" });
    expect(caches.crucible.lat).toEqual({ problem: "…" });
  });

  it("keys a walkthrough by its variant, so two lenses are two payloads", async () => {
    answering(
      items(
        { kind: "model", variant: "c1:analogy", payload: [{ label: "a" }] },
        { kind: "model", variant: "c1:deeper", payload: [{ label: "d" }] },
      ),
    );
    const caches = await loadContent("t1");
    expect(Object.keys(caches.models).sort()).toEqual([
      "model:lat:c1:analogy",
      "model:lat:c1:deeper",
    ]);
  });

  it("takes retain as the topic's own, not a node's", async () => {
    answering(items({ kind: "retain", nodeId: "", payload: { cards: [] } }));
    expect((await loadContent("t1")).retain).toEqual({ cards: [] });
  });

  it("ignores a kind this build has no bucket for", async () => {
    // A server ahead of this client must degrade, not throw: an unknown kind is
    // content this version cannot draw, and everything else still has to land.
    answering(
      items({ kind: "someFutureKind" }, { kind: "socratic", payload: [{ id: "s1" }] }),
    );
    const caches = await loadContent("t1");
    expect(caches.socratic.lat).toHaveLength(1);
  });

  it("reshapes a reading written before the current section shape", async () => {
    // Carried over by the normalization from the old `caches` column, and never
    // re-validated on the way out — `ConsumeView` maps over `terms` unguarded.
    answering(
      items({ kind: "consume", payload: [{ id: "c1", kicker: "1", body: "flat" }] }),
    );
    const [chunk] = (await loadContent("t1")).consume.lat;
    expect(chunk.body).toEqual(["flat"]);
    expect(chunk.terms).toEqual([]);
  });

  it("drops a teach-back rubric with nothing to grade against", async () => {
    answering(items({ kind: "feynman", payload: [{ mustConvey: [] }] }));
    expect((await loadContent("t1")).feynman.lat).toBeUndefined();
  });

  it("asks for everything when no screen has narrowed it", async () => {
    const fetchMock = answering({ items: [] });
    await loadContent("t1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/topics/t1/content");
  });

  it("narrows to the nodes and kinds a screen is about to need", async () => {
    const fetchMock = answering({ items: [] });
    await loadContent("t1", { nodes: ["a", "b"], kinds: ["consume"] });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/topics/t1/content?nodes=a%2Cb&kinds=consume",
    );
  });
});

describe("failures", () => {
  it("prefers the server's own code over one guessed from the status", async () => {
    answering({ code: "rate_limit", error: "too many" }, false, 500);
    await expect(loadContent("t1")).rejects.toMatchObject({ code: "rate_limit" });
  });

  it("falls back to the status when the body says nothing", async () => {
    answering(null, false, 401);
    await expect(loadReview("t1", { budgetMin: 15, lang: "en" })).rejects.toMatchObject({
      code: "auth",
    });
  });
});

describe("patchNodes", () => {
  it("always sends a removal list, so an empty one is not an absent one", async () => {
    const fetchMock = answering({ ok: true });
    await patchNodes("t1", [{ id: "a" }]);
    const init = fetchMock.mock.calls[0][1] as unknown as {
      body: string;
      method: string;
    };
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ deltas: [{ id: "a" }], remove: [] });
  });
});
