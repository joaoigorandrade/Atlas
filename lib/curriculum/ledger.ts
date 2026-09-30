// The ledger after a phase closes: which gates a node now holds, including
// the ones a challenge or a clean first try earns without being run.

import { planGates, proofGate, type PhaseId } from "./phases";

/**
 * The ledger after `phase` closes on a node.
 *
 * Normally that phase is appended. Under a "prove it" challenge — the learner
 * said they already know this and was sent straight to the plan's `proofGate`
 * — passing that gate credits every gate before it, in plan order after what was
 * already done. Passing the hardest test cold is the proof the skipped rungs
 * exist to build; failing it spawns the gap as any attempt does and credits
 * nothing. Retain never enters the ledger — review history closes it.
 */
export function ledgerAfter(
  plan: readonly PhaseId[],
  prev: readonly PhaseId[],
  phase: PhaseId,
  challenged: boolean,
  /** A clean first try — no gap, no re-run (W3.2). */
  clean = false,
): PhaseId[] {
  const gates = planGates(plan);
  if (challenged && phase === proofGate(plan))
    return [...prev, ...gates.filter((p) => !prev.includes(p))];
  const next = prev.includes(phase) ? [...prev] : [...prev, phase];
  if (!clean) return next;
  // Earned skips: a harder phase passed clean on the first try is the proof an
  // easier unfinished gate before it exists to build.
  const before = gates.slice(0, gates.indexOf(phase));
  const earned = (CREDITS[phase] ?? []).filter(
    (p) => before.includes(p) && !next.includes(p),
  );
  return [...next, ...earned];
}

/**
 * Which easier gates a clean first-try pass credits (W3.2): teaching the
 * concept back with no gap is the reasoning Socratic draws out; running the
 * procedure right first time is the walk Trace rehearses. A cold Crucible is
 * the challenge above and credits everything.
 */
export const CREDITS: Partial<Record<PhaseId, readonly PhaseId[]>> = {
  feynman: ["socratic"],
  perform: ["trace"],
};
