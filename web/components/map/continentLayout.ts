// A continent as one atlas: every member map laid down as a country beside the
// others, on the same painter the map itself uses (`paintAtlas`). Pure — the
// continent screen hands the result straight to `Land`.
//
// Each concept keeps its own territory, namespaced `${topicId}:${nodeId}` so
// two maps' `foundations` never collide, and its `region` is its map, so the
// borders the painter draws between countries are the borders between maps.
// An uncharted scope is a single hatched point of terra incognita, named.
//
// Being in one continent is not the same as sharing a coast. Maps are joined
// only along `links` — pairs judged to share material — and each connected
// group is its own landmass, with open sea between it and the next: a
// theology map and a map of dark humour sit in one continent as two islands.

import {
  displayStates,
  type ConceptGraph,
  type NodeState,
  type StateMap,
} from "@/lib/curriculum";
import type { ScopeOffer } from "@/lib/api";
import type { AtlasInput } from "@/components/map/atlasTerrain";
import { seedOf } from "@/components/map/atlasTerrain";
import { mapBounds, type Pt } from "@/components/map/mapGeometry";

export interface ContinentMember {
  id: string;
  subject: string;
  graph: ConceptGraph;
  states: StateMap;
  positions: Record<string, Pt>;
}

/** Maps are drawn closer than they are laid out, so the land between their
 *  concepts runs together into one coast. ponytail: tuned by eye. */
const SCALE = 0.6;
/** The strait between two countries' outermost concepts — under the land's
 *  reach round a concept, so neighbouring coasts meet into one continent. */
const GAP = 60;
/** Open water between two unrelated landmasses — wider than two coasts plus
 *  their engraved water lines, so they can never be read as touching. */
const SEA = 520;
const SCOPE_PREFIX = "scope:";

/** Which map (or uncharted scope) a territory id belongs to. */
export function ownerOf(id: string): { topicId: string } | { scope: string } {
  return id.startsWith(SCOPE_PREFIX)
    ? { scope: id.slice(SCOPE_PREFIX.length) }
    : { topicId: id.slice(0, id.indexOf(":")) };
}

export function continentAtlas(
  members: ContinentMember[],
  uncharted: ScopeOffer[],
  /** The frame's width over its height — the packing aims for its shape. */
  aspect = 1.5,
  /** Pairs of subjects (or uncharted scope labels) that share a coast. None
   *  known yet means none drawn: every map starts as its own island. */
  links: [string, string][] = [],
): AtlasInput {
  const ids: string[] = [];
  const edges: AtlasInput["edges"] = [];
  const positions: Record<string, Pt> = {};
  const display: Record<string, NodeState> = {};
  const region: Record<string, string> = {};
  const names: Record<string, string> = {};

  // Every country's own box, then packed row by row, each one set straight
  // after the last rather than into a fixed grid cell.
  const boxes = [
    ...members.map((m) => {
      const ownIds = m.graph.nodes.map((n) => n.id);
      const b = mapBounds(m.positions, ownIds) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return { b, w: (b.maxX - b.minX) * SCALE, h: (b.maxY - b.minY) * SCALE };
    }),
    ...uncharted.map(() => ({ b: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, w: 0, h: 0 })),
  ];

  // Which landmass each country is on: union along the links, by name.
  const titles = [...members.map((m) => m.subject), ...uncharted.map((u) => u.label)];
  const key = (n: string) => n.trim().toLowerCase();
  const parent = titles.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (const [a, b] of links) {
    const i = titles.findIndex((n) => key(n) === key(a));
    const j = titles.findIndex((n) => key(n) === key(b));
    if (i >= 0 && j >= 0) parent[root(i)] = root(j);
  }
  const groups = new Map<number, number[]>();
  titles.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));

  // Each landmass packed tight, then the landmasses packed with sea between.
  const slots: Pt[] = [];
  const lands = [...groups.values()].map((items) => {
    const inner = bestPack(
      items.map((i) => boxes[i]),
      GAP,
      aspect,
    );
    return { items, inner };
  });
  const outer = bestPack(
    lands.map((l) => l.inner),
    SEA,
    aspect,
  );
  lands.forEach((land, g) =>
    land.items.forEach((i, k) => {
      slots[i] = {
        x: outer.slots[g].x + land.inner.slots[k].x,
        y: outer.slots[g].y + land.inner.slots[k].y,
      };
    }),
  );
  const origin = (i: number) => slots[i];

  members.forEach((m, i) => {
    const { b } = boxes[i];
    const at = origin(i);
    const shown = displayStates(m.states, m.graph);
    names[m.id] = m.subject;
    for (const n of m.graph.nodes) {
      const p = m.positions[n.id];
      if (!p) continue;
      const id = `${m.id}:${n.id}`;
      ids.push(id);
      positions[id] = {
        x: at.x + (p.x - b.minX) * SCALE,
        y: at.y + (p.y - b.minY) * SCALE,
      };
      display[id] = shown[n.id] ?? "unknown";
      region[id] = m.id;
    }
    for (const [from, to, dashed] of m.graph.edges)
      edges.push([
        `${m.id}:${from}`,
        `${m.id}:${to}`,
        dashed,
      ] as AtlasInput["edges"][number]);
  });

  uncharted.forEach((s, j) => {
    const at = origin(members.length + j);
    const id = `${SCOPE_PREFIX}${s.label}`;
    ids.push(id);
    positions[id] = at;
    display[id] = "unknown";
    region[id] = id;
    names[id] = s.label;
  });

  return { ids, edges, positions, display, region, names, seed: seedOf(ids) };
}

/**
 * Boxes packed row by row, each set straight after the last, with whichever
 * column count gives the whole the frame's own shape. Real maps are long and
 * thin — a curriculum runs left to right — so a square grid of them is a strip
 * no frame can hold.
 */
function bestPack(boxes: { w: number; h: number }[], gap: number, aspect: number) {
  const pack = (cols: number) => {
    const rowH: number[] = [];
    boxes.forEach((x, i) => {
      const row = Math.floor(i / cols);
      rowH[row] = Math.max(rowH[row] ?? 0, x.h);
    });
    const slots: Pt[] = [];
    let cx = 0;
    let top = 0;
    let w = 0;
    boxes.forEach((x, i) => {
      const row = Math.floor(i / cols);
      if (i && i % cols === 0) {
        cx = 0;
        top += rowH[row - 1] + gap;
      }
      // Centred on its row, so a short country doesn't hang off the top edge.
      slots.push({ x: cx, y: top + (rowH[row] - x.h) / 2 });
      w = Math.max(w, cx + x.w);
      cx += x.w + gap;
    });
    const h = top + (rowH[rowH.length - 1] ?? 0);
    return { slots, w, h, fit: Math.abs(Math.log((w + gap) / (h + gap) / aspect)) };
  };
  return boxes
    .map((_, i) => pack(i + 1))
    .reduce((best, p) => (p.fit < best.fit ? p : best), pack(1));
}
