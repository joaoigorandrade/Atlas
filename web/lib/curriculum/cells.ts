// ---- The cell: a node's importance × difficulty ----------------------------
// Two axes, and they save time in two different ways — which is the whole
// reason there are two of them.
//
// Importance sets the BAR: what "done" means for this node — master it, use
// it, or recognise it. A lower bar is a different *kind* of proof, so it
// decides which phases the node runs at all (`resolvePlan`).
//
// Difficulty sets the BUDGET under that bar: how many items each phase
// writes, how much scaffolding each gives, how long the node should take. An
// easier node reaches the same bar sooner; it never aims lower.
//
// And the learner's goal decides which cells a map may hold at all
// (`GOAL_CELLS`): material the goal does not need is never generated.

/**
 * How much the learner's GOAL rests on a concept — judged against the goal,
 * never in general. `core` is a hub or a capstone, `working` is needed to use
 * the core, `peripheral` is context the learner only has to recognise.
 */
export type NodeImportance = "core" | "working" | "peripheral";

/** How hard a concept is for a newcomer who already holds its prerequisites. */
export type NodeDifficulty = "easy" | "medium" | "hard";

export const IMPORTANCES = ["core", "working", "peripheral"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** Lenient: anything unrecognised reads as the full-depth default. */
export function asImportance(raw: unknown): NodeImportance {
  return (IMPORTANCES as readonly string[]).includes(raw as string)
    ? (raw as NodeImportance)
    : "core";
}

export function asDifficulty(raw: unknown): NodeDifficulty {
  return (DIFFICULTIES as readonly string[]).includes(raw as string)
    ? (raw as NodeDifficulty)
    : "medium";
}

/** What "done" means for a node — importance's whole effect. */
export type MasteryBar = "master" | "use" | "recognise";

export const BAR: Record<NodeImportance, MasteryBar> = {
  core: "master",
  working: "use",
  peripheral: "recognise",
};

/** A grid position: importance row (1 = core) then difficulty column (1 = easy). */
export type Cell = `${1 | 2 | 3}${1 | 2 | 3}`;

export function cellOf(
  importance: NodeImportance = "core",
  difficulty: NodeDifficulty = "medium",
): Cell {
  return `${IMPORTANCES.indexOf(importance) + 1}${DIFFICULTIES.indexOf(difficulty) + 1}` as Cell;
}

/** The cells a map's level-I concepts may hold: every node is something to use
 *  (`working`). A deeper level raises difficulty a step (`spawnDepth`).
 *  ponytail: "23" (working/hard) stays closed until the map prompt's rework
 *  (docs/PLAN-FLOW.md WS2) opens it with a mapV bump. */
export const MAP_CELLS: readonly Cell[] = ["21", "22"];

/**
 * Minutes a node should cost the learner, whole ladder, by cell.
 *
 * ponytail: starting estimates. `nodes.phase_seconds` records what each phase
 * really took; tune these from its per-cell medians, not from intuition.
 */
export const CELL_BUDGET: Record<Cell, number> = {
  "11": 20,
  "12": 35,
  "13": 50,
  "21": 8,
  "22": 12,
  "23": 18,
  "31": 4,
  "32": 6,
  "33": 6,
};
