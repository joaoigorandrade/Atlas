// Rationing the heavy phases (W3.1): a Steelman needs a live dispute, a
// Crucible a framing worth transferring into, a Discriminate a class with
// members, a Connect two neighbours — and a node's cell caps how many gates it
// runs at all. Written by the map per node, applied once in `resolvePlan`.

import type { NodeDifficulty } from "./cells";
import type { NodeKind, PhaseId } from "./phases";

/**
 * What the map writes per node that decides which HEAVY phases it runs
 * (W3.1). Every flag is optional and absent means "no evidence": a map built
 * before these existed, or a gap node the client invented, keeps its ladder.
 */
export interface PlanEvidence {
  /** A live scholarly or public disagreement exists — Steelman has a subject. */
  contested?: boolean;
  /** Applying it outside its taught framing means something — the Crucible does. */
  transferable?: boolean;
  /** A named person, event or document — there is no class to discriminate. */
  individual?: boolean;
  /** Prerequisites plus dependents at build: Connect needs two to wire. */
  neighbours?: number;
}

/** The most gates a mastered node of each difficulty may run (W3.1). An easy
 *  concept that ran ten phases was the time the pace model never promised. */
export const GATE_CAP: Record<NodeDifficulty, number> = {
  easy: 5,
  medium: 7,
  hard: Infinity,
};

/**
 * Which gates a node keeps first when its cell caps them, per kind — the
 * phase that extracts the kind's own signal leads, Connect trails. A domain's
 * own rung ranks high — a language map without Produce, a source reading
 * without Provenance, a formal concept with nothing to compute (Perform) would
 * have lost the point of the domain.
 */
const GATE_PRIORITY: Record<NodeKind, readonly PhaseId[]> = {
  fact: ["consume", "produce", "recall", "drill", "discriminate", "connect"],
  concept: [
    "consume",
    "produce",
    "provenance",
    "discriminate",
    "feynman",
    "perform",
    "crucible",
    "steelman",
    "recall",
    "trace",
    "socratic",
    "predict",
    "drill",
    "connect",
  ],
  procedure: [
    "consume",
    "produce",
    "perform",
    "trace",
    "feynman",
    "drill",
    "crucible",
    "provenance",
    "steelman",
    "predict",
    "discriminate",
    "connect",
  ],
  principle: [
    "consume",
    "produce",
    "provenance",
    "predict",
    "feynman",
    "trace",
    "perform",
    "crucible",
    "steelman",
    "socratic",
    "drill",
    "connect",
  ],
};

export function gateRank(kind: NodeKind, phase: PhaseId): number {
  const at = GATE_PRIORITY[kind].indexOf(phase);
  return at < 0 ? 99 : at;
}
