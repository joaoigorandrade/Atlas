import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USER_ID, fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables } from "@/lib/server/fixtureTables";
import {
  applyNodeDeltas,
  createContinent,
  createTopic,
  loadTopic,
  withTopicAxes,
} from "@/lib/server/store";
import {
  conceptBoundary,
  coreGraph,
  displayStates,
  isCore,
  levelsOf,
  mapFinished,
  mapProgress,
  neighboursOf,
  orderedFrontier,
  paceStatus,
  spawnDepth,
  type ConceptGraph,
  type ConceptNode,
  type StateMap,
} from "@/lib/curriculum";
import { deeperOf, pruneDeeper } from "@/lib/server/generate/mapConcept";

const node = (id: string, over: Partial<ConceptNode> = {}): ConceptNode => ({
  id,
  label: id.toUpperCase(),
  state: "unknown",
  g: 1,
  week: 0,
  x: 10,
  y: 20,
  ...over,
});

const DEEPER = [
  { label: "A2", summary: "Harder a." },
  { label: "A3", summary: "Hardest a." },
];

/** a → b, with `a` carrying two deeper levels. */
const graph: ConceptGraph = {
  nodes: [
    node("a", { kind: "principle", difficulty: "medium", deeper: DEEPER }),
    node("b"),
  ],
  edges: [["a", "b"]],
};
const mastered: StateMap = { a: "mastered", b: "unknown" };

describe("spawnDepth", () => {
  it("is gated on the level below being mastered", () => {
    expect(spawnDepth(graph, { a: "learning" }, "a")).toBeNull();
  });

  it("spawns level II as a hidden node on a solid edge, inheriting the base", () => {
    const res = spawnDepth(graph, mastered, "a")!;
    expect(res.node).toMatchObject({
      id: "a~2",
      label: "A2",
      summary: "Harder a.",
      kind: "principle",
      difficulty: "hard",
      depth: 2,
      state: "unknown",
      x: 10,
      y: 20,
    });
    expect(res.node.phasePlan?.length).toBeGreaterThan(0);
    expect(res.graph.edges).toContainEqual(["a", "a~2"]);
    // Solid: its parent is mastered, so the derivation lights it.
    expect(displayStates({ ...mastered, "a~2": "unknown" }, res.graph)["a~2"]).toBe(
      "frontier",
    );
  });

  it("is idempotent", () => {
    const once = spawnDepth(graph, mastered, "a")!;
    const twice = spawnDepth(once.graph, mastered, "a")!;
    expect(twice.graph).toBe(once.graph);
    expect(twice.node).toBe(once.node);
  });

  it("walks II → III and stops where the specs end", () => {
    const two = spawnDepth(graph, mastered, "a")!;
    expect(spawnDepth(two.graph, mastered, "a~2")).toBeNull(); // II not mastered
    const states = { ...mastered, "a~2": "mastered" } as StateMap;
    const three = spawnDepth(two.graph, states, "a~2")!;
    expect(three.node).toMatchObject({ id: "a~3", label: "A3", depth: 3 });
    expect(three.graph.edges).toContainEqual(["a~2", "a~3"]);
    expect(spawnDepth(three.graph, { ...states, "a~3": "mastered" }, "a~3")).toBeNull();
    expect(spawnDepth(graph, { b: "mastered" }, "b")).toBeNull(); // no specs
  });

  it("lists a base's levels for the pips and the switcher", () => {
    const two = spawnDepth(graph, mastered, "a")!;
    const levels = levelsOf(two.graph, two.graph.nodes[0]);
    expect(levels.map((l) => l?.id ?? null)).toEqual(["a", "a~2", null]);
    expect(levelsOf(two.graph, two.node)).toEqual([]);
  });
});

describe("a deeper level counts toward nothing", () => {
  const two = spawnDepth(graph, mastered, "a")!.graph;
  const states: StateMap = { a: "mastered", b: "unknown", "a~2": "mastered" };

  it("is not core", () => {
    expect(two.nodes.filter(isCore).map((n) => n.id)).toEqual(["a", "b"]);
    expect(coreGraph(two)).toEqual(graph);
  });

  it("moves neither progress nor the frontier", () => {
    expect(mapProgress(two, states)).toEqual(mapProgress(graph, states));
    expect(mapProgress(two, states).masteryPct).toBe(50);
    const open = { ...states, "a~2": "unknown" } as StateMap;
    expect(
      orderedFrontier(displayStates(open, two), two, "glance").map((e) => e.node.id),
    ).toEqual(["b"]);
  });

  it("is neither pace nor a finished map", () => {
    expect(paceStatus(states, two, 30, 10).remaining).toBe(1);
    expect(mapFinished(two, { ...states, b: "mastered", "a~2": "unknown" })).toBe(true);
  });

  it("is not what a mastered base unlocks", () => {
    expect(neighboursOf(two, two.nodes[0]).dependentIds).toEqual(["b"]);
  });
});

describe("conceptBoundary with levels", () => {
  const two = spawnDepth(graph, mastered, "a")!.graph;

  it("leaves a spawned level out of every other node's lists", () => {
    // `b`'s key is the same whether or not this learner went deeper.
    expect(conceptBoundary(two, "b")).toEqual(conceptBoundary(graph, "b"));
  });

  it("fences a base off from its own levels, read off the shared specs", () => {
    expect(conceptBoundary(graph, "a").laterLabels).toEqual(["B", "A2", "A3"]);
    expect(conceptBoundary(two, "a")).toEqual(conceptBoundary(graph, "a"));
  });

  it("gives a level its base chain as prior and the levels past it as later", () => {
    expect(conceptBoundary(two, "a~2")).toEqual({
      priorLabels: ["A"],
      laterLabels: ["B", "A3"],
    });
    const states = { ...mastered, "a~2": "mastered" } as StateMap;
    const three = spawnDepth(two, states, "a~2")!.graph;
    expect(conceptBoundary(three, "a~3")).toEqual({
      priorLabels: ["A", "A2"],
      laterLabels: ["B"],
    });
  });
});

describe("a legacy node", () => {
  it("reads as level I with no levels", () => {
    // A row persisted before levels existed: neither field, not even undefined.
    const legacy = JSON.parse(
      '{"id":"x","label":"X","state":"mastered","g":1,"week":0,"x":0,"y":0}',
    ) as ConceptNode;
    const g: ConceptGraph = { nodes: [legacy], edges: [] };
    expect(isCore(legacy)).toBe(true);
    expect(levelsOf(g, legacy)).toEqual([]);
    expect(spawnDepth(g, { x: "mastered" }, "x")).toBeNull();
    expect(coreGraph(g)).toBe(g);
  });
});

describe("the map's deeper field", () => {
  it("keeps at most two well-formed levels and drops a malformed one", () => {
    expect(
      deeperOf([
        { label: " L2 ", summary: "s2" },
        { label: "", summary: "x" },
        { label: "L3" },
        { label: "L3", summary: "s3" },
        { label: "L4", summary: "s4" },
      ]),
    ).toEqual({
      deeper: [
        { label: "L2", summary: "s2" },
        { label: "L3", summary: "s3" },
      ],
    });
    expect(deeperOf(undefined)).toEqual({});
    expect(deeperOf("nope")).toEqual({});
  });

  it("drops a level that restates a concept on the map", () => {
    const out = pruneDeeper([
      { label: "Limits", deeper: [{ label: "Derivatives", summary: "s" }] },
      { label: "Derivatives", deeper: [{ label: "Taylor series", summary: "t" }] },
    ]);
    expect(out[0]).toEqual({ label: "Limits" });
    expect(out[1].deeper).toEqual([{ label: "Taylor series", summary: "t" }]);
  });
});

describe("levels in the store", () => {
  beforeEach(resetTables);
  const db = () => fixtureSupabase() as unknown as SupabaseClient;
  const at = { state: "unknown" as const, g: 0, week: 0, x: 0, y: 0 };

  it("round-trip on their nodes, and a stray depth cannot fail the batch", async () => {
    const topic = await createTopic(db(), FIXTURE_USER_ID, { subject: "Calculus" });
    await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, [
      { id: "a", label: "A", ...at, deeper: [...DEEPER, ...DEEPER] },
      { id: "a~2", label: "A2", ...at, depth: 2, prereqs: ["a"] },
      { id: "b", label: "B", ...at, depth: 7 as never },
    ]);
    const loaded = (await loadTopic(db(), topic.id))!;
    const byId = (id: string) => loaded.graph.nodes.find((n) => n.id === id);
    expect(byId("a")?.deeper).toEqual(DEEPER); // capped at two
    expect(byId("a~2")?.depth).toBe(2);
    expect(byId("b")).not.toHaveProperty("depth");
    // Solid: the level is lit by its base, not hung off it like a gap.
    expect(loaded.graph.edges).toContainEqual(["a", "a~2", false]);
  });

  it("never reach a sibling map's prompt", async () => {
    const c = await createContinent(db(), FIXTURE_USER_ID, {
      name: "Maths",
      scopes: [],
      topicIds: [],
    });
    const calc = await createTopic(db(), FIXTURE_USER_ID, {
      subject: "Calculus",
      continentId: c.id,
    });
    const prob = await createTopic(db(), FIXTURE_USER_ID, {
      subject: "Probability",
      continentId: c.id,
    });
    await applyNodeDeltas(db(), FIXTURE_USER_ID, prob.id, [
      { id: "a", label: "A", ...at },
      { id: "a~2", label: "A2", ...at, depth: 2, prereqs: ["a"] },
    ]);
    const stamped = await withTopicAxes(db(), {
      kind: "consume" as const,
      neighbours: [] as string[],
      topic: "Calculus",
      nodeId: "x",
      nodeLabel: "X",
      prereqLabels: [],
      interests: "",
      language: "en",
      topicId: calc.id,
    });
    expect(stamped.neighbours).toEqual(["Probability: A"]);
  });
});
