// ---- live mastery state ----------------------------------------------------
// The app holds one `Record<node id, ProgressState>`; every surface reads it
// and every phase writes it back. Frontier and locking are derived, never set.
import { localDay } from "./adherence";
import { GoalKind, ancestorsOf, descendantsOf } from "./calibration";
import {
  ConceptEdge,
  ConceptGraph,
  ConceptNode,
  NodeState,
  ProgressState,
} from "./types";
import { Language } from "@/lib/i18n";

export type StateMap = Record<string, ProgressState>;

export function initialStates(graph: ConceptGraph): StateMap {
  return Object.fromEntries(graph.nodes.map((n) => [n.id, n.state]));
}

/** A prerequisite is met once the node has been learned at least once. */
function isLearned(state: ProgressState | undefined): boolean {
  return state === "learning" || state === "shaky" || state === "mastered";
}

/** Solid prerequisite edges into each node (dashed gap edges don't lock). */
function prereqMap(edges: ConceptEdge[]): Record<string, string[]> {
  const prereqs: Record<string, string[]> = {};
  for (const [from, to, dashed] of edges) {
    if (!dashed) (prereqs[to] = prereqs[to] ?? []).push(from);
  }
  return prereqs;
}

/**
 * What each node shows on the map: stored progress, except that an `unknown`
 * node with every prerequisite learned lights up as `frontier` (the ZPD).
 * A node left `unknown` here is locked by definition.
 */
export function displayStates(
  states: StateMap,
  graph: ConceptGraph,
): Record<string, NodeState> {
  const prereqs = prereqMap(graph.edges);
  const out: Record<string, NodeState> = {};
  for (const node of graph.nodes) {
    const state = states[node.id] ?? "unknown";
    // Gap nodes never join the frontier — they hang off their parent via a
    // dashed edge and are entered from its detail rail, not unlocked.
    out[node.id] =
      state === "unknown" &&
      !node.gap &&
      (prereqs[node.id] ?? []).every((p) => isLearned(states[p]))
        ? "frontier"
        : state;
  }
  return out;
}

/**
 * Why a node is locked: its unlearned ancestors (plus the node itself),
 * i.e. the "learn these first" path highlighted on the map.
 */
export function unmetPathOf(
  id: string,
  states: StateMap,
  graph: ConceptGraph,
): Set<string> {
  const path = new Set<string>();
  for (const anc of ancestorsOf(id, graph.edges)) {
    if (anc === id || !isLearned(states[anc])) path.add(anc);
  }
  return path;
}

// ---- Phase 1 · Plan (the re-planning behavior of the map) ------------------
// Not a screen: the map continuously reorders to the goal, warns about pace,
// prunes diagnosed-known material, and spawns gap sub-nodes from failures.
// The only recurring UI is the "Map updated" toast when it restructures.

/** Goal-conditioned frontier ordering: which lit node to attack, and why. */
export interface PlanEntry {
  node: ConceptNode;
  /** How many not-yet-learned concepts this node transitively unlocks. */
  unlocks: number;
}

export const GOAL_ORDER_CAPTION: Record<GoalKind, string> = {
  exam: "ordered to your exam — highest leverage first",
  project: "ordered to your build — unlocks the tools first",
  mastery: "foundations first — depth over speed",
  pareto: "ordered by leverage — the vital few first",
};

const GOAL_ORDER_CAPTION_PT: Record<GoalKind, string> = {
  exam: "ordenado para sua prova — maior alavancagem primeiro",
  project: "ordenado para sua construção — desbloqueia as ferramentas primeiro",
  mastery: "fundamentos primeiro — profundidade antes de velocidade",
  pareto: "ordenado por alavancagem — o essencial primeiro",
};

/** Language-aware plan-ordering caption. */
export function goalOrderCaption(goal: GoalKind, lang: Language = "en"): string {
  return (lang === "pt-BR" ? GOAL_ORDER_CAPTION_PT : GOAL_ORDER_CAPTION)[goal];
}

/**
 * The plan itself: frontier nodes ordered to the goal. A deadline-driven
 * goal attacks the nodes that unlock the most remaining territory; general
 * mastery walks foundations-to-frontier.
 */
export function orderedFrontier(
  display: Record<string, NodeState>,
  graph: ConceptGraph,
  goal: GoalKind,
): PlanEntry[] {
  const entries: PlanEntry[] = graph.nodes
    .filter((n) => display[n.id] === "frontier")
    .map((node) => ({
      node,
      unlocks: [...descendantsOf(node.id, graph.edges)].filter((d) => {
        const s = display[d];
        return s === "unknown" || s === "frontier";
      }).length,
    }));
  entries.sort((a, b) =>
    goal === "mastery"
      ? a.node.x - b.node.x
      : b.unlocks - a.unlocks || a.node.x - b.node.x,
  );
  return entries;
}

/** Rough minutes of focused work to take one concept through the spiral.
 *  ponytail: constant until real session-length analytics exist (#23). */
export const NODE_MINUTES = 35;

/** Whole days from now until an ISO date (YYYY-MM-DD), floor 0; NaN-safe. */
export function daysUntil(dateISO: string, now: Date = new Date()): number {
  const target = Date.parse(dateISO);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.parse(localDay(now))) / 86_400_000));
}

export interface PaceStatus {
  /** Non-gap concepts not yet mastered. */
  remaining: number;
  daysLeft: number;
  /** Minutes/day the remaining territory demands before the deadline. */
  neededPerDay: number;
  /** The learner's daily target from onboarding. */
  targetPerDay: number;
  onTrack: boolean;
}

/** Pace against the real deadline (#23) — daysLeft comes from the learner's
 *  actual exam date; no date, no countdown. */
export function paceStatus(
  states: StateMap,
  graph: ConceptGraph,
  targetPerDay: number,
  daysLeft: number,
): PaceStatus {
  const remaining = graph.nodes.filter(
    (n) => !n.gap && states[n.id] !== "mastered",
  ).length;
  const neededPerDay = Math.ceil((remaining * NODE_MINUTES) / Math.max(1, daysLeft));
  return {
    remaining,
    daysLeft,
    neededPerDay,
    targetPerDay,
    onTrack: neededPerDay <= targetPerDay,
  };
}

/** A sub-concept the re-planner can spawn under a node when it keeps failing. */
export interface GapSpec {
  id: string;
  label: string;
  /** Why the AI split it out — quoted in the "Map updated" toast. */
  reason: string;
  /** Placement offset from the parent node. */
  dx: number;
  dy: number;
}

/** Nodes spawned mid-map belong to the current (post-replay) week. */
const SPAWN_WEEK = 4;

/**
 * The restructure itself: a new red gap node hung under its parent by a
 * dashed edge. Idempotent — an already-spawned spec returns the graph as-is.
 */
export function spawnGap(
  graph: ConceptGraph,
  parentId: string,
  spec: GapSpec,
): ConceptGraph {
  const parent = graph.nodes.find((n) => n.id === parentId);
  if (!parent || graph.nodes.some((n) => n.id === spec.id)) return graph;
  const node: ConceptNode = {
    id: spec.id,
    label: spec.label,
    // Why the AI split this out is the truest summary a gap has.
    summary: spec.reason,
    state: "gap",
    g: parent.g,
    week: SPAWN_WEEK,
    x: parent.x + spec.dx,
    y: parent.y + spec.dy,
    gap: true,
  };
  return {
    nodes: [...graph.nodes, node],
    edges: [...graph.edges, [parentId, spec.id, true]],
  };
}

/**
 * Remove a node and every edge touching it. The Crucible calls this to close
 * its first-attempt gap once the re-attempt finally transfers — the diagnosed
 * sub-node is resolved, so it leaves the map.
 */
export function removeNode(graph: ConceptGraph, id: string): ConceptGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter(([from, to]) => from !== id && to !== id),
  };
}

/**
 * Where one concept's teaching ends and its neighbours' begins.
 *
 * Every per-node generation used to see only its own label and its *direct*
 * prereqs, so it had no way to know that a concept two columns back already
 * taught the thing it is re-deriving, or that the concept after it is the one
 * that owns the extension it just wandered into. The learner reads the same
 * material twice and meets the next concept already spoiled.
 *
 * `prior` is every ancestor over solid edges — what the learner has already
 * been taught and may be built on. `later` is every other concept on the map —
 * what belongs to somebody else's pass and must not be taught here.
 *
 * Gap nodes are excluded from both: they are spawned per learner, and a
 * per-learner list in the prompt would fork the shared `content_cache` row
 * that two learners on the same topic otherwise hash to.
 */
export function conceptBoundary(
  graph: ConceptGraph,
  nodeId: string,
): { priorLabels: string[]; laterLabels: string[] } {
  const solid = graph.edges.filter(([, , dashed]) => !dashed);
  const ancestors = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [from, to] of solid)
      if (to === cur && !ancestors.has(from) && from !== nodeId) {
        ancestors.add(from);
        queue.push(from);
      }
  }
  const priorLabels: string[] = [];
  const laterLabels: string[] = [];
  for (const n of graph.nodes) {
    if (n.gap || n.id === nodeId) continue;
    (ancestors.has(n.id) ? priorLabels : laterLabels).push(n.label);
  }
  return { priorLabels, laterLabels };
}
