// The browser's device mirror (`docs/CONTENT-STORAGE.md`, rule 3).
//
// What is worth pinning is the paint-then-revalidate order and its failure
// mode. A mirror that silently holds nothing is invisible — the app still
// works, it just goes back to waiting on the network for a reading it already
// had — so the assertions here are about *what reached the screen and when*,
// not about the store's internals.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMirror,
  dropMirror,
  hydrateContent,
  mirrorItem,
  mirrorLanded,
  readMirror,
  writeMirror,
} from "@/lib/contentMirror";
import type { ContentItem } from "@/lib/persistence";

/** The smallest `CacheStorage` that behaves like the real one. Node has none,
 *  and the point of these tests is the policy, not the browser's storage. */
function installCaches(): Map<string, Map<string, string>> {
  const stores = new Map<string, Map<string, string>>();
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const rows = stores.get(name)!;
    return Promise.resolve({
      match: (url: string) =>
        Promise.resolve(
          rows.has(url)
            ? { json: () => Promise.resolve(JSON.parse(rows.get(url)!)) }
            : undefined,
        ),
      put: async (url: string, res: Response) => {
        rows.set(url, await res.text());
      },
      delete: (url: string) => Promise.resolve(rows.delete(url)),
      keys: () => Promise.resolve([...rows.keys()]),
    });
  };
  vi.stubGlobal("caches", {
    open,
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    keys: () => Promise.resolve([...stores.keys()]),
  });
  return stores;
}

const section = { id: "c1", kicker: "1", body: ["…"], takeaway: "t" };

const reading = (nodeId = "lat"): ContentItem => ({
  nodeId,
  kind: "consume",
  variant: "",
  payload: [section],
});

/** `/api/v1` answering with these items. */
function answering(items: ContentItem[] | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (items instanceof Error) throw items;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ items }),
      };
    }),
  );
}

/** No run open — the state the mirror must not write in. */
function setGenerationTopicToNull(): void {
  void import("@/lib/generationTopic").then((m) => m.setGenerationTopic(null));
}

beforeEach(() => installCaches());
afterEach(() => vi.unstubAllGlobals());

describe("the device mirror", () => {
  it("gives back exactly the items it was handed", async () => {
    await writeMirror("t1", [reading()]);
    // Item for item, unmodified: rebuilding this from the folded caches would
    // drop the fields only the *other* client renders.
    expect(await readMirror("t1")).toEqual([reading()]);
  });

  it("holds nothing for a topic it has never seen", async () => {
    expect(await readMirror("t-unknown")).toBeNull();
  });

  it("drops one topic and clears them all", async () => {
    await writeMirror("t1", [reading()]);
    await writeMirror("t2", [reading("der")]);
    await dropMirror("t1");
    expect(await readMirror("t1")).toBeNull();
    expect(await readMirror("t2")).not.toBeNull();
    await clearMirror();
    expect(await readMirror("t2")).toBeNull();
  });

  it("merges onto what it holds rather than replacing it", async () => {
    await writeMirror("t1", [reading("lat"), reading("der")]);
    // One landed generation must not erase the rest of the topic — this is
    // the write path a generation takes, and it carries one item.
    await writeMirror("t1", [{ ...reading("lat"), payload: [{ ...section, id: "c2" }] }]);
    const held = await readMirror("t1");
    expect(held).toHaveLength(2);
    expect(held?.find((i) => i.nodeId === "lat")?.payload).toEqual([
      { ...section, id: "c2" },
    ]);
  });

  it("keeps what it holds when the server answers with nothing", async () => {
    // A version bump abandons every shared row, so a hydrate can come back
    // empty for a topic this device has content for. Replacing on that answer
    // destroyed the one copy that could still open the reading.
    await writeMirror("t1", [reading()]);
    await writeMirror("t1", []);
    expect(await readMirror("t1")).toEqual([reading()]);
  });

  it("takes one generation as it lands", async () => {
    mirrorItem("t1", reading());
    // Rule 3: written on both paths — a hydrate landing, and a generation.
    await vi.waitFor(async () => expect(await readMirror("t1")).toEqual([reading()]));
  });

  it("is a no-op, never a throw, where the browser has no store", async () => {
    // Private mode, an insecure origin, SSR. A mirror that fails must cost a
    // round trip and never a screen.
    vi.stubGlobal("caches", undefined);
    await expect(writeMirror("t1", [reading()])).resolves.toBeUndefined();
    expect(await readMirror("t1")).toBeNull();
    await expect(clearMirror()).resolves.toBeUndefined();
  });
});

describe("a landed generation", () => {
  // The warm queue's key is the address — it is the one place every
  // generation settles, whoever asked for it, so it is where the mirror is
  // written. Nothing else about the queue knows what content is.
  it("keeps both when two land at once", async () => {
    // The warm queue runs two at a time by design, and a merge is a read, a
    // modify and a write: unserialized, the second write threw the first away.
    const { setGenerationTopic } = await import("@/lib/generationTopic");
    setGenerationTopic("t-race");
    mirrorLanded("consume:lat", [section]);
    mirrorLanded("consume:der", [section]);
    mirrorLanded("socratic:lat", [{ id: "s1" }]);
    await vi.waitFor(async () => expect(await readMirror("t-race")).toHaveLength(3));
    setGenerationTopic(null);
  });

  it("files each kind under its own address", async () => {
    const { setGenerationTopic } = await import("@/lib/generationTopic");
    setGenerationTopic("t1");
    mirrorLanded("consume:lat", [section]);
    mirrorLanded("model:lat:c1:eli5", [{ label: "Passo 1" }]);
    await vi.waitFor(async () => expect(await readMirror("t1")).toHaveLength(2));
    const held = await readMirror("t1");
    expect(held).toContainEqual({
      nodeId: "lat",
      kind: "consume",
      variant: "",
      payload: [section],
    });
    expect(held).toContainEqual({
      nodeId: "lat",
      kind: "model",
      variant: "c1:eli5",
      payload: [{ label: "Passo 1" }],
    });
    setGenerationTopic(null);
  });

  it("skips what is not a node's content", async () => {
    const { setGenerationTopic } = await import("@/lib/generationTopic");
    setGenerationTopic("t2");
    // A summary lands on the node in the graph and is saved with the run; a
    // Retain draft becomes `cards` rows. Neither is the mirror's business, and
    // `retain:a,b,c` is not even an address.
    mirrorLanded("summary:lat", "uma frase");
    mirrorLanded("retain:lat,der", { cards: [] });
    mirrorLanded("consume:lat", undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(await readMirror("t2")).toBeNull();
    setGenerationTopic(null);
  });

  it("holds nothing when no run is open", async () => {
    setGenerationTopicToNull();
    mirrorLanded("consume:lat", [section]);
    await new Promise((r) => setTimeout(r, 0));
    expect(await readMirror("t1")).toBeNull();
  });
});

describe("hydrateContent", () => {
  it("paints from the mirror before the network answers", async () => {
    await writeMirror("t1", [reading()]);
    answering([reading()]);
    const painted: string[][] = [];
    await hydrateContent("t1", (c) => painted.push(Object.keys(c.consume)));
    // Twice: the mirror, then the revalidation behind it.
    expect(painted).toEqual([["lat"], ["lat"]]);
  });

  it("still paints when the network never answers", async () => {
    // The whole reason the mirror exists: a reading already on this device
    // opens with no signal, instead of waiting on a request that will fail.
    await writeMirror("t1", [reading()]);
    answering(new Error("offline"));
    const painted: string[][] = [];
    await hydrateContent("t1", (c) => painted.push(Object.keys(c.consume)));
    expect(painted).toEqual([["lat"]]);
  });

  it("mirrors what the network sent, for next time", async () => {
    answering([reading(), { ...reading("der"), kind: "socratic" }]);
    await hydrateContent("t1", () => {});
    expect(await readMirror("t1")).toHaveLength(2);
  });

  it("does not paint an empty pass over a run that has none", async () => {
    // An empty mirror is not content: applying it would announce "loaded" for
    // a topic whose reading has not arrived.
    answering([]);
    const painted: number[] = [];
    await hydrateContent("t-empty", (c) => painted.push(Object.keys(c.consume).length));
    expect(painted).toEqual([0]);
  });
});
