"use client";

// The phase ledger: the record of what a learner has finished on each node,
// and the mastery state derived from it.
//
// This is the inversion, and it is its own module for two reasons. It is the
// one piece of `useSpiral` that is pure bookkeeping rather than a surface, and
// every phase handler calls into it from inside a `useCallback` — so each
// function here has to be stable, and a stable identity is easier to guarantee
// in one small file than among two thousand lines of session logic.
//
// What it replaced: six handlers each writing their own mastery literal —
// `learning` on leaving a reading pass, `shaky` after Connect, `mastered` in
// exactly one place after Crucible. That is why every node on every map ran
// the same six rungs, and why a plan without a Crucible in it could never go
// green.

import { useCallback, useRef } from "react";
import {
  ledgerAfter,
  phasePlan,
  stateFromPlan,
  type ConceptNode,
  type PhaseId,
  type PhasesDoneMap,
  type ShakyReason,
  type StateMap,
} from "@/lib/curriculum";

export function usePhaseLedger(deps: {
  phasesDoneRef: React.MutableRefObject<PhasesDoneMap>;
  setPhasesDone: React.Dispatch<React.SetStateAction<PhasesDoneMap>>;
  shakyReasonsRef: React.MutableRefObject<Record<string, ShakyReason>>;
  setStates: React.Dispatch<React.SetStateAction<StateMap>>;
  /** Pull the next phase's material forward while the learner is in this one.
   *  Retain is excluded because it has no per-node generation to pull: it is
   *  the shared review queue, warmed on its own schedule by `retainPlan`. */
  warmOne: (kind: Exclude<PhaseId, "retain">, node: ConceptNode) => void;
}) {
  const { phasesDoneRef, setPhasesDone, shakyReasonsRef, setStates, warmOne } = deps;
  /** The node under a "prove it" challenge, if any. Session-only on purpose:
   *  a reload drops it, which fails safe — the attempt just credits itself. */
  const challengeRef = useRef<string | null>(null);

  /**
   * A phase closed. Record it, and let mastery state fall out of the record.
   *
   * `shaky` is passed when the phase closed on a failed gate, and `null` to
   * clear a reason the phase has now cleared. Left off, the node's existing
   * reason stands — so re-doing an unrelated phase can't silently promote a
   * node past a Crucible it is still failing.
   */
  const completePhase = useCallback(
    (node: ConceptNode, phase: PhaseId, shaky?: ShakyReason | null) => {
      const prev = phasesDoneRef.current[node.id] ?? [];
      const challenged = challengeRef.current === node.id;
      if (challenged) challengeRef.current = null; // one attempt, one verdict
      const done = ledgerAfter(phasePlan(node), prev, phase, challenged);
      // Written through the ref as well as the setter: the handlers below run
      // several of these in one tick, and each needs to see the last.
      phasesDoneRef.current = { ...phasesDoneRef.current, [node.id]: done };
      setPhasesDone((p) => ({ ...p, [node.id]: done }));
      const reason =
        shaky === null ? undefined : (shaky ?? shakyReasonsRef.current[node.id]);
      setStates((p) => ({
        ...p,
        [node.id]: stateFromPlan(phasePlan(node), done, { shaky: reason }),
      }));
    },
    [phasesDoneRef, setPhasesDone, shakyReasonsRef, setStates],
  );

  /** Mark work begun on a node that has finished no phase yet — a part-read
   *  reading pass. Without it, two sections in reads as "never started". */
  const markStarted = useCallback(
    (node: ConceptNode) => {
      setStates((p) =>
        p[node.id] === "unknown" || p[node.id] === undefined
          ? {
              ...p,
              [node.id]: stateFromPlan(phasePlan(node), phasesDoneRef.current[node.id], {
                started: true,
              }),
            }
          : p,
      );
    },
    [phasesDoneRef, setStates],
  );

  /**
   * Opening a phase warms the one after it in this node's plan — reading takes
   * minutes, and the questioning pass behind it can be written in that time.
   *
   * The hand-offs used to be four hard-coded pairs, which is why the chain
   * stopped dead at Crucible. Following the plan means it no longer can.
   */
  const warmNext = useCallback(
    (node: ConceptNode, phase: PhaseId) => {
      const plan = phasePlan(node);
      const next = plan[plan.indexOf(phase) + 1];
      // Retain is the shared review queue, warmed on its own schedule by
      // `retainPlan` — there is no per-node retain generation to pull forward.
      if (next && next !== "retain") warmOne(next, node);
    },
    [warmOne],
  );

  /** "I already know this": the next close of this node's proof gate credits
   *  the whole plan (`ledgerAfter`). Any ordinary entry disarms it, and so does
   *  a failed first attempt — only a cold pass is proof. */
  const armChallenge = useCallback((id: string) => {
    challengeRef.current = id;
  }, []);
  const disarmChallenge = useCallback(() => {
    challengeRef.current = null;
  }, []);

  return { completePhase, markStarted, warmNext, armChallenge, disarmChallenge };
}
