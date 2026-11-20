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
import { recordAttempt } from "@/lib/attempts";
import {
  heldGate,
  heldUntil,
  holdFrom,
  ledgerAfter,
  openGapIds,
  phasePlan,
  planGates,
  proofGate,
  reasonAfter,
  stateFromPlan,
  type ConceptGraph,
  type ConceptNode,
  type PhaseId,
  type PhaseProgress,
  type PhasesDoneMap,
  type ProgressState,
  type ShakyReason,
  type StateMap,
} from "@/lib/curriculum";

export function usePhaseLedger(deps: {
  /** Read for the gaps still open under a node, which hold it off mastery.
   *  `attachGap` and `removeGapNode` write it through in the same tick, so a
   *  phase that spawns gaps and closes in one handler sees them. */
  graphRef: React.RefObject<ConceptGraph>;
  phasesDoneRef: React.MutableRefObject<PhasesDoneMap>;
  setPhasesDone: React.Dispatch<React.SetStateAction<PhasesDoneMap>>;
  shakyReasonsRef: React.MutableRefObject<Record<string, ShakyReason>>;
  setShakyReason: (id: string, reason: ShakyReason | null) => void;
  setStates: React.Dispatch<React.SetStateAction<StateMap>>;
  /** Where a spacing hold is written — the held phase's own slot. */
  setPhaseProgress: React.Dispatch<React.SetStateAction<Record<string, PhaseProgress>>>;
  /** Written through as well as set: a hand-off reads a hold in the same tick. */
  phaseProgressRef: React.MutableRefObject<Record<string, PhaseProgress>>;
  /** Pull the next phase's material forward while the learner is in this one.
   *  Retain is excluded because it has no per-node generation to pull: it is
   *  the shared review queue, warmed on its own schedule by `retainPlan`. */
  warmOne: (kind: Exclude<PhaseId, "retain">, node: ConceptNode) => void;
}) {
  const {
    graphRef,
    phasesDoneRef,
    setPhasesDone,
    shakyReasonsRef,
    setShakyReason,
    setStates,
    setPhaseProgress,
    phaseProgressRef,
    warmOne,
  } = deps;
  /** The node under a "prove it" challenge, if any. Session-only on purpose:
   *  a reload drops it, which fails safe — the attempt just credits itself. */
  const challengeRef = useRef<string | null>(null);

  /** Merge `fields` into one phase slot — through the ref as well as the
   *  state, because the hand-off after a phase closes reads it in this tick. */
  const patchSlot = useCallback(
    (id: string, phase: PhaseId, fields: object) => {
      const patch = (p: Record<string, PhaseProgress>) => ({
        ...p,
        [id]: { ...p[id], [phase]: { ...(p[id]?.[phase] as object), ...fields } },
      });
      phaseProgressRef.current = patch(phaseProgressRef.current);
      setPhaseProgress(patch);
    },
    [phaseProgressRef, setPhaseProgress],
  );
  /** Hold `phase` on this node for a night (`spacing.ts`). Merged into the
   *  slot, so a session parked there survives the wait. */
  const hold = useCallback(
    (id: string, phase: PhaseId) => patchSlot(id, phase, holdFrom()),
    [patchSlot],
  );
  /** End a hold early — a "prove it" challenge is exempt from the night. */
  const release = useCallback(
    (id: string, phase: PhaseId) => {
      if (heldUntil(phaseProgressRef.current[id]?.[phase]))
        patchSlot(id, phase, { opensAt: 0 });
    },
    [phaseProgressRef, patchSlot],
  );

  const gapsOf = useCallback(
    (id: string) => openGapIds(graphRef.current, id).length,
    [graphRef],
  );

  /**
   * A phase closed. Record it, and let mastery state fall out of the record —
   * which is returned, so a caller deciding "did that make it green?" asks the
   * same function the map does instead of re-deriving it without the gaps.
   *
   * `shaky` is passed when the phase closed on a failed gate, and `null` to
   * clear a reason the phase has now cleared. Left off, the node's existing
   * reason stands — see `reasonAfter` for the one clean close that clears it.
   *
   * Every close lands one row in the attempts log (W0.2), with the phase's own
   * `score` where it has one. A failed gate that closes nothing logs itself,
   * where it fails.
   */
  const completePhase = useCallback(
    (
      node: ConceptNode,
      phase: PhaseId,
      shaky?: ShakyReason | null,
      score?: number,
      /** A clean first try, which earns skips (`CREDITS`, W3.2). */
      clean = false,
    ): ProgressState => {
      const prev = phasesDoneRef.current[node.id] ?? [];
      const challenged = challengeRef.current === node.id;
      if (challenged) challengeRef.current = null; // one attempt, one verdict
      recordAttempt({
        nodeId: node.id,
        phase,
        passed: true,
        score,
        detail: {
          ...(shaky ? { shaky } : null),
          ...(challenged ? { challenged } : null),
          ...(clean ? { clean } : null),
        },
      });
      const plan = phasePlan(node);
      const done = ledgerAfter(plan, prev, phase, challenged, clean);
      // Written through the ref as well as the setter: the handlers below run
      // several of these in one tick, and each needs to see the last.
      phasesDoneRef.current = { ...phasesDoneRef.current, [node.id]: done };
      setPhasesDone((p) => ({ ...p, [node.id]: done }));
      // Anything studied on a node pushes its last gate a night out (W4.1):
      // the proof has to outlast the sitting it was learned in.
      const gate = heldGate(plan, done, phase);
      if (gate) hold(node.id, gate);
      const held = shakyReasonsRef.current[node.id];
      const reason = reasonAfter(plan, done, phase, shaky, held);
      if (held && !reason) setShakyReason(node.id, null);
      const state = stateFromPlan(plan, done, { shaky: reason, gaps: gapsOf(node.id) });
      setStates((p) => ({ ...p, [node.id]: state }));
      return state;
    },
    [
      phasesDoneRef,
      setPhasesDone,
      shakyReasonsRef,
      setShakyReason,
      setStates,
      gapsOf,
      hold,
    ],
  );

  /**
   * Re-read a node whose gaps changed with no phase closing — the last one
   * under it was just closed. Only a node that has finished its gates moves:
   * anywhere earlier, the next `completePhase` settles it anyway. Returns the
   * new state, or undefined when nothing was re-read.
   */
  const settle = useCallback(
    (node: ConceptNode): ProgressState | undefined => {
      const plan = phasePlan(node);
      const done = phasesDoneRef.current[node.id] ?? [];
      if (!planGates(plan).every((p) => done.includes(p))) return undefined;
      const shaky = shakyReasonsRef.current[node.id];
      const state = stateFromPlan(plan, done, { shaky, gaps: gapsOf(node.id) });
      setStates((p) => (p[node.id] === state ? p : { ...p, [node.id]: state }));
      return state;
    },
    [phasesDoneRef, shakyReasonsRef, setStates, gapsOf],
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
  const armChallenge = useCallback(
    (id: string) => {
      challengeRef.current = id;
      // The claim is that it was known before this sitting: the night a
      // studied gate waits does not apply to it (W4.1).
      const node = graphRef.current.nodes.find((n) => n.id === id);
      if (node) release(id, proofGate(phasePlan(node)));
    },
    [graphRef, release],
  );
  const disarmChallenge = useCallback(() => {
    challengeRef.current = null;
  }, []);

  return {
    completePhase,
    settle,
    gapsOf,
    hold,
    markStarted,
    warmNext,
    armChallenge,
    disarmChallenge,
  };
}
