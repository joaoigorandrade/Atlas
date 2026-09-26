import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USER_ID, fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables } from "@/lib/server/fixtureTables";
import { resolveJob } from "@/lib/server/job";
import { frontierWarmBody } from "@/lib/server/afterBuild";
import { applyNodeDeltas, createTopic, withNodeCell } from "@/lib/server/store";
import type { ConceptGraph } from "@/lib/curriculum";

// The cell reaches every per-node prompt, so it is a cache-key axis — and the
// server stamps it from the stored row, the way it stamps a continent's
// neighbours, so neither client can key a pass differently from the other.

const db = () => fixtureSupabase() as unknown as SupabaseClient;
const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 0, week: 0, x: 0, y: 0 },
    {
      id: "b",
      label: "B",
      state: "unknown",
      g: 1,
      week: 0,
      x: 260,
      y: 0,
      importance: "peripheral",
      difficulty: "hard",
    },
  ],
  edges: [["a", "b", false]],
};
const consume = {
  kind: "consume" as const,
  topic: "Calculus",
  nodeLabel: "B",
  prereqLabels: ["A"],
  interests: "",
  language: "en" as const,
};

describe("withNodeCell", () => {
  beforeEach(resetTables);

  it("stamps the stored cell, and drops whatever a client sent", async () => {
    const topic = await createTopic(db(), FIXTURE_USER_ID, { subject: "Calculus" });
    await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, graph.nodes);
    const stamped = await withNodeCell(db(), {
      ...consume,
      topicId: topic.id,
      nodeId: "b",
      importance: "core",
      nodeDifficulty: "easy",
    });
    expect([stamped.importance, stamped.nodeDifficulty]).toEqual(["peripheral", "hard"]);
    // No node to look up: nothing forged survives.
    const loose = await withNodeCell(db(), { ...consume, importance: "working" });
    expect(loose).not.toHaveProperty("importance");
  });

  it("addresses the same row as the server-side frontier warm", async () => {
    const topic = await createTopic(db(), FIXTURE_USER_ID, { subject: "Calculus" });
    await applyNodeDeltas(db(), FIXTURE_USER_ID, topic.id, graph.nodes);
    const warm = frontierWarmBody(
      { kind: "curriculum", topic: "Calculus", interests: "", language: "en" },
      graph,
      graph.nodes[1],
      "consume",
    );
    const click = await withNodeCell(db(), { ...warm, topicId: topic.id });
    expect(resolveJob(click).key).toBe(resolveJob(warm).key);
    // …and a different row from the same concept at the default cell.
    expect(resolveJob(click).key).not.toBe(
      resolveJob({ ...warm, importance: undefined, nodeDifficulty: undefined }).key,
    );
  });
});

describe("axesRule", () => {
  it("names only the cells the learner's goal allows", async () => {
    const { axesRule } = await import("@/lib/server/generate/mapPrompt");
    const project = axesRule("project");
    expect(project).toMatch(/core\/easy, core\/medium, working\/easy, working\/medium\./);
    expect(project).not.toMatch(/core\/hard/);
    expect(axesRule("mastery")).toMatch(/peripheral\/hard/);
    expect(axesRule("mastery")).toMatch(/at least half the concepts are "core"/);
  });
});
