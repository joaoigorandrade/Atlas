import { describe, expect, it } from "vitest";
import { loadRunCore } from "@/lib/persistence";
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
