// Fixture-mode persistence (docs/PLAN-QUALITY.md §1.2): under ATLAS_FIXTURES=1
// every `run_states` read and write goes to `/api/test/seed` instead of
// Postgres. It is the path every e2e run depends on to land on a state, so it
// gets the one check that fails without a browser: the route it calls, and the
// shape it hands back.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshot = {
  v: 9,
  form: { topic: "Linear algebra", goal: "mastery" },
  graph: { nodes: [{ id: "n1", label: "One" }], edges: [] },
  states: { n1: "mastered" },
  adherence: { lastDay: "2026-08-15", streak: 0, metToday: false },
};

/** The seed route, as far as this file is concerned. */
function stubFetch() {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok: true,
      json: async () => ({ runs: [{ subject: "Linear algebra", snapshot, caches: {} }] }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

/** Imported fresh per test: the fixture flag is read once, at module load. */
async function persistence() {
  vi.stubEnv("NEXT_PUBLIC_ATLAS_FIXTURES", "1");
  vi.resetModules();
  return import("@/lib/persistence");
}

describe("persistence in fixture mode", () => {
  let calls: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    calls = stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads the most recent run from the seed route, never Supabase", async () => {
    const { loadRunCore } = await persistence();
    // The client argument is not optional in the signature and is never used
    // here — passing a throwing stand-in is how this test proves that.
    const row = await loadRunCore(null as never);
    expect(row?.subject).toBe("Linear algebra");
    expect(row?.snapshot.states).toEqual({ n1: "mastered" });
    expect(calls[0].url).toBe("/api/test/seed");
  });

  it("scopes a by-subject read to that subject", async () => {
    const { loadRunBySubject } = await persistence();
    await loadRunBySubject(null as never, "Linear algebra");
    expect(calls[0].url).toBe("/api/test/seed?subject=Linear%20algebra");
  });

  it("derives the dashboard cards the same way the live path does", async () => {
    const { listRuns } = await persistence();
    const rows = await listRuns(null as never);
    expect(rows).toEqual([
      {
        subject: "Linear algebra",
        goal: "mastery",
        graph: snapshot.graph,
        states: snapshot.states,
      },
    ]);
  });

  it("posts the snapshot and the caches as separate writes", async () => {
    const { saveRun, saveRunCaches, emptyCaches } = await persistence();
    await saveRun(null as never, "Linear algebra", snapshot as never);
    await saveRunCaches(null as never, "Linear algebra", emptyCaches());
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST"]);
    expect(calls[0].body).toHaveProperty("snapshot");
    expect(calls[1].body).toHaveProperty("caches");
  });

  it("deletes through the route rather than silently no-opping", async () => {
    const { deleteRun } = await persistence();
    await deleteRun(null as never, "Linear algebra");
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "/api/test/seed?subject=Linear%20algebra",
    });
  });
});
