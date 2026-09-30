// ---- Spacing: the proofs that only count after a night ---------------------
// Everything else on a ladder can run back to back in one sitting. Three
// things cannot, because what they measure is what survives time:
//
// - **The last gate** of every plan (W4.1) — Recall on a concept, the
//   Crucible on a procedure or principle, Perform on a craft — opens a night
//   after the last thing studied on the node, so no node goes green on the
//   day it was learned. A "prove it" challenge is exempt: it claims the
//   material was known before this sitting, and a miss costs the attempt.
//
// - **Recall** is retrieval *without a cue*. Run minutes after the Crucible,
//   it reads short-term memory of the session the learner just finished — so
//   it opens a night after the node's last exposure, and a failed attempt
//   (which shows the rubric) pushes it out again.
// - **A scaffolded Crucible pass** was earned straight after the
//   re-explanation, on the guided rung. It closes the diagnosed gap, but the
//   proof is the cold, unguided problem the next day.
// - **Retained ✓** is durability. A card graded Good the afternoon it was
//   drafted says nothing about weeks; it has to survive a real interval.
//
// The holds live in the phase's own `phase_progress` slot (`{ opensAt }`), so
// they cost no column and survive the iOS client, which carries that object
// whole. Recall's slot is otherwise unused — it is never parked.

import { planGates, type PhaseId, type PhasesDoneMap } from "./phases";

/** "Tomorrow", as a duration: long enough to sleep on, short enough that a
 *  learner who studies at the same hour each day is not locked out by minutes. */
export const SPACING_MS = 20 * 60 * 60 * 1000;

/** What a held phase's slot says: when it opens, in epoch milliseconds. */
export interface SpacingHold {
  opensAt: number;
}

/** The hold on a phase slot, if one is still running at `now`. */
export function heldUntil(slot: unknown, now = Date.now()): number | null {
  const at = (slot as Partial<SpacingHold> | null | undefined)?.opensAt;
  return typeof at === "number" && at > now ? at : null;
}

/** A hold that opens one night from `now`. */
export function holdFrom(now = Date.now()): SpacingHold {
  return { opensAt: now + SPACING_MS };
}

/**
 * Which gate closing `phase` pushes a night out, if any (W4.1): the plan's
 * last gate — Recall where the plan has one, otherwise whatever proves the
 * node last — while it is still owed. Any exposure to the material counts, so
 * this is "a night after the last thing studied".
 */
export function heldGate(
  plan: readonly PhaseId[],
  done: PhasesDoneMap[string] | undefined,
  phase: PhaseId,
): PhaseId | null {
  const last = planGates(plan).at(-1);
  return last && phase !== last && !done?.includes(last) ? last : null;
}

/** Hours left on a hold, rounded up — what the toast names. */
export function hoursLeft(opensAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((opensAt - now) / 3_600_000));
}

/** The shortest interval a review must have survived to earn Retained ✓. */
export const RETAINED_MIN_DAYS = 7;

/**
 * Does this grade earn the node Retained ✓?
 *
 * Only a successful review of a card that went `RETAINED_MIN_DAYS` or longer
 * without being seen. The gap is measured from the card's last review, or from
 * its creation when it has never been reviewed (an unreviewed card's `due` is
 * the moment it was drafted).
 */
export function earnsRetained(
  grade: "again" | "hard" | "good" | "easy",
  fsrs: { last_review?: string; due: string; reps?: number },
  now = Date.now(),
): boolean {
  if (grade !== "good" && grade !== "easy") return false;
  const since = fsrs.last_review ?? (fsrs.reps ? undefined : fsrs.due);
  const at = since ? Date.parse(since) : NaN;
  return Number.isFinite(at) && now - at >= RETAINED_MIN_DAYS * 86_400_000;
}
