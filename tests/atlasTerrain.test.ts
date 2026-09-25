import { describe, expect, it } from "vitest";
import {
  heightfield,
  paintAtlas,
  regionsOf,
  seedOf,
  type AtlasInput,
} from "@/components/map/atlasTerrain";
import type { ConceptNode } from "@/lib/curriculum";

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
    seed: seedOf(["a", "b"]),
  };

  it("is deterministic and raises land under every worked-on concept", () => {
    const one = heightfield(input, -200, -200, 175, 100, 0.25);
    expect(heightfield(input, -200, -200, 175, 100, 0.25)).toEqual(one);
    expect(one[50 * 175 + 50]).toBeGreaterThan(0.5); // a at (0,0)
    expect(one[50 * 175 + 125]).toBeGreaterThan(0.5); // b at (300,0)
    expect(one[0]).toBeLessThan(0.5);
  });

  it("sets each region's name inland, away from its concepts", () => {
    const img = {
      width: 175,
      height: 100,
      data: new Uint8ClampedArray(175 * 100 * 4),
    } as ImageData;
    const pal = {
      water: [0, 0, 0],
      shallows: [0, 0, 0],
      land: [0, 0, 0],
      high: [0, 0, 0],
      ink: [0, 0, 0],
      regions: [[0, 0, 0]],
    } as const;
    const spots = paintAtlas(img, input, -200, -200, 0.25, pal);
    expect(Object.keys(spots)).toEqual(["a"]);
    expect(spots.a.x).toBeGreaterThan(0); // between a and b, not on either
    expect(spots.a.x).toBeLessThan(300);
  });

  it("splits a two-root graph into two regions named for their roots", () => {
    const nodes = [
      node("r1", 0),
      node("a", 1),
      node("b", 2),
      node("r2", 0),
      node("c", 1),
      node("d", 2),
    ];
    const { of, name } = regionsOf(nodes, [
      ["r1", "a"],
      ["a", "b"],
      ["r2", "c"],
      ["c", "d"],
    ]);
    expect(of.b).toBe("r1");
    expect(of.d).toBe("r2");
    expect(name).toEqual({ r1: "R1", r2: "R2" });
  });
});
