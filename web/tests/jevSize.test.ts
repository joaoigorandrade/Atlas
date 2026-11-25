import { afterEach, describe, expect, it, vi } from "vitest";
import { sizeMap } from "@/lib/server/generate/jev";

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
    expect(await sizeMap({ topic: "why is the sea salty?", goal: "glance" })).toEqual([1, 1]);
  });

  it("no answer leaves the prompt's band", async () => {
    answering("1", 0.14);
    expect(await sizeMap({ topic: "why is the sea salty?", goal: "glance" })).toEqual([1, 1]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    expect(await sizeMap({ topic: "why is the sea salty?", goal: "glance" })).toBeUndefined();
  });

  it("a full map gets a range", async () => {
    answering("8-11", 0.9);
    expect(await sizeMap({ topic: "binary trees", goal: "mastery" })).toEqual([8, 11]);
  });

  it("pareto is sized by its share, never asked", async () => {
    const fetch = answering("8-11", 0.9);
    expect(await sizeMap({ topic: "binary trees", goal: "pareto" })).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
