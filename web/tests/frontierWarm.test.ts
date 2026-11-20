// The post-build warm has to address the row the learner's own click will ask
// for. Nothing about a mismatch is visible at runtime: both requests succeed,
// both return content, and the only trace is that the frontier was generated
// twice — once behind the build, once at the tap.
//
// So the assertion is a hash comparison. `frontierWarmBody` and the body a
// client sends must resolve to the same `content_cache` key, per kind, or the
// warm is spend with nothing behind it.

import { describe, expect, it } from "vitest";
import { conceptBoundary, type ConceptGraph } from "@/lib/curriculum";
import { frontierWarmBody } from "@/lib/server/afterBuild";
import { resolveJob, type GenerateBody } from "@/lib/server/job";

/** Three concepts in a chain, so every node has a non-empty boundary: `b` has
 *  `a` behind it and `c` ahead, and `a` — the frontier — has all of `b, c`
 *  ahead of it. A single-concept map would pass this test by accident. */
const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "Limites", g: 0, x: 0, y: 0 },
    { id: "b", label: "Continuidade", g: 1, x: 0, y: 0 },
    { id: "c", label: "Derivada", g: 2, x: 0, y: 0 },
  ],
  edges: [
    ["a", "b", false],
    ["b", "c", false],
  ],
} as unknown as ConceptGraph;

const built: GenerateBody = {
  kind: "curriculum",
  topic: "Cálculo I",
  interests: "música",
  language: "pt-BR",
  topicId: "t1",
};

/** What the clients send for one node — `consumeParams` on the web,
 *  `context(for:)` on iOS. Both derive it exactly this way. */
const fromClient = (kind: "consume" | "socratic", nodeId: string): GenerateBody => {
  const node = graph.nodes.find((n) => n.id === nodeId)!;
  const prereqLabels = graph.edges
    .filter(([, to, dashed]) => to === nodeId && !dashed)
    .map(([from]) => graph.nodes.find((n) => n.id === from)!.label);
  return {
    kind,
    topic: built.topic,
    nodeId,
    nodeLabel: node.label,
    interests: built.interests,
    language: built.language,
    ...conceptBoundary(graph, nodeId),
    ...(kind === "consume" ? { prereqLabels } : null),
  };
};

const keyOf = (body: GenerateBody): string | null => resolveJob(body).key;

describe("the post-build frontier warm", () => {
  it("addresses the row the learner's own click asks for", () => {
    for (const kind of ["consume", "socratic"] as const) {
      for (const nodeId of ["a", "b", "c"]) {
        const node = graph.nodes.find((n) => n.id === nodeId)!;
        expect(keyOf(frontierWarmBody(built, graph, node, kind))).toBe(
          keyOf(fromClient(kind, nodeId)),
        );
      }
    }
  });

  it("carries the boundary, which is what the miss was", () => {
    // Pinned as its own case because it is the specific field that was
    // missing, and because dropping it again would still pass every other
    // test in the suite.
    const node = graph.nodes.find((n) => n.id === "a")!;
    const warm = frontierWarmBody(built, graph, node, "consume");
    expect(warm.laterLabels).toEqual(["Continuidade", "Derivada"]);
    expect(keyOf(warm)).not.toBe(
      keyOf({ ...warm, priorLabels: undefined, laterLabels: undefined }),
    );
  });
});
