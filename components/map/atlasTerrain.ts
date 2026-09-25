// The generated atlas under the concepts: a heightfield raised by what the
// learner has worked on, roughened by seeded noise, and drawn as a coast,
// contour lines, hillshade and the borders between regions of the graph.
// Pure — the canvas it paints into is passed in.

import type { ConceptEdge, ConceptNode, NodeState } from "@/lib/curriculum";
import type { Pt } from "@/components/map/mapGeometry";

/** How high each state raises the ground. Unreached concepts leave shallows. */
const LIFT: Partial<Record<NodeState, number>> = {
  frontier: 0.3,
  unknown: 0.22,
  learning: 0.75,
  shaky: 0.85,
  mastered: 1.15,
};
const SIGMA = 78;
const SEA = 0.5;
const BANDS = 5;

export const seedOf = (ids: string[]) => {
  let h = 2166136261;
  for (const c of ids.join("|")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

const hash2 = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Four octaves of value noise, roughly in [-0.5, 0.5]. */
export function fbm(x: number, y: number, s: number) {
  let sum = 0;
  let amp = 0.5;
  for (let o = 0; o < 4; o++, amp /= 2, x *= 2.03, y *= 2.03) {
    sum += amp * (valueNoise(x, y, s + o) - 0.5);
  }
  return sum * 1.9;
}

/**
 * Which region each concept belongs to. A map spanning several domains is
 * split by domain; otherwise every root starts a region and each concept joins
 * the region of its first prerequisite. Regions under three concepts fold into
 * that prerequisite's region, so the map isn't confetti.
 */
export function regionsOf(nodes: ConceptNode[], edges: ConceptEdge[]) {
  const of: Record<string, string> = {};
  const name: Record<string, string> = {};
  const domains = new Set(nodes.map((n) => n.domain ?? "general"));
  if (domains.size > 1) {
    for (const n of nodes) of[n.id] = n.domain ?? "general";
    for (const d of domains) name[d] = d;
    return { of, name };
  }
  const parent: Record<string, string> = {};
  for (const [a, b] of edges) parent[b] ??= a;
  const byG = [...nodes].sort((a, b) => a.g - b.g);
  for (const n of byG) {
    const p = parent[n.id];
    of[n.id] = p && of[p] ? of[p] : n.id;
  }
  const size: Record<string, number> = {};
  for (const n of nodes) size[of[n.id]] = (size[of[n.id]] ?? 0) + 1;
  // ponytail: a small root region folds into the largest one — good enough for
  // a few stray roots; nearest-neighbour folding if maps grow many of them.
  const big = Object.keys(size).sort((a, b) => size[b] - size[a])[0];
  for (const n of nodes) if (size[of[n.id]] < 3) of[n.id] = big;
  for (const n of nodes) if (of[n.id] === n.id) name[n.id] = n.label;
  return { of, name };
}

export interface AtlasInput {
  ids: string[];
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  region: Record<string, string>;
  seed: number;
}

/** The heightfield on a `w`×`h` grid whose cell (0,0) sits at map point (x0,y0). */
export function heightfield(
  input: AtlasInput,
  x0: number,
  y0: number,
  w: number,
  h: number,
  res: number,
) {
  const { ids, edges, positions, display, seed } = input;
  const out = new Float32Array(w * h);
  // Separable: exp(-(dx²+dy²)) = exp(-dx²)·exp(-dy²), so one row and one
  // column of exponentials per bump instead of one per pixel.
  const bump = (p: Pt, lift: number, sigma: number) => {
    const cx = (p.x - x0) * res;
    const cy = (p.y - y0) * res;
    const s2 = 2 * (sigma * res) ** 2;
    const r = Math.ceil(sigma * res * 3);
    const i0 = Math.max(0, Math.floor(cx - r));
    const i1 = Math.min(w, Math.ceil(cx + r));
    const row = new Float32Array(Math.max(0, i1 - i0));
    for (let i = i0; i < i1; i++) row[i - i0] = lift * Math.exp(-((i - cx) ** 2) / s2);
    for (let j = Math.max(0, Math.floor(cy - r)); j < Math.min(h, cy + r); j++) {
      const col = Math.exp(-((j - cy) ** 2) / s2);
      const o = j * w + i0;
      for (let i = 0; i < row.length; i++) out[o + i] += row[i] * col;
    }
  };
  for (const id of ids) {
    const p = positions[id];
    const lift = LIFT[display[id]];
    if (p && lift) bump(p, lift, SIGMA);
  }
  // Roads between two worked-on concepts become ridges joining their land.
  for (const [a, b, dashed] of edges) {
    const pa = positions[a];
    const pb = positions[b];
    const la = LIFT[display[a]] ?? 0;
    const lb = LIFT[display[b]] ?? 0;
    if (!pa || !pb || dashed || Math.min(la, lb) < 0.5) continue;
    const steps = Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y) / 60);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      bump(
        { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t },
        Math.min(la, lb) * 0.45,
        SIGMA * 0.7,
      );
    }
  }
  // Noise is sampled once per 2×2 block — finer than the fine octave needs.
  for (let j = 0; j < h; j += 2) {
    for (let i = 0; i < w; i += 2) {
      if (
        Math.max(
          out[j * w + i],
          out[Math.min(h - 1, j + 1) * w + Math.min(w - 1, i + 1)],
        ) < 0.08
      )
        continue; // open sea stays flat — no noise, no cost
      const x = x0 + i / res;
      const y = y0 + j / res;
      // Broad noise shapes the land; fine noise frays the coast into coves.
      const n = fbm(x / 340, y / 340, seed) * 0.8 + fbm(x / 70, y / 70, seed + 9) * 0.3;
      for (let jj = j; jj < Math.min(h, j + 2); jj++)
        for (let ii = i; ii < Math.min(w, i + 2); ii++) {
          const k = jj * w + ii;
          out[k] += n * Math.min(1, out[k] * 2);
        }
    }
  }
  return out;
}

type RGB = readonly [number, number, number];
export interface AtlasPalette {
  water: RGB;
  shallows: RGB;
  land: RGB;
  high: RGB;
  ink: RGB;
  regions: readonly RGB[];
}

/**
 * Paints the atlas into `img`, whose pixel (0,0) is map point (x0,y0), and
 * returns where each region's name fits: the inland point of that region
 * farthest from any concept, so the name sits in open country, not on a seal.
 */
export function paintAtlas(
  img: ImageData,
  input: AtlasInput,
  x0: number,
  y0: number,
  res: number,
  pal: AtlasPalette,
) {
  const { width: w, height: h, data } = img;
  const hf = heightfield(input, x0, y0, w, h, res);
  const lit = input.ids.filter((id) => input.positions[id]);
  const keys = [...new Set(lit.map((id) => input.region[id]))];
  const px = lit.map((id) => (input.positions[id].x - x0) * res);
  const py = lit.map((id) => (input.positions[id].y - y0) * res);
  const pr = lit.map((id) => keys.indexOf(input.region[id]));
  // Nearest concept's region, solved on a 4px lattice and filled per block —
  // a border a few pixels off is invisible at map zoom.
  // ponytail: O(pixels/16 × concepts); a bucket grid if maps pass ~300 concepts.
  const reg = new Int16Array(w * h).fill(-1);
  const spots: Record<string, Pt & { d: number }> = {};
  for (let bj = 0; bj < h; bj += 4) {
    for (let bi = 0; bi < w; bi += 4) {
      let best = Infinity;
      let r = -1;
      for (let n = 0; n < lit.length; n++) {
        const d = (px[n] - bi) ** 2 + (py[n] - bj) ** 2;
        if (d < best) [best, r] = [d, pr[n]];
      }
      for (let j = bj; j < Math.min(h, bj + 4); j++)
        for (let i = bi; i < Math.min(w, bi + 4); i++)
          if (hf[j * w + i] >= SEA) reg[j * w + i] = r;
      const key = keys[r];
      if (
        key !== undefined &&
        hf[bj * w + bi] > SEA + 0.25 &&
        best > (spots[key]?.d ?? 0)
      )
        spots[key] = { x: x0 + bi / res, y: y0 + bj / res, d: best };
    }
  }
  const mix = (a: RGB, b: RGB, t: number, o: number, alpha: number) => {
    data[o] = a[0] + (b[0] - a[0]) * t;
    data[o + 1] = a[1] + (b[1] - a[1]) * t;
    data[o + 2] = a[2] + (b[2] - a[2]) * t;
    data[o + 3] = alpha;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const o = k * 4;
      const v = hf[k];
      const right = i + 1 < w ? hf[k + 1] : v;
      const down = j + 1 < h ? hf[k + w] : v;
      if (v < SEA) {
        // Water only near land; the open page stays paper.
        if (v > 0.18)
          mix(
            pal.water,
            pal.shallows,
            (v - 0.18) / (SEA - 0.18),
            o,
            120 * Math.min(1, (v - 0.18) * 8),
          );
        if (right >= SEA || down >= SEA) mix(pal.ink, pal.ink, 0, o, 170); // coast
        continue;
      }
      const e = Math.min(1, (v - SEA) / 0.9);
      const tint = pal.regions[Math.max(0, reg[k]) % pal.regions.length];
      mix(pal.land, tint, 0.55, o, 150);
      mix([data[o], data[o + 1], data[o + 2]], pal.high, e * 0.6, o, 150 + e * 60);
      // Hillshade: light from the north-west.
      const shade = (v - right + (v - down)) * res * 90;
      const s = Math.max(-40, Math.min(40, shade));
      data[o] += s;
      data[o + 1] += s;
      data[o + 2] += s;
      const band = (x: number) => Math.floor((x - SEA) * BANDS);
      if (band(v) !== band(right) || band(v) !== band(down))
        mix(pal.ink, pal.ink, 0, o, 70);
      const r = reg[k];
      const border =
        (i + 1 < w && reg[k + 1] >= 0 && reg[k + 1] !== r) ||
        (j + 1 < h && reg[k + w] >= 0 && reg[k + w] !== r);
      if (border && (i + j) % 6 < 3) mix(pal.ink, pal.ink, 0, o, 200);
    }
  }
  return spots;
}
