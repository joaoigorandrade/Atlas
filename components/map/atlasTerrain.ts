// The generated atlas the concepts are drawn as, like a war map: every
// concept is a territory with a city at its heart, grouped into countries.
// The land is static — raised under every concept and roughened by seeded
// noise, so the coast never moves as the learner works — and progress shows
// as colour: a territory is washed in its country's colour as it is won, and
// hatched as terra incognita until it is reached. Pure — the canvas it paints
// into is passed in.

import type { ConceptEdge, ConceptNode, NodeState } from "@/lib/curriculum";
import type { Pt } from "@/components/map/mapGeometry";
import { distanceTo, fbm } from "@/components/map/atlasFields";

export { seedOf } from "@/components/map/atlasFields";

/** How strongly each state washes its territory in its country's colour. */
const HOLD: Record<NodeState, number> = {
  unknown: 0.12,
  frontier: 0.4,
  gap: 0.4,
  learning: 0.7,
  shaky: 0.6,
  mastered: 1,
};
const SIGMA = 78;
const SEA = 0.5;

/**
 * Which country each concept belongs to. A curriculum is a journey through
 * its stages, so countries are runs of consecutive stages, about five
 * concepts each (at most six countries). Neither the domain nor the roots
 * work here: most maps have one root, and a domain is a stance, not a place.
 * Each country is named after its capital, the concept with the most roads.
 */
export function regionsOf(nodes: ConceptNode[], edges: ConceptEdge[]) {
  const of: Record<string, string> = {};
  const name: Record<string, string> = {};
  const degree: Record<string, number> = {};
  for (const [a, b] of edges) {
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  }
  const stages = [...new Set(nodes.map((n) => n.g))].sort((a, b) => a - b);
  const count = Math.min(6, Math.max(1, Math.round(nodes.length / 5)));
  const target = nodes.length / count;
  const countries: ConceptNode[][] = [[]];
  for (const g of stages) {
    const stage = nodes.filter((n) => n.g === g);
    const cur = countries[countries.length - 1];
    // Close the country when adding this stage would overshoot more than stopping.
    const overshoot =
      Math.abs(cur.length + stage.length - target) > Math.abs(cur.length - target);
    if (cur.length && overshoot && countries.length < count) countries.push([...stage]);
    else cur.push(...stage);
  }
  for (const members of countries) {
    const capital = members.reduce((best, n) =>
      (degree[n.id] ?? 0) > (degree[best.id] ?? 0) ? n : best,
    );
    for (const n of members) of[n.id] = capital.id;
    name[capital.id] = capital.label;
  }
  return { of, name };
}

export interface AtlasInput {
  ids: string[];
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  region: Record<string, string>;
  /** Each country's name, keyed like `region` — sizes its label. */
  names: Record<string, string>;
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
  const { ids, edges, positions, seed } = input;
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
    if (p) bump(p, 1, SIGMA);
  }
  // Roads become ridges joining their land; a gap's dashed road stays a strait.
  for (const [a, b, dashed] of edges) {
    const pa = positions[a];
    const pb = positions[b];
    if (!pa || !pb || dashed) continue;
    const steps = Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y) / 60);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      bump(
        { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t },
        0.45,
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
  paper: RGB;
  ink: RGB;
  /** Hand-colouring, one per country, washed in along its edges. */
  regions: readonly RGB[];
}

/** A country's name, laid out: centre, type size and letter spacing. */
export interface Spot extends Pt {
  size: number;
  spacing: number;
}

/**
 * Spaced capitals sized to the country: spread to about 60% of its width, but
 * never so loose a short name falls apart. Returns the label's half-extents.
 */
function labelFor(name: string, width: number) {
  const size = Math.max(13, Math.min(40, width / 14));
  const n = Math.max(1, name.length);
  const spacing = Math.max(
    size * 0.3,
    Math.min(size * 1.1, (width * 0.6 - n * size * 0.72) / n),
  );
  return { size, spacing, hw: (n * (size * 0.72 + spacing)) / 2, hh: size * 0.7 };
}

/**
 * Paints the atlas into `img`, whose pixel (0,0) is map point (x0,y0), in the
 * manner of a hand-coloured 19th-century war map: parchment land, each
 * concept's territory washed in its country's colour along its borders — as
 * deep as the learner's hold on it — a heavy border between countries and a
 * fine one between territories, and engraved water lines off the coast.
 *
 * Returns each country's name, laid out (see the placement below), and the
 * territory under every pixel (`prov`, an index into `lit`, -1 at sea) — what
 * a click on the map is resolved against.
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
  // Each land pixel's province (nearest concept) and so its country, solved on
  // a 2px lattice — the step is under a map unit at any zoom the map allows.
  // ponytail: O(pixels/4 × concepts); a bucket grid if maps pass ~300 concepts.
  const prov = new Int16Array(w * h).fill(-1);
  const near = new Float32Array(w * h); // px to the nearest concept
  const extent: Record<string, [number, number]> = {};
  for (let bj = 0; bj < h; bj += 2) {
    for (let bi = 0; bi < w; bi += 2) {
      if (
        hf[bj * w + bi] < SEA &&
        hf[Math.min(h - 1, bj + 1) * w + Math.min(w - 1, bi + 1)] < SEA
      )
        continue;
      // Warp the point before asking which concept is nearest, so borders
      // wander like surveyed ones instead of running as Voronoi straights.
      const wx = x0 + bi / res;
      const wy = y0 + bj / res;
      const qi = bi + fbm(wx / 160, wy / 160, input.seed + 3) * 70 * res;
      const qj = bj + fbm(wx / 160, wy / 160, input.seed + 5) * 70 * res;
      let best = Infinity;
      let p = -1;
      for (let n = 0; n < lit.length; n++) {
        const d = (px[n] - qi) ** 2 + (py[n] - qj) ** 2;
        if (d < best) [best, p] = [d, n];
      }
      for (let j = bj; j < Math.min(h, bj + 2); j++)
        for (let i = bi; i < Math.min(w, bi + 2); i++)
          if (hf[j * w + i] >= SEA)
            [prov[j * w + i], near[j * w + i]] = [p, Math.sqrt(best)];
      const key = keys[pr[p]];
      if (key === undefined || hf[bj * w + bi] < SEA) continue;
      const x = x0 + bi / res;
      const e = (extent[key] ??= [x, x]);
      e[0] = Math.min(e[0], x);
      e[1] = Math.max(e[1], x);
    }
  }
  const country = (p: number) => (p < 0 ? -1 : pr[p]);

  // Edges: coast, country borders, province borders. The washes and the
  // water lines are measured from the first two.
  const edge = new Uint8Array(w * h); // 1 coast, 2 country border, 3 province border
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const a = prov[k];
      const r = i + 1 < w ? prov[k + 1] : a;
      const b = j + 1 < h ? prov[k + w] : a;
      if (a < 0 !== r < 0 || a < 0 !== b < 0) edge[k] = 1;
      else if (a < 0) continue;
      else if (country(a) !== country(r) || country(a) !== country(b)) edge[k] = 2;
      else if (a !== r || a !== b) edge[k] = 3;
    }
  const seed = new Uint8Array(w * h);
  for (let k = 0; k < seed.length; k++) seed[k] = edge[k] === 1 || edge[k] === 2 ? 1 : 0;
  const dist = distanceTo(seed, w, h);
  // Each territory is washed in from its own borders, not just the country's.
  for (let k = 0; k < seed.length; k++) seed[k] = edge[k] ? 1 : 0;
  const own = distanceTo(seed, w, h);
  for (let k = 0; k < seed.length; k++) seed[k] = edge[k] === 1 ? 1 : 0;
  const coast = distanceTo(seed, w, h);

  // A country's name goes where there is most room both from its cities and
  // from its edges, so it reads inside the country, not across the coast —
  // and clear of every name already set. Widest countries choose first.
  const spots: Record<string, Spot> = {};
  const taken: { x: number; y: number; hw: number; hh: number }[] = [];
  const order = Object.keys(extent).sort(
    (a, b) => extent[b][1] - extent[b][0] - (extent[a][1] - extent[a][0]),
  );
  // Each country's roomiest points, best first — tried in order below.
  const room: Record<string, number[]> = {};
  for (let k = 0; k < prov.length; k += 5) {
    const key = keys[country(prov[k])];
    if (key !== undefined) (room[key] ??= []).push(k);
  }
  const roomAt = new Float32Array(prov.length);
  for (const key in room) {
    for (const k of room[key]) roomAt[k] = Math.min(near[k], dist[k] * 2.2);
    room[key].sort((a, b) => roomAt[b] - roomAt[a]);
  }
  for (const key of order) {
    // Largest type first; a name that fits nowhere whole steps down a size.
    let placed: { spot: Spot; hw: number; hh: number } | undefined;
    for (const scale of [1, 0.72, 0.5]) {
      const label = labelFor(
        input.names[key] ?? "",
        (extent[key][1] - extent[key][0]) * scale,
      );
      let fitted = false;
      for (const k of room[key] ?? []) {
        const x = x0 + (k % w) / res;
        const y = y0 + Math.floor(k / w) / res;
        const clash = taken.some(
          (t) =>
            Math.abs(t.x - x) < t.hw + label.hw + 12 &&
            Math.abs(t.y - y) < t.hh + label.hh + 8,
        );
        if (clash) continue;
        // The whole baseline must lie in this country; a name spilling over a
        // border reads as the neighbour's.
        fitted = [-1, -0.5, 0.5, 1].every((f) => {
          const i = Math.round((x + f * label.hw - x0) * res);
          return i >= 0 && i < w && keys[country(prov[k - (k % w) + i])] === key;
        });
        const spot = { x, y, size: label.size, spacing: label.spacing };
        if (fitted || !placed) placed = { spot, hw: label.hw, hh: label.hh };
        if (fitted) break;
      }
      if (fitted) break;
    }
    if (!placed) continue;
    spots[key] = placed.spot;
    taken.push({ ...placed.spot, hw: placed.hw, hh: placed.hh });
  }

  const put = (o: number, c: RGB, alpha: number) => {
    data[o] = c[0];
    data[o + 1] = c[1];
    data[o + 2] = c[2];
    data[o + 3] = alpha;
  };
  /** Ink laid over what is already there, `a` of the way. */
  const ink = (o: number, a: number) => {
    if (a <= 0) return;
    const under = data[o + 3] / 255;
    for (let c = 0; c < 3; c++)
      data[o + c] =
        (data[o + c] * under * (1 - a) + pal.ink[c] * a) / (under * (1 - a) + a);
    data[o + 3] = 255 * (under * (1 - a) + a);
  };
  // Water lines sit at these distances off the coast, opening out seaward.
  const LINES = Array.from({ length: 9 }, (_, n) => 3 + 3.4 * n ** 1.3);
  const WASH = 22; // px of colour washed in from a border
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const o = k * 4;
      const d = dist[k];
      if (prov[k] < 0) {
        // Engraved water lining: close-set lines off the coast, spreading and
        // fading seaward, as on an engraved plate.
        const c = coast[k];
        if (c > LINES[LINES.length - 1] + 1) continue; // open sea: bare paper
        let n = 0;
        while (n < LINES.length - 1 && LINES[n] + 1.7 < c) n++;
        ink(o, Math.max(0, 1 - Math.abs(c - LINES[n]) / 0.8) * (0.42 - n * 0.04));
        ink(o, Math.max(0, 1 - c / 1.4) * 0.9); // the coast, anti-aliased seaward
        continue;
      }
      const tint = pal.regions[country(prov[k]) % pal.regions.length];
      const state = input.display[lit[prov[k]]] ?? "unknown";
      // Paper inside, the colour strongest along the territory's edges and
      // as deep as the learner's hold on it.
      const t =
        (Math.max(0, 1 - own[k] / WASH) ** 1.4 * 0.6 + 0.32 + (d < 3 ? 0.15 : 0)) *
        HOLD[state];
      data[o] = pal.paper[0] + (tint[0] - pal.paper[0]) * t;
      data[o + 1] = pal.paper[1] + (tint[1] - pal.paper[1]) * t;
      data[o + 2] = pal.paper[2] + (tint[2] - pal.paper[2]) * t;
      data[o + 3] = 235;
      // Terra incognita: ground nobody has reached is hatched, as a surveyor
      // shades what he has only heard of.
      if (state === "unknown" && (i + j) % 7 === 0) ink(o, 0.1);
      ink(o, Math.max(0, 1 - coast[k] / 1.4) * 0.9);
      if (edge[k] === 2) {
        const dark: RGB = [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5];
        put(o, (i + j) % 7 < 5 ? pal.ink : dark, 235);
      } else if (edge[k] === 3) put(o, pal.ink, (i + j) % 3 ? 90 : 150);
    }
  }
  return { spots, prov, lit };
}
