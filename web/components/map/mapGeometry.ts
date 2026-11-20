// The map's geometry as pure functions — the road between two concepts, the
// box the map occupies, the view that frames it, the stage meridians, the arcs
// of a node's phase ring. The canvas, its controls and the seal all draw from
// here, and `tests/mapGeometry.test.ts` pins it without a DOM.

import type { PhaseId } from "@/lib/curriculum";

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How far the canvas zooms in either direction — wheel, buttons and fit. */
export const ZOOM = { min: 0.4, max: 1.7 } as const;

const clampScale = (s: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, s));

/**
 * A road from prerequisite to dependent. The layout runs left to right by
 * depth, so the curve leaves and arrives horizontally — an S between columns,
 * and a gentle arc for a node dragged behind its prerequisite.
 */
export function edgePath(a: Pt, b: Pt): string {
  const dir = b.x >= a.x ? 1 : -1;
  const dx = Math.max(36, Math.abs(b.x - a.x) * 0.5) * dir;
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

/** The box every placed node sits in, or null for an empty map. */
export function mapBounds(positions: Record<string, Pt>, ids?: string[]): Bounds | null {
  const pts = (ids ?? Object.keys(positions)).map((id) => positions[id]).filter(Boolean);
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/**
 * The view that puts `bounds` in the middle of the part of the canvas the
 * learner can actually see — `insets` are the rails and bars laid over it.
 * Never zooms past 1.1: a two-node map framed at full stretch reads as a
 * mistake, not as a map.
 */
export function fitView(
  bounds: Bounds,
  box: { w: number; h: number },
  insets: { left: number; right: number; top: number; bottom: number },
  pad = 110,
): ViewTransform {
  const freeW = Math.max(box.w - insets.left - insets.right, 120);
  const freeH = Math.max(box.h - insets.top - insets.bottom, 120);
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;
  const scale = clampScale(Math.min(freeW / w, freeH / h, 1.1));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: insets.left + freeW / 2 - cx * scale,
    y: insets.top + freeH / 2 - cy * scale,
    scale,
  };
}

/** Zoom by `factor`, keeping the canvas point under (`px`, `py`) where it is. */
export function zoomAt(view: ViewTransform, factor: number, px: number, py: number) {
  const scale = clampScale(view.scale * factor);
  return {
    x: px - (px - view.x) * (scale / view.scale),
    y: py - (py - view.y) * (scale / view.scale),
    scale,
  };
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/**
 * One meridian per depth stage (`node.g`), at the mean x of the nodes in it —
 * so it follows the learner's drags instead of pinning the layout's columns.
 */
export function stageBands(
  nodes: { id: string; g: number }[],
  positions: Record<string, Pt>,
): { g: number; x: number; label: string }[] {
  const byG = new Map<number, number[]>();
  for (const n of nodes) {
    const p = positions[n.id];
    if (p) byG.set(n.g, [...(byG.get(n.g) ?? []), p.x]);
  }
  return [...byG.entries()]
    .sort(([a], [b]) => a - b)
    .map(([g, xs], i) => ({
      g,
      x: xs.reduce((s, x) => s + x, 0) / xs.length,
      // Numbered by rank, not by `g`: depth starts at 0 on some maps and 1 on
      // others, and a stage called "" is worse than one called by its place.
      label: roman(i + 1),
    }));
}

/** An SVG arc on a circle of radius `r` centred on (`c`, `c`), angles in degrees
 *  clockwise from twelve o'clock. */
function arc(c: number, r: number, from: number, to: number): string {
  const at = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(rad)).toFixed(2)},${(c + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M${at(from)} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;
}

/**
 * A node's phase ring: one segment per phase of its plan, in plan order from
 * twelve o'clock, each marked done or not. The gap between segments is what
 * makes it read as rungs rather than as a progress bar.
 */
export function phaseArcs(
  plan: readonly PhaseId[],
  done: readonly PhaseId[] = [],
  c: number,
  r: number,
): { d: string; done: boolean }[] {
  const n = plan.length;
  if (!n) return [];
  const span = 360 / n;
  const gap = n > 1 ? Math.min(14, span * 0.28) : 0;
  return plan.map((phase, i) => ({
    d: arc(c, r, i * span + gap / 2, (i + 1) * span - gap / 2 - (n === 1 ? 0.01 : 0)),
    done: done.includes(phase),
  }));
}
