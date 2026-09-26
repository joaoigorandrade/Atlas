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
import { renderShape, SLOT } from "@/lib/server/store";
import { CACHEABLE_KINDS } from "@/lib/server/contentCache";
import { RECORDED_KINDS } from "@/lib/server/afterBuild";
import { PHASE_ORDER } from "@/lib/curriculum";

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

// ---- the drift this file could not see ---------------------------------------
// Both tables below are enumerations of "every cacheable kind", and both used
// to be maintained by hand beside a union type that could not check them. When
// the phase catalogue grew from six phases to twelve, `RECORDED` was not
// updated: the six new kinds generated, cached, and were never filed against
// the topic — so a CONTENT_CACHE_VERSION bump or the TTL prune would have
// taken that content back from the learner it was written for and re-billed
// them for it. Nothing failed, nothing logged; it was found by walking a real
// map on production.
//
// `RECORDED` is derived from `CACHEABLE_KINDS` now, so that particular drift
// is structurally impossible. These pin the rest: a new cacheable kind gets a
// slot, and stays recordable.

describe("every cacheable kind is wired all the way through", () => {
  // Two kinds belong to no node: the map itself, and a continent's links
  // (which maps share a coast). Both are read whole and filed nowhere.
  const recordable = CACHEABLE_KINDS.filter(
    (k) => k !== "curriculum" && k !== "continentLinks",
  );

  it("has a payload slot, so nothing is served still wearing its envelope", () => {
    // `curriculum` is exempt: its payload is the flat `nodes` list itself, and
    // `renderShape` rightly passes an unslotted kind through untouched. So is
    // `continentLinks`, whose `{ links }` is exactly what the client reads.
    const missing = recordable.filter((kind) => !SLOT[kind]);
    expect(missing, "kinds with no renderShape slot").toEqual([]);
  });

  it("is filed against the topic that generated it", () => {
    // The assertion that would have caught it. `recordContent` skips any kind
    // outside this set, and a skipped kind is content the learner loses on the
    // next prune.
    const unrecorded = recordable.filter((kind) => !RECORDED_KINDS.has(kind));
    expect(unrecorded, "cacheable kinds never written to node_content").toEqual([]);
  });

  it("covers all twelve phases of the catalogue", () => {
    // Phases are the kinds a learner actually waits on. Every one but Retain
    // is per-node and cacheable under its own phase id; Retain is the shared
    // queue and is cacheable too.
    const missing = PHASE_ORDER.filter(
      (phase) => !(CACHEABLE_KINDS as readonly string[]).includes(phase),
    );
    expect(missing, "phases with no cacheable generation").toEqual([]);
  });
});
