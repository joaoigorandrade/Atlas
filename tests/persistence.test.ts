// Which language a run presents in, and the one stored shape that still has to
// be reshaped on the way in. The snapshot-version ladder these tests used to
// cover is gone: a run is rows now, and `lib/server/store.ts` is where the
// round trip is checked (tests/store.test.ts).

import { describe, expect, it } from "vitest";
import { migrateConsume } from "@/lib/contentMigrate";
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
