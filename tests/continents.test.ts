// Continents: maps that belong together.
//
// Three properties carry the feature, and each is silent when broken:
// - a map outside a continent keys to exactly the row it always did, so the
//   shared cache was not orphaned by adding the axis;
// - the neighbours are the server's to say — a client cannot choose them;
// - the store reads, groups and dissolves continents without touching a map.

import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveJob } from "@/lib/server/job";
import { boundaryNote } from "@/lib/server/generate/common";
import { mapContext } from "@/lib/server/generate/mapPrompt";
import { FIXTURE_USER_ID, fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables } from "@/lib/server/fixtureTables";
import {
  applyNodeDeltas,
  createContinent,
  createTopic,
  deleteContinent,
  loadLibrary,
  neighbourLines,
  patchTopic,
  withNeighbours,
} from "@/lib/server/store";
import { continentAtlas, ownerOf } from "@/components/map/continentLayout";
import { mapBounds } from "@/components/map/mapGeometry";
import type { ConceptGraph } from "@/lib/curriculum";

const consume = {
  kind: "consume" as const,
  topic: "Calculus",
  nodeId: "limits",
  nodeLabel: "Limits",
  prereqLabels: [],
  interests: "",
  language: "en" as const,
};
const curriculum = {
  kind: "curriculum" as const,
  topic: "Calculus",
  goal: "mastery" as const,
};

describe("the neighbours axis in the cache key", () => {
  it("is absent outside a continent, so every existing row keeps its address", () => {
    expect(resolveJob({ ...consume, neighbours: [] }).key).toBe(resolveJob(consume).key);
    expect(resolveJob({ ...curriculum, neighbours: [] }).key).toBe(
      resolveJob(curriculum).key,
    );
  });

  it("moves the key inside one — content written against neighbours is different content", () => {
    const neighbours = ["Linear Algebra: Vectors, Matrices"];
    expect(resolveJob({ ...consume, neighbours }).key).not.toBe(resolveJob(consume).key);
    expect(resolveJob({ ...curriculum, neighbours }).key).not.toBe(
      resolveJob(curriculum).key,
    );
  });
});

describe("the prompts", () => {
  it("fence the neighbours only when there are some", () => {
    expect(boundaryNote({})).toBe("");
    expect(boundaryNote({ laterLabels: ["B"] })).not.toContain("NEIGHBOURING");
    const note = boundaryNote({ neighbours: ["Probability: Sample spaces"] });
    expect(note).toContain("NEIGHBOURING");
    expect(note).toContain("Probability: Sample spaces");
  });

  it("tell a map build what its neighbours already carry", () => {
    const base = { topic: "Calculus", goal: "mastery" as const };
    expect(mapContext(base)).not.toContain("continent");
    expect(mapContext({ ...base, neighbours: ["Probability: Sample spaces"] })).toContain(
      "Probability: Sample spaces",
    );
  });
});

describe("neighbourLines", () => {
  it("lists charted siblings by concept and uncharted scopes by note, sorted", () => {
    const lines = neighbourLines(
      "Calculus",
      [
        { id: "t2", subject: "Probability" },
        { id: "t3", subject: "Linear Algebra" },
      ],
      [
        { topic_id: "t2", label: "Sample spaces" },
        { topic_id: "t2", label: "Bayes" },
      ],
      [
        { label: "Calculus", note: "limits to integrals" },
        { label: "Linear algebra", note: "vectors and maps" },
        { label: "Statistics", note: "inference from data" },
      ],
    );
    expect(lines).toEqual([
      // No concepts yet: the scope it was charted from says what it will hold.
      "Linear Algebra: vectors and maps",
      "Probability: Sample spaces, Bayes",
      "Statistics (not charted yet): inference from data",
    ]);
  });
});

const db = () => fixtureSupabase() as unknown as SupabaseClient;
const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 0, week: 0, x: 0, y: 0 },
    { id: "b", label: "B", state: "unknown", g: 1, week: 0, x: 260, y: 0 },
  ],
  edges: [["a", "b", false]],
};
const makeTopic = async (subject: string, continentId?: string) => {
  const topic = await createTopic(db(), FIXTURE_USER_ID, { subject, continentId });
  await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, graph.nodes);
  return topic;
};

describe("continents in the store", () => {
  beforeEach(resetTables);

  it("travel inside each member topic, and a dissolve lets the maps go", async () => {
    const calc = await makeTopic("Calculus");
    const prob = await makeTopic("Probability");
    const loose = await makeTopic("Cooking");
    const c = await createContinent(db(), FIXTURE_USER_ID, {
      name: "Maths",
      scopes: [],
      topicIds: [calc.id, prob.id],
    });
    const library = await loadLibrary(db());
    const of = (id: string) => library.find((t) => t.id === id)?.continent;
    expect(of(calc.id)).toMatchObject({ id: c.id, name: "Maths" });
    expect(of(prob.id)?.id).toBe(c.id);
    expect(of(loose.id)).toBeNull();

    await deleteContinent(db(), c.id);
    const after = await loadLibrary(db());
    expect(after).toHaveLength(3);
    expect(after.every((t) => t.continent === null)).toBe(true);
  });

  it("stamps a request with its siblings, and overrides what a client sent", async () => {
    const c = await createContinent(db(), FIXTURE_USER_ID, {
      name: "Maths",
      scopes: [{ label: "Statistics", note: "inference" }],
      topicIds: [],
    });
    const calc = await makeTopic("Calculus", c.id);
    await makeTopic("Probability", c.id);
    const stamped = await withNeighbours(db(), {
      ...consume,
      topicId: calc.id,
      neighbours: ["forged"],
    });
    expect(stamped.neighbours).toEqual([
      "Probability: A, B",
      "Statistics (not charted yet): inference",
    ]);

    // Leaving the continent takes the axis away entirely.
    await patchTopic(db(), calc.id, { continentId: null });
    const alone = await withNeighbours(db(), { ...consume, topicId: calc.id });
    expect(alone).not.toHaveProperty("neighbours");
    // And no topic at all means nothing to look up — and nothing forged kept.
    expect(
      await withNeighbours(db(), { ...consume, neighbours: ["x"] }),
    ).not.toHaveProperty("neighbours");
  });
});

describe("continentAtlas", () => {
  const member = (id: string, subject: string) => ({
    id,
    subject,
    graph,
    states: {},
    positions: { a: { x: 0, y: 0 }, b: { x: 260, y: 120 } },
  });

  it("draws each map as its own country, uncharted scopes as one point each", () => {
    const input = continentAtlas(
      [member("t1", "Calculus"), member("t2", "Probability")],
      [{ label: "Statistics", note: "" }],
    );
    expect(input.ids).toEqual(["t1:a", "t1:b", "t2:a", "t2:b", "scope:Statistics"]);
    expect(new Set(Object.values(input.region))).toEqual(
      new Set(["t1", "t2", "scope:Statistics"]),
    );
    expect(input.names).toMatchObject({ t1: "Calculus", t2: "Probability" });
    expect(input.display["scope:Statistics"]).toBe("unknown");
    expect(input.edges).toContainEqual(["t2:a", "t2:b", false]);
    expect(ownerOf("t2:b")).toEqual({ topicId: "t2" });
    expect(ownerOf("scope:Statistics")).toEqual({ scope: "Statistics" });

    // Two countries never overlap.
    const one = mapBounds(input.positions, ["t1:a", "t1:b"])!;
    const two = mapBounds(input.positions, ["t2:a", "t2:b"])!;
    const apart =
      one.maxX < two.minX ||
      two.maxX < one.minX ||
      one.maxY < two.minY ||
      two.maxY < one.minY;
    expect(apart).toBe(true);
  });

  it("stacks long maps rather than laying them end to end into a strip", () => {
    // A real curriculum runs left to right: twenty stages wide, two rows deep.
    const long = (id: string) => ({
      ...member(id, id),
      positions: { a: { x: 0, y: 0 }, b: { x: 5000, y: 150 } },
    });
    const input = continentAtlas([long("t1"), long("t2")], [], 1);
    const one = mapBounds(input.positions, ["t1:a", "t1:b"])!;
    const two = mapBounds(input.positions, ["t2:a", "t2:b"])!;
    expect(two.minY).toBeGreaterThan(one.maxY);
  });
});
