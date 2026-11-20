import { describe, expect, it } from "vitest";
import { conceptBoundary, type ConceptGraph, type ConceptNode } from "@/lib/curriculum";

const node = (id: string, over: Partial<ConceptNode> = {}): ConceptNode => ({
  id,
  label: id.toUpperCase(),
  state: "unknown",
  g: 1,
  week: 0,
  x: 0,
  y: 0,
  ...over,
});

/** a → b → c, plus an unrelated branch `d` and a learner-spawned gap. */
const graph: ConceptGraph = {
  nodes: [node("a"), node("b"), node("c"), node("d"), node("g1", { gap: true })],
  edges: [
    ["a", "b"],
    ["b", "c"],
    ["c", "g1", true],
  ],
};

describe("conceptBoundary", () => {
  it("counts every ancestor as prior, not just the direct prerequisite", () => {
    expect(conceptBoundary(graph, "c").priorLabels).toEqual(["A", "B"]);
  });

  it("fences off everything else on the map, including unrelated branches", () => {
    expect(conceptBoundary(graph, "b").laterLabels).toEqual(["C", "D"]);
  });

  it("excludes gap nodes from both lists, so the cache row stays shared", () => {
    const { priorLabels, laterLabels } = conceptBoundary(graph, "c");
    expect([...priorLabels, ...laterLabels]).not.toContain("G1");
  });

  it("leaves a foundation with no prior and the whole map later", () => {
    expect(conceptBoundary(graph, "a")).toEqual({
      priorLabels: [],
      laterLabels: ["B", "C", "D"],
    });
  });
});
