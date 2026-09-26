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

import type { GoalKind } from "./calibration";
import type { Domain } from "./domains";
import type { NodeKind, PhaseId } from "./phases";

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

const ALL_CELLS: readonly Cell[] = ["11", "12", "13", "21", "22", "23", "31", "32", "33"];

/**
 * Which cells each goal lets a map hold. A Pareto map carries nothing the
 * learner only has to recognise; an exam keeps only the easy context; a
 * project uses its hard ideas as tools rather than studying them; mastery
 * holds everything, weighted to the core by the map prompt.
 */
export const GOAL_CELLS: Record<GoalKind, readonly Cell[]> = {
  pareto: ["11", "12", "13", "21", "22"],
  exam: ["11", "12", "13", "21", "22", "23", "31"],
  project: ["11", "12", "21", "22"],
  mastery: ALL_CELLS,
};

/**
 * The nearest cell the goal allows. The prompt names the allowed cells, so this
 * is the backstop for a model that ignored it: rather than fail a whole map, a
 * node keeps its row and gives up difficulty first (it is still learnable at
 * that bar), and only moves row when its row is closed to the goal.
 */
export function clampCell(
  goal: GoalKind,
  importance: NodeImportance,
  difficulty: NodeDifficulty,
): { importance: NodeImportance; difficulty: NodeDifficulty } {
  const allowed = GOAL_CELLS[goal];
  const i = IMPORTANCES.indexOf(importance);
  const d = DIFFICULTIES.indexOf(difficulty);
  let best = { importance, difficulty };
  let bestCost = Infinity;
  for (const cell of allowed) {
    const ci = Number(cell[0]) - 1;
    const cd = Number(cell[1]) - 1;
    const cost = Math.abs(ci - i) * 10 + (cd <= d ? d - cd : 5 + cd - d);
    if (cost < bestCost) {
      bestCost = cost;
      best = { importance: IMPORTANCES[ci], difficulty: DIFFICULTIES[cd] };
    }
  }
  return best;
}

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

/**
 * The one applied rung that proves a `use` node, by preference: whatever makes
 * the learner DO the thing this kind of concept is for. The domain goes first
 * where it replaces the kind's ladder outright — speaking is the use of a
 * language, carrying the stage out is the use of a craft.
 */
const USE_RUNGS: Record<NodeKind, readonly PhaseId[]> = {
  fact: ["drill", "discriminate", "recall"],
  concept: ["discriminate", "predict"],
  procedure: ["perform", "trace", "drill"],
  principle: ["predict", "trace"],
};

const DOMAIN_USE: Partial<Record<Domain, readonly PhaseId[]>> = {
  performative: ["produce"],
  craft: ["perform"],
};

/** The first preferred applied rung present in the node's full ladder. */
export function appliedRung(
  full: readonly PhaseId[],
  kind: NodeKind,
  domain: Domain,
): PhaseId | undefined {
  return [...(DOMAIN_USE[domain] ?? []), ...USE_RUNGS[kind]].find((p) =>
    full.includes(p),
  );
}
