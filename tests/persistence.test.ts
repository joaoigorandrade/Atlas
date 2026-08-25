import { describe, expect, it } from "vitest";
import { loadRunCore, migrateConsume } from "@/lib/persistence";
import { languageAction } from "@/lib/i18n";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Just enough of the client for `loadRunCore`: it only ever chains down to a
 *  single `maybeSingle`. */
const clientReturning = (snapshot: unknown): SupabaseClient => {
  const result = Promise.resolve({
    data: { subject: "Concorrência em Swift", snapshot },
    error: null,
  });
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient;
};

const core = {
  form: {
    topic: "Concorrência em Swift",
    goal: "",
    paretoPct: 20,
    interests: [],
  },
  graph: { nodes: [], edges: [] },
  spawnedIds: [],
  states: {},
  positions: {},
  adherence: {},
  calibSamples: [],
  litToday: [],
};

describe("run snapshot: content language", () => {
  it("keeps a v9 run's own language", async () => {
    const run = await loadRunCore(clientReturning({ ...core, v: 9, language: "pt-BR" }));
    expect(run?.snapshot.language).toBe("pt-BR");
  });

  // The bug this exists to prevent: a pre-v9 row's content language was never
  // recorded, and defaulting it to *anything* is a guess that read-aloud then
  // acts on — an English voice over Portuguese prose, billed to its own cache
  // key. Undefined is the honest answer, and the caller falls back to the UI
  // language exactly as it did before.
  it("leaves a pre-v9 run's language unknown rather than guessing", async () => {
    const run = await loadRunCore(clientReturning({ ...core, v: 8 }));
    expect(run?.snapshot.v).toBe(9);
    expect(run?.snapshot.language).toBeUndefined();
  });
});

// ---- the other client's keys ------------------------------------------------

describe("run snapshot: another client's keys", () => {
  // The bug this exists to prevent: `useRunState` spreads the loaded snapshot
  // under the literal it saves, which is the only thing carrying the iOS
  // client's `iosCards` (an SM-2 queue; this one schedules with FSRS) back out.
  // A `migrate` that built a literal instead of spreading would delete the
  // phone's review queue the first time the run was opened in a browser.
  it("keeps a key this app has no field for", async () => {
    const run = await loadRunCore(
      clientReturning({ ...core, v: 9, iosCards: [{ id: "c1" }] }),
    );
    expect((run?.snapshot as unknown as { iosCards: unknown }).iosCards).toEqual([
      { id: "c1" },
    ]);
  });

  // The other half: the pre-v3 inline caches have their own column now, and
  // must not ride back into the snapshot one.
  it("drops a pre-v3 row's inline caches", async () => {
    const run = await loadRunCore(clientReturning({ ...core, v: 2, caches: {} }));
    expect(run?.snapshot).not.toHaveProperty("caches");
    expect(run?.inlineCaches).not.toBeNull();
  });
});

describe("run caches: a section written on the phone", () => {
  // The iOS client generates on-device, so its sections never pass through
  // `validateConsumeSection` — the server-side step that gives these two their
  // empty defaults. `ConsumeView` maps over `terms` without a guard, so a
  // reading pass written on a phone used to crash the browser that opened it.
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
