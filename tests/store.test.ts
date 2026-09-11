// The normalized run store: rows in, a drawable run out, and a delete that
// leaves nothing behind.
//
// These three properties are the whole point of the normalization, and each of
// them used to be untestable — a run was two JSONB columns, so "is the map
// still consistent" and "did deleting a topic take its cards" were questions
// about a blob rather than about a schema.
//
// It runs against the fixture tables (lib/server/fixtures.ts), which the app
// itself now uses in fixture mode — so this exercises the same `store.ts` the
// live path does, not a second implementation of it.

import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USER_ID, fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables, seededTables } from "@/lib/server/fixtureTables";
import {
  applyNodeDeltas,
  createTopic,
  deleteNodes,
  deleteTopic,
  loadLibrary,
  loadTopic,
  putCards,
  putContent,
  readContentRows,
} from "@/lib/server/store";
import type { ConceptGraph } from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";

const db = () => fixtureSupabase() as unknown as SupabaseClient;

const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 0, week: 0, x: 1, y: 2 },
    { id: "b", label: "B", state: "unknown", g: 1, week: 0, x: 3, y: 4 },
  ],
  edges: [["a", "b", false]],
};

const card = (id: string, nodeId: string): StoredCard =>
  ({
    id,
    nodeId,
    type: "recall",
    source: "Retain",
    back: "…",
    fsrs: { due: "2026-01-01T00:00:00.000Z" },
  }) as unknown as StoredCard;

const makeTopic = () =>
  createTopic(db(), FIXTURE_USER_ID, { subject: "Linear Algebra", graph });

beforeEach(resetTables);

describe("a run, stored as rows", () => {
  it("comes back as the graph, states and positions a map draws", async () => {
    const topic = await makeTopic();
    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.graph.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(loaded?.graph.edges).toEqual([["a", "b", false]]);
    // Positions are their own map because the browser draws from it and never
    // from the node's generated coordinates.
    expect(loaded?.positions.a).toEqual({ x: 1, y: 2 });
    expect(loaded?.states).toEqual({ a: "unknown", b: "unknown" });
  });

  it("writes one node when one node changed", async () => {
    const topic = await makeTopic();
    await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, [
      { id: "b", state: "mastered", x: 99 },
    ]);
    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.states).toEqual({ a: "unknown", b: "mastered" });
    expect(loaded?.positions.b).toEqual({ x: 99, y: 4 });
    // The node it did not name is untouched — the property that makes a drag
    // safe to send as a delta at all.
    expect(loaded?.positions.a).toEqual({ x: 1, y: 2 });
  });

  it("creates a node the client invented, with its prerequisite edge", async () => {
    const topic = await makeTopic();
    // `spawnGap` invents a gap node client-side; the same call that sets its
    // state has to be able to create it.
    await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, [
      { id: "b-gap", state: "gap", isGap: true, label: "Gap", prereqs: ["b"] },
    ]);
    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.graph.nodes.find((n) => n.id === "b-gap")?.gap).toBe(true);
    expect(loaded?.graph.edges).toContainEqual(["b", "b-gap", false]);
  });

  it("takes a resolved gap's edges out with it", async () => {
    const topic = await makeTopic();
    await deleteNodes(db(), topic.id, ["b"]);
    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.graph.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(loaded?.graph.edges).toEqual([]);
  });
});

describe("cards, stored by topic", () => {
  it("round-trips one card without touching the deck around it", async () => {
    const topic = await makeTopic();
    await putCards(db(), FIXTURE_USER_ID, topic.id, [card("c1", "a"), card("c2", "b")]);
    const graded = {
      ...card("c1", "a"),
      fsrs: { due: "2027-06-01T00:00:00.000Z" },
    } as StoredCard;
    await putCards(db(), FIXTURE_USER_ID, topic.id, [graded]);

    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.cards).toHaveLength(2);
    expect(loaded?.cards.find((c) => c.id === "c1")?.fsrs.due).toBe(
      "2027-06-01T00:00:00.000Z",
    );
    expect(loaded?.cards.find((c) => c.id === "c2")?.fsrs.due).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("rewrites a card in place rather than stacking a duplicate", async () => {
    // Connect mints a card per confirmed link under the link's own id; redoing
    // the phase must not reset the scheduler state by adding a second one.
    const topic = await makeTopic();
    await putCards(db(), FIXTURE_USER_ID, topic.id, [card("a-connect-b", "a")]);
    await putCards(db(), FIXTURE_USER_ID, topic.id, [card("a-connect-b", "a")]);
    const loaded = await loadTopic(db(), topic.id);
    expect(loaded?.cards).toHaveLength(1);
  });
});

describe("deleting a topic", () => {
  it("leaves nothing of it behind", async () => {
    const topic = await makeTopic();
    await putCards(db(), FIXTURE_USER_ID, topic.id, [card("c1", "a")]);
    await putContent(
      db(),
      FIXTURE_USER_ID,
      topic.id,
      { nodeId: "a", kind: "consume" },
      { cacheKey: "deadbeef" },
    );

    await deleteTopic(db(), topic.id);

    for (const table of ["topics", "nodes", "edges", "cards", "node_content"]) {
      const rows = (seededTables.get(table) ?? []).filter(
        (r) => r.topic_id === topic.id || r.id === topic.id,
      );
      expect({ table, rows }).toEqual({ table, rows: [] });
    }
  });

  it("does not take another topic with it", async () => {
    const first = await makeTopic();
    const second = await createTopic(db(), FIXTURE_USER_ID, {
      subject: "Kalman Filters",
      graph,
    });
    await deleteTopic(db(), first.id);
    const library = await loadLibrary(db());
    expect(library.map((t) => t.subject)).toEqual(["Kalman Filters"]);
    expect((await loadTopic(db(), second.id))?.graph.nodes).toHaveLength(2);
  });
});

describe("generated content", () => {
  it("stores the pointer and the payload, so a version bump cannot empty it", async () => {
    const topic = await makeTopic();
    await putContent(
      db(),
      FIXTURE_USER_ID,
      topic.id,
      { nodeId: "a", kind: "model", variant: "c1:eli5" },
      { cacheKey: "abc123", payload: { beats: [{ title: "one" }] } },
    );
    const [row] = await readContentRows(db(), topic.id, []);
    expect(row).toMatchObject({
      nodeId: "a",
      kind: "model",
      variant: "c1:eli5",
      cacheKey: "abc123",
      payload: { beats: [{ title: "one" }] },
    });
  });

  it("keeps the payload when a later write carries only the pointer", async () => {
    const topic = await makeTopic();
    const at = { nodeId: "a", kind: "consume" };
    await putContent(db(), FIXTURE_USER_ID, topic.id, at, {
      cacheKey: "one",
      payload: { chunks: [{ id: "c1" }] },
    });
    // A warm that found the row already in the shared cache knows the address
    // and nothing else. It must not blank what the topic already owns.
    await putContent(db(), FIXTURE_USER_ID, topic.id, at, { cacheKey: "two" });
    const [row] = await readContentRows(db(), topic.id, []);
    expect(row.cacheKey).toBe("two");
    expect(row.payload).toEqual({ chunks: [{ id: "c1" }] });
  });

  it("replaces the row for an address rather than accumulating them", async () => {
    const topic = await makeTopic();
    for (const key of ["one", "two"])
      await putContent(
        db(),
        FIXTURE_USER_ID,
        topic.id,
        { nodeId: "a", kind: "consume" },
        { cacheKey: key },
      );
    const rows = await readContentRows(db(), topic.id, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].cacheKey).toBe("two");
  });
});
