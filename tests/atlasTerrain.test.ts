import { describe, expect, it } from "vitest";
import {
  heightfield,
  paintAtlas,
  regionsOf,
  seedOf,
  type AtlasInput,
} from "@/components/map/atlasTerrain";
import { map } from "@/lib/theme";
import type { ConceptEdge, ConceptNode } from "@/lib/curriculum";

const node = (id: string, g: number): ConceptNode =>
  ({
    id,
    label: id.toUpperCase(),
    state: "unknown",
    g,
    week: 0,
    x: 0,
    y: 0,
  }) as ConceptNode;

describe("atlas terrain", () => {
  const input: AtlasInput = {
    ids: ["a", "b"],
    edges: [["a", "b"]],
    positions: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } },
    display: { a: "mastered", b: "learning" },
    region: { a: "a", b: "a" },
    names: { a: "Alpha" },
    seed: seedOf(["a", "b"]),
  };

  it("is deterministic and raises land under every concept, reached or not", () => {
    const one = heightfield(input, -200, -200, 175, 100, 0.25);
    expect(heightfield(input, -200, -200, 175, 100, 0.25)).toEqual(one);
    expect(one[50 * 175 + 50]).toBeGreaterThan(0.5); // a at (0,0)
    expect(one[50 * 175 + 125]).toBeGreaterThan(0.5); // b at (300,0)
    expect(one[0]).toBeLessThan(0.5);
    const unreached = { ...input, display: {} };
    expect(heightfield(unreached, -200, -200, 175, 100, 0.25)).toEqual(one);
  });

  it("sets each region's name inland and resolves each point to its territory", () => {
    const img = {
      width: 175,
      height: 100,
      data: new Uint8ClampedArray(175 * 100 * 4),
    } as ImageData;
    const { spots, prov, lit } = paintAtlas(img, input, -200, -200, 0.25, map.atlas);
    expect(lit[prov[50 * 175 + 50]]).toBe("a"); // a's city at (0,0)
    expect(lit[prov[50 * 175 + 125]]).toBe("b");
    expect(prov[0]).toBe(-1); // the corner is sea
    expect(Object.keys(spots)).toEqual(["a"]);
    expect(spots.a.x).toBeGreaterThan(0); // between a and b, not on either
    expect(spots.a.x).toBeLessThan(300);
  });

  it("carves countries from runs of stages, named for their capitals", () => {
    const ids = ["a0", "a1", "a2", "b0", "b1", "b2", "c0", "c1", "c2", "d0", "d1", "d2"];
    const nodes = ids.map((id, i) => node(id, Math.floor(i / 3)));
    // b1 and d1 carry the most roads, so they are the capitals.
    const edges: ConceptEdge[] = [
      ["a0", "b1"],
      ["a1", "b1"],
      ["b1", "b0"],
      ["b1", "b2"],
      ["c0", "d1"],
      ["c1", "d1"],
      ["d1", "d0"],
      ["d1", "d2"],
    ];
    const { of, name } = regionsOf(nodes, edges);
    expect(new Set(ids.slice(0, 6).map((id) => of[id]))).toEqual(new Set(["b1"]));
    expect(new Set(ids.slice(6).map((id) => of[id]))).toEqual(new Set(["d1"]));
    expect(name).toEqual({ b1: "B1", d1: "D1" });
  });
});
