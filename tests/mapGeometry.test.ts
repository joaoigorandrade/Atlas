import { describe, expect, it } from "vitest";
import {
  edgePath,
  fitView,
  mapBounds,
  phaseArcs,
  roman,
  stageBands,
  zoomAt,
} from "@/components/map/mapGeometry";

// The map's geometry: what the canvas, its instruments and every seal draw
// from. Pure, so it is pinned here rather than through a browser.

describe("mapGeometry", () => {
  it("runs a road from one concept to the next", () => {
    const d = edgePath({ x: 10, y: 20 }, { x: 300, y: 80 });
    expect(d.startsWith("M10,20 ")).toBe(true);
    expect(d.endsWith(" 300,80")).toBe(true);
  });

  it("frames the whole map inside the part the rails leave visible", () => {
    const bounds = mapBounds({ a: { x: 100, y: 100 }, b: { x: 1100, y: 500 } })!;
    const box = { w: 1440, h: 900 };
    const insets = { left: 262, right: 356, top: 58, bottom: 0 };
    const v = fitView(bounds, box, insets);
    const left = v.x + bounds.minX * v.scale;
    const right = v.x + bounds.maxX * v.scale;
    const top = v.y + bounds.minY * v.scale;
    const bottom = v.y + bounds.maxY * v.scale;
    expect(left).toBeGreaterThanOrEqual(insets.left);
    expect(right).toBeLessThanOrEqual(box.w - insets.right);
    expect(top).toBeGreaterThanOrEqual(insets.top);
    expect(bottom).toBeLessThanOrEqual(box.h);
    // Centred in the free band, not the window.
    expect(Math.round((left + right) / 2)).toBe(262 + (1440 - 262 - 356) / 2);
  });

  it("never frames a tiny map at full stretch", () => {
    const v = fitView(
      mapBounds({ a: { x: 0, y: 0 } })!,
      { w: 1440, h: 900 },
      {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
    );
    expect(v.scale).toBeLessThanOrEqual(1.1);
  });

  it("zooms about a point and clamps the scale", () => {
    const v = zoomAt({ x: 0, y: 0, scale: 1 }, 2, 100, 100);
    // The point under the cursor stays put.
    expect((100 - v.x) / v.scale).toBeCloseTo(100);
    expect(zoomAt({ x: 0, y: 0, scale: 1.6 }, 4, 0, 0).scale).toBe(1.7);
  });

  it("cuts one ring segment per phase, marked by the ledger", () => {
    const arcs = phaseArcs(["consume", "socratic", "feynman"], ["consume"], 15, 13);
    expect(arcs).toHaveLength(3);
    expect(arcs.map((a) => a.done)).toEqual([true, false, false]);
    expect(phaseArcs([], [], 15, 13)).toEqual([]);
  });

  it("places a stage meridian at the mean x of its concepts", () => {
    const stages = stageBands(
      [
        { id: "a", g: 1 },
        { id: "b", g: 0 },
        { id: "c", g: 1 },
      ],
      { a: { x: 300, y: 0 }, b: { x: 50, y: 0 }, c: { x: 400, y: 0 } },
    );
    expect(stages).toEqual([
      { g: 0, x: 50, label: "I" },
      { g: 1, x: 350, label: "II" },
    ]);
    expect(roman(14)).toBe("XIV");
  });
});
