import { afterEach, describe, expect, it, vi } from "vitest";
import { sizeDeck, sizeMap } from "@/lib/server/generate/jev";

const answering = (choice: string, confidence: number) => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          answers: { size: { type: "choice", choice, confidence, probabilities: {} } },
        }),
      ),
  );
  vi.stubEnv("OPENROUTER_API_KEY", "k");
  vi.stubEnv("ATLAS_FIXTURES", "");
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

describe("sizeMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("a quick look takes the top pick as an exact count", async () => {
    answering("1", 0.95);
    expect(await sizeMap({ topic: "why is the sea salty?", goal: "glance" })).toEqual([
      1, 1,
    ]);
  });

  it("no answer leaves the prompt's band", async () => {
    answering("1", 0.14);
    expect(await sizeMap({ topic: "why is the sea salty?", goal: "glance" })).toEqual([
      1, 1,
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    expect(
      await sizeMap({ topic: "why is the sea salty?", goal: "glance" }),
    ).toBeUndefined();
  });
});

describe("sizeDeck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("gives each node its own band, by id", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("ATLAS_FIXTURES", "");
    const ans = (choice: string) => ({
      type: "choice",
      choice,
      confidence: 0.3,
      probabilities: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ answers: { cards_0: ans("16-20"), cards_1: ans("5-7") } }),
          ),
      ),
    );
    expect(
      await sizeDeck("binary trees", [
        { id: "bst", label: "BST invariant" },
        { id: "leaf", label: "Leaf" },
      ]),
    ).toEqual({ bst: [16, 20], leaf: [5, 7] });
  });

  it("no Jev leaves the one-card-per-idea band", async () => {
    vi.stubEnv("DECIDE_MODEL", "off");
    expect(await sizeDeck("binary trees", [{ id: "bst", label: "BST" }])).toBeNull();
  });
});
