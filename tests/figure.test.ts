import { describe, expect, it } from "vitest";
import { figureLayers } from "@/lib/curriculum";
import { validateFigure } from "@/lib/server/generate";

const fig = (nodes: string[], edges: string[][]) => ({
  nodes: nodes.map((id) => ({ id, label: id })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

describe("validateFigure", () => {
  it("accepts a well-formed figure", () => {
    const out = validateFigure(fig(["a", "b"], [["a", "b"]]), "figure");
    expect(out.nodes.length).toBe(2);
    expect(out.edges[0]).toEqual({ from: "a", to: "b", label: undefined });
  });

  it("rejects an edge pointing at a node that does not exist", () => {
    expect(() => validateFigure(fig(["a", "b"], [["a", "zz"]]), "figure")).toThrow(
      /not in nodes/,
    );
  });

  it("rejects duplicate node ids", () => {
    expect(() => validateFigure(fig(["a", "a"], [["a", "a"]]), "figure")).toThrow(
      /duplicate/,
    );
  });
});

describe("figureLayers", () => {
  it("layers a chain by longest path", () => {
    const l = figureLayers(fig(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]]));
    expect([l.get("a"), l.get("b"), l.get("c")]).toEqual([0, 1, 2]);
  });

  it("terminates on a cycle instead of looping forever", () => {
    const l = figureLayers(fig(["a", "b"], [["a", "b"], ["b", "a"]]));
    expect(l.size).toBe(2);
  });
});
