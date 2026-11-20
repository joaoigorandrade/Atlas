// Which language a run presents in, and the one stored shape that still has to
// be reshaped on the way in. The snapshot-version ladder these tests used to
// cover is gone: a run is rows now, and `lib/server/store.ts` is where the
// round trip is checked (tests/store.test.ts).

import { describe, expect, it } from "vitest";
import { migrateConsume } from "@/lib/contentMigrate";
import { foldContent } from "@/lib/persistence";
import { languageAction } from "@/lib/i18n";

describe("stored content: a section missing what the validator would have added", () => {
  // Sections written before `validateConsumeSection` gave these two their empty
  // defaults are still out there — the normalization carried every payload the
  // `caches` column held straight into `node_content`, and a cache hit is
  // served without re-validation. `ConsumeView` maps over `terms` without a
  // guard, so one of these used to crash the reading.
  it("renders even without the fields the server would have defaulted", () => {
    const [chunk] = migrateConsume({
      lat: [{ id: "c1", kicker: "1", body: "…", takeaway: "…" }],
    } as never).lat;
    expect(chunk.terms).toEqual([]);
    expect(chunk.ask).toBe("");
  });
});

// ---- which language wins, and when it costs a regeneration ------------------

describe("languageAction", () => {
  const base = {
    settled: true,
    explicit: false,
    runLanguage: "pt-BR" as const,
    language: "pt-BR" as const,
    contentLanguage: "pt-BR" as const,
  };

  it("waits for detection rather than acting on the placeholder", () => {
    // The bug: this transition used to read as a deliberate switch and clear
    // the caches the hydrate was still loading.
    expect(
      languageAction({
        ...base,
        settled: false,
        language: "en",
        contentLanguage: "en",
      }),
    ).toBe("wait");
  });

  it("takes the run's language over a guess from the device", () => {
    expect(languageAction({ ...base, language: "en" })).toBe("adopt");
  });

  it("does not override a language the learner chose", () => {
    expect(languageAction({ ...base, explicit: true, language: "en" })).toBe("switch");
  });

  it("leaves a run whose language is unknown on the UI language", () => {
    // A pre-v9 snapshot: nothing to adopt, and no switch either — the content
    // is already whatever the UI is showing.
    expect(
      languageAction({
        ...base,
        runLanguage: undefined,
        language: "en",
        contentLanguage: "en",
      }),
    ).toBe("none");
  });

  it("stays put when nothing disagrees", () => {
    expect(languageAction(base)).toBe("none");
  });
});

// ---- stored payloads whose shape changed under them ---------------------------
// `node_content` is addressed by (topic, node, kind, variant) and is not
// version-guarded, so a row outlives a change to the shape it holds — and a
// hit reaches the client without re-validation. The six newest phases shipped
// first as two shared family shapes and were then split into six; on
// production a row written in between opened its phase straight into the error
// boundary, with no way past it. `foldContent` drops those rows so the phase
// regenerates instead.

describe("foldContent drops payloads the renderer cannot read", () => {
  const row = (kind: string, payload: unknown) => ({
    nodeId: "n",
    kind,
    variant: "",
    payload,
  });

  it("drops a phase payload carrying the wrong array", () => {
    // The real case: the old shared shape held `items`, and TraceView reads
    // `stages`. Truthy, so the render branch opened; undefined on deref, so it
    // crashed.
    const caches = foldContent([
      row("trace", { nodeId: "n", nodeLabel: "N", items: [{ id: "i" }] }),
    ] as never);
    expect(caches.trace).toEqual({});
  });

  it("keeps a payload in the shape its screen actually reads", () => {
    const good = { nodeId: "n", nodeLabel: "N", scenario: "s", stages: [{ id: "t" }] };
    const caches = foldContent([row("trace", good)] as never);
    expect(caches.trace.n).toEqual(good);
  });

  it("guards every one of the six, each on its own field", () => {
    // A phase missing from the guard is a phase that can still be handed a
    // stale row, which is exactly how this shipped.
    const wrong = { nodeId: "n", nodeLabel: "N", items: [] };
    const caches = foldContent([
      row("discriminate", wrong),
      row("predict", wrong),
      row("trace", wrong),
      row("drill", wrong),
      row("recall", wrong),
      row("perform", wrong),
    ] as never);
    for (const kind of [
      "discriminate",
      "predict",
      "trace",
      "drill",
      "recall",
      "perform",
    ] as const)
      expect(caches[kind], `${kind} kept a stale-shaped row`).toEqual({});
  });
});
