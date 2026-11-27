// ---- deeper levels ---------------------------------------------------------
// A concept the map gave levels (II, III) offers them once it is mastered. A
// level is a hidden node beside its base, so every phase, ledger and card works
// on it unchanged; what makes it bonus is that no total counts it (`isCore`).

import { DIFFICULTIES } from "./cells";
import { resolvePlan } from "./phases";
import { SPAWN_WEEK, displayStates, type StateMap } from "./replan";
import {
  baseIdOf,
  isCore,
  type ConceptGraph,
  type ConceptNode,
  type NodeState,
  type ProgressState,
} from "./types";

/**
 * Go one level deeper: hang the next level of `fromId`'s base under `fromId`,
 * the way `spawnGap` hangs a gap — but as a hidden node on a solid edge, so the
 * frontier derivation lights it and every phase, ledger and card works on it
 * unchanged. Allowed only once `fromId` is mastered and its base has a spec for
 * the next level. Idempotent: an already-spawned level comes back as it is.
 */
export function spawnDepth(
  graph: ConceptGraph,
  states: StateMap,
  fromId: string,
): { graph: ConceptGraph; node: ConceptNode } | null {
  const from = graph.nodes.find((n) => n.id === fromId);
  const base = graph.nodes.find((n) => n.id === baseIdOf(fromId));
  const level = (from?.depth ?? 1) + 1;
  const spec = base?.deeper?.[level - 2];
  if (!from || !base || !spec || states[fromId] !== "mastered") return null;
  const id = `${base.id}~${level}`;
  const existing = graph.nodes.find((n) => n.id === id);
  if (existing) return { graph, node: existing };
  const difficulty =
    DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(from.difficulty ?? "medium") + 1, 2)];
  const kind = base.kind ?? "concept";
  const node: ConceptNode = {
    id,
    label: spec.label,
    summary: spec.summary,
    state: "unknown",
    kind,
    ...(base.domain ? { domain: base.domain } : null),
    ...(base.importance ? { importance: base.importance } : null),
    difficulty,
    phasePlan: resolvePlan(kind, base.domain ?? "general", base.importance, difficulty),
    g: from.g,
    week: SPAWN_WEEK,
    x: from.x,
    y: from.y,
    depth: level as 2 | 3,
  };
  return {
    graph: { nodes: [...graph.nodes, node], edges: [...graph.edges, [fromId, id]] },
    node,
  };
}

/** A base node's levels, I first: the node itself, then each spec's spawned
 *  node or `null` while it has not been reached. `[]` for a node without levels. */
export function levelsOf(
  graph: Pick<ConceptGraph, "nodes">,
  base: ConceptNode,
): Array<ConceptNode | null> {
  if (!base.deeper?.length || !isCore(base)) return [];
  return [
    base,
    ...base.deeper.map(
      (_, i) => graph.nodes.find((n) => n.id === `${base.id}~${i + 2}`) ?? null,
    ),
  ];
}

/** A map's headline numbers over the map proper: a deeper level is bonus and
 *  moves none of them. */
export function mapProgress(
  graph: ConceptGraph,
  states: Record<string, ProgressState | undefined>,
  display: Record<string, NodeState> = displayStates(states as StateMap, graph),
) {
  const nodes = graph.nodes.filter(isCore);
  const mastered = nodes.filter((n) => states[n.id] === "mastered").length;
  return {
    mastered,
    masteryPct: nodes.length ? Math.round((mastered / nodes.length) * 100) : 0,
    frontierTotal: nodes.filter((n) => display[n.id] === "frontier").length,
  };
}

/** The map proper — a copy of `graph` without its deeper levels. For the
 *  surfaces that read a whole saved map at once (a card, a continent). */
export function coreGraph(graph: ConceptGraph): ConceptGraph {
  if (graph.nodes.every(isCore)) return graph;
  const nodes = graph.nodes.filter(isCore);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: graph.edges.filter(([a, b]) => ids.has(a) && ids.has(b)) };
}
