import { afterEach, describe, expect, it, vi } from "vitest";
import { decide, sureChoice, sureNoul } from "@/lib/server/decide";

describe("decide", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("only a sure answer settles anything", () => {
    const pick = (confidence: number) =>
      sureChoice({ type: "choice", choice: "a", confidence, probabilities: {} });
    expect(pick(0.9)).toBe("a");
    expect(pick(0.6)).toBeUndefined();
    expect(sureNoul({ type: "noul", noul: 0.97 })).toBe(true);
    expect(sureNoul({ type: "noul", noul: 0.03 })).toBe(false);
    expect(sureNoul({ type: "noul", noul: 0.5 })).toBeUndefined();
  });

  it("never throws: a provider error is no decision", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    expect(
      await decide(
        "s",
        { q: { type: "noul", instructions: "?", criteria: { true: "y", false: "n" } } },
        "t",
      ),
    ).toBeNull();
  });

  it("is off without a key and when disabled", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const q = {
      q: {
        type: "noul" as const,
        instructions: "?",
        criteria: { true: "y", false: "n" },
      },
    };
    expect(await decide("s", q, "t")).toBeNull();
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("DECIDE_MODEL", "off");
    expect(await decide("s", q, "t")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
