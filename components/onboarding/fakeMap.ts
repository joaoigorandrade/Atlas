// A placeholder territory shown on the "building" screen before the real map
// exists — so the learner watches *a* map assemble immediately instead of
// staring at an empty canvas while the topic's actual map is still being
// written. Swapped out for the real graph the instant it arrives (see
// AtlasApp's `build()` / `onGraph`).
//
// Positions follow the same column layout `layoutGraph` in
// lib/server/generate.ts produces, so the handoff to the real map doesn't
// jump.

import type { ConceptEdge, ConceptNode } from "@/lib/curriculum";

const COLS: string[][] = [
  ["a1"],
  ["b1", "b2"],
  ["c1", "c2", "c3"],
  ["d1", "d2"],
  ["e1"],
];

export const FAKE_MAP_NODES: ConceptNode[] = COLS.flatMap((col, d) =>
  col.map((id, i) => ({
    id,
    // A skeleton bar, not an invented concept name — "•" doesn't collapse
    // like repeated spaces would inside the node's nowrap label.
    label: "•".repeat(5 + ((d + i) % 3) * 2),
    state: "unknown" as const,
    g: d + 1,
    week: 0,
    x: 110 + d * 245 + (i % 2 === 1 ? 30 : 0),
    y: 440 + (i - (col.length - 1) / 2) * 140,
  })),
);

export const FAKE_MAP_EDGES: ConceptEdge[] = [
  ["a1", "b1"],
  ["a1", "b2"],
  ["b1", "c1"],
  ["b1", "c2"],
  ["b2", "c2"],
  ["b2", "c3"],
  ["c1", "d1"],
  ["c2", "d1"],
  ["c2", "d2"],
  ["c3", "d2"],
  ["d1", "e1"],
  ["d2", "e1"],
];

export const FAKE_MAP_POSITIONS: Record<string, { x: number; y: number }> =
  Object.fromEntries(FAKE_MAP_NODES.map((n) => [n.id, { x: n.x, y: n.y }]));
