// The one unwrap in the system (`docs/CONTENT-STORAGE.md`, rule 1).
//
// `content_cache` stores what `job.run()` returned — the generator's envelope.
// What leaves `/api/v1/topics/:id/content` is the shape the screen renders, so
// a stored item and a live stream deliver the same thing and a client needs
// one decoder rather than two.
//
// This is worth pinning per kind because its failure mode is silent on both
// clients: the web renders an object where it expects a list, and iOS's
// `try? decode` drops the row and quietly regenerates content the topic owns.

import { describe, expect, it } from "vitest";
import { renderShape } from "@/lib/server/store";

const section = { id: "c1", kicker: "1 · O que é", body: ["…"], takeaway: "t" };

describe("renderShape", () => {
  it("takes the envelope off every kind a topic can own", () => {
    expect(renderShape("consume", { chunks: [section] })).toEqual([section]);
    expect(renderShape("socratic", { steps: [{ id: "s1" }] })).toEqual([{ id: "s1" }]);
    expect(renderShape("feynman", { beats: [{ subPoint: "x" }] })).toEqual([
      { subPoint: "x" },
    ]);
    expect(renderShape("model", { beats: [{ label: "Passo 1" }] })).toEqual([
      { label: "Passo 1" },
    ]);
    expect(renderShape("connect", { content: { centerId: "lat" } })).toEqual({
      centerId: "lat",
    });
    expect(renderShape("crucible", { content: { problem: "…" } })).toEqual({
      problem: "…",
    });
    expect(renderShape("retain", { content: { cards: [] } })).toEqual({ cards: [] });
    expect(renderShape("summary", { summary: "uma frase" })).toBe("uma frase");
  });

  it("passes a backfilled row through untouched", () => {
    // The normalization carried the old `caches` column over already
    // unwrapped. An absent slot means "this is the value", not "this is
    // malformed" — unwrapping twice would hand the screen a section's `chunks`.
    expect(renderShape("consume", [section])).toEqual([section]);
    expect(renderShape("connect", { centerId: "lat" })).toEqual({ centerId: "lat" });
  });

  it("leaves a kind with no envelope alone", () => {
    // Nothing else is ever stored against a node, but a kind added to
    // `RECORDED` without a slot here must degrade to a pass-through rather
    // than to an empty screen.
    expect(renderShape("judge", { verdict: "close" })).toEqual({ verdict: "close" });
  });

  it("survives the payload an abandoned cache row resolves to", () => {
    // A `CONTENT_CACHE_VERSION` bump leaves pointers whose shared row is gone.
    // The route drops those; this must not throw on the way there.
    expect(renderShape("consume", undefined)).toBeUndefined();
    expect(renderShape("consume", null)).toBeNull();
  });
});
