"use client";

// Where a live session gets parked, so closing the tab is not a decision to
// throw the work away.
//
// The live session is the source of truth while it is open; these effects
// mirror it into the persisted per-node record that `useRunState` saves. An
// effect rather than a write on the way out, because "on the way out" is not
// the only way a pass ends — a closed tab, a refresh and a crash all end one
// too, and that is the whole reason any of this exists (`useSpiral` says the
// same thing above Consume's mirror).
//
// The four pre-catalogue phases each own a column and keep their own mirror
// below. Everything built after the catalogue parks by phase id in one
// `phase_progress` object, which is what `PhaseProgress` is for — so a phase
// arrives here as a key, not as a column plus a migration.
//
// Crucible and Perform are the two that had nothing: both hold long-form work
// the learner typed (`attempt`, `work`), both were held only in memory, and
// both were gone on a refresh. Drill and Recall deliberately stay unparked —
// they are timed, single-sitting rungs, and a resumed one would file a rep
// against a clock that stopped.

import { useEffect } from "react";
import type { PhaseId, PhaseProgress } from "@/lib/curriculum";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";

type SetPhaseProgress = RunState["setPhaseProgress"];

/** The session parked for one phase of one node, if there is one. `unknown` in
 *  the store because each phase's session shape is its own — the caller is the
 *  only thing that knows how to read its own slot back. */
export function parkedSession<T>(
  progress: Record<string, PhaseProgress>,
  nodeId: string,
  phase: PhaseId,
): T | undefined {
  return progress[nodeId]?.[phase] as T | undefined;
}

/** Forget the parked copy — the pass finished, so there is nothing to come
 *  back to. Leaving it would resume a rung the node has already closed. */
export function dropParked(
  setPhaseProgress: SetPhaseProgress,
  nodeId: string,
  phase: PhaseId,
): void {
  setPhaseProgress((prev) => {
    const forNode = prev[nodeId];
    if (!forNode || forNode[phase] === undefined) return prev;
    const { [phase]: _finished, ...rest } = forNode;
    return { ...prev, [nodeId]: rest };
  });
}

/** A state updater that forgets `id`, keeping identity when it isn't there. */
export const omitKey =
  (id: string) =>
  <T>(prev: Record<string, T>): Record<string, T> => {
    if (!(id in prev)) return prev;
    const { [id]: _gone, ...rest } = prev;
    return rest;
  };

/** Mirror one live session into its phase's slot. `skip` is how a pass caught
 *  mid-judgement keeps its last complete state instead of parking a spinner. */
function useParked(
  session: { nodeId: string } | null,
  phase: PhaseId,
  setPhaseProgress: SetPhaseProgress,
  skip = false,
): void {
  useEffect(() => {
    if (!session || skip) return;
    const { nodeId } = session;
    setPhaseProgress((prev) => {
      const forNode = prev[nodeId];
      // The reducer builds a new object per action, so identity is the honest
      // "nothing changed" test — and returning `prev` keeps a no-op off the
      // save debounce entirely.
      if (forNode?.[phase] === session) return prev;
      return { ...prev, [nodeId]: { ...forNode, [phase]: session } };
    });
  }, [session, phase, setPhaseProgress, skip]);
}

/** Every session mirror in the app, run once from `AtlasApp`. */
export function usePhaseParking(deps: { run: RunState; sessions: SessionState }): void {
  const { setPhaseProgress } = deps.run;
  const { perform } = deps.sessions;
  // The run, as they showed it — skipped while the checker has it.
  useParked(perform, "perform", setPhaseProgress, perform?.pending === true);
}
