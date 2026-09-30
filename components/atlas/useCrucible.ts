"use client";

// The Crucible's wiring: opening it, grading an attempt, and what a pass means.
//
// Out of `useSpiral` on the `usePerform` precedent. The Crucible does hand the
// node on — to whatever its plan still owes — but it does so through one
// callback, `enterOwed`, so nothing else here needs the spiral's refs.
//
// Two passes, two meanings. A cold pass on the first rung closes the rung. A
// pass on the guided rung — the re-attempt right after the re-explanation —
// closes the gap it was aimed at and nothing more: the node stays Shaky, and
// the cold problem is parked to open a night later (`spacing.ts`). That is the
// attempt that proves it.

import { useCallback, useRef } from "react";
import {
  CONFIDENCE_FELT,
  crucibleReal,
  crucibleReducer,
  crucibleScaffolded,
  crucibleStart,
  heldUntil,
  holdFrom,
  hoursLeft,
  type ConceptNode,
  type CrucibleAction,
  type CrucibleSession,
  type GapSpec,
} from "@/lib/curriculum";
import { fetchJudgeCrucible } from "@/lib/api";
import { dropParked, parkedSession } from "@/components/atlas/phaseParking";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useCrucible(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  languageRef: React.RefObject<Language>;
  judgingRef: React.RefObject<boolean>;
  setJudging: (v: boolean) => void;
  /** Back to the map on this node — the spiral's own exit. */
  leaveTo: (nodeId: string | undefined) => void;
  /** Open whatever the node's plan still owes, else land on it. */
  enterOwed: (node: ConceptNode) => void;
  /** A node just went green: the day's winnable end. */
  litUp: (node: ConceptNode) => void;
}) {
  const { run, sessions, gen, toast, ledger, setSelectedId, setScreen } = deps;
  const { languageRef, judgingRef, setJudging, leaveTo, enterOwed, litUp } = deps;
  const { graphRef, formRef, crucibleCacheRef, setCrucibleCache } = run;
  const { phaseProgressRef, setPhaseProgress, setStates, setShakyReason } = run;
  const { recordCalib, attachGap, removeGapNode } = run;
  const { setCrucible, crucibleRef } = sessions;
  const { generate, warmKey, loadCrucible } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, disarmChallenge, gapsOf } = ledger;

  /**
   * Open the Crucible surface on a node, generating its transfer problem
   * first if needed. The session opens on the confidence gate — the
   * calibration hook that precedes the problem. A cold re-attempt still
   * waiting out its night says when it opens instead.
   */
  const enterCrucible = useCallback(
    (node: ConceptNode) => {
      const parked = parkedSession<CrucibleSession>(
        phaseProgressRef.current,
        node.id,
        "crucible",
      );
      const until = heldUntil(parked);
      if (until) {
        // Reached from hand-offs and the calibration screen as well as the
        // map, so it lands on the map whichever way it came.
        setScreen("map");
        setSelectedId(node.id);
        showToast(tc().crucibleHeld(node.label, hoursLeft(until)));
        return;
      }
      const open = () => {
        // A parked attempt is the learner's own writing — reopen it rather
        // than handing them a blank workspace for a problem they started.
        setCrucible(parked ? { ...parked, opensAt: undefined } : crucibleStart(node.id));
        setSelectedId(node.id);
        setScreen("crucible");
      };
      if (crucibleCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("crucible", node.id),
        tc().kickerCrucible,
        tc().forgingProblem(node.label),
        () => loadCrucible(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadCrucible,
      setCrucible,
      crucibleCacheRef,
      phaseProgressRef,
      warmKey,
      setScreen,
      setSelectedId,
      showToast,
    ],
  );

  const dispatchCrucible = (action: CrucibleAction) => {
    setCrucible((prev) => {
      if (!prev) return prev;
      const content = crucibleCacheRef.current[prev.nodeId];
      if (!content) return prev;
      return crucibleReducer(prev, action, content);
    });
  };

  /**
   * Submitting an attempt. An empty workspace isn't diagnostic — nudge instead.
   * A first-rung failure is precise: it spawns its named sub-concept as a red
   * Gap node under the parent and flips the parent Shaky. The stated
   * confidence, held against how much of the attempt transferred, becomes a
   * live calibration reading.
   */
  const crucibleSubmit = () => {
    const cur = crucibleRef.current;
    if (!cur || cur.submitted || judgingRef.current) return;
    if (!cur.attempt.trim()) {
      showToast(tc().workspaceEmpty);
      return;
    }
    const content = crucibleCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    const problem = content.problems[Math.min(cur.rung, content.problems.length - 1)];
    // The judge grades the REAL attempt (#27): pass/partial is earned, the
    // diagnostic quotes their work, and a failure names the actual gap.
    setJudging(true);
    // The worst wait in the app. `outcome` is one word and arrives on its own
    // frame, so the result panel opens on it and the three diagnostic rows
    // land into an already-open panel.
    let applied = false;
    const apply = (action: CrucibleAction) =>
      setCrucible((prev) =>
        prev?.nodeId === cur.nodeId ? crucibleReducer(prev, action, content) : prev,
      );
    fetchJudgeCrucible(
      {
        topic: formRef.current.topic,
        nodeLabel: node.label,
        problem: problem.q,
        hint: problem.hint,
        answer: cur.attempt,
        language: languageRef.current,
      },
      (partial) => {
        if (!partial.outcome) return;
        applied = true;
        apply({ type: "result", outcome: partial.outcome, transfer: [] });
      },
    )
      .then((j) => {
        apply(
          applied
            ? { type: "transfer", transfer: j.transfer }
            : { type: "result", outcome: j.outcome, transfer: j.transfer },
        );
        if (cur.conf !== null)
          recordCalib(
            cur.nodeId,
            CONFIDENCE_FELT[cur.conf],
            crucibleReal(j.outcome, j.transfer),
          );
        if (j.outcome !== "partial") return;
        disarmChallenge(); // a scaffolded re-attempt is not a cold pass
        // The judged gap replaces the pre-generated one when the judge named
        // a different missing sub-concept.
        const gap: GapSpec =
          j.gapLabel && j.gapReason
            ? { ...content.gap, label: j.gapLabel, reason: j.gapReason }
            : content.gap;
        if (j.gapLabel)
          setCrucibleCache((prev) => ({
            ...prev,
            [cur.nodeId]: {
              ...content,
              gap,
              reExplain: j.reExplain ?? content.reExplain,
            },
          }));
        setStates((prev) => ({ ...prev, [node.id]: "shaky" }));
        setShakyReason(node.id, "crucible-fail");
        if (attachGap(node.id, gap))
          showToast(tc().transferBroke(gap.label, node.label), tc().mapUpdated);
      })
      .catch((err: unknown) =>
        showError(err, {
          context: "judge",
          retry: () => crucibleSubmitRef.current?.(),
        }),
      )
      .finally(() => setJudging(false));
  };
  const crucibleSubmitRef = useRef(crucibleSubmit);
  crucibleSubmitRef.current = crucibleSubmit;

  /**
   * The transfer held. Either way the gap this Crucible diagnosed is resolved
   * and leaves the map. What else the pass means depends on the rung it came
   * on — see the header.
   */
  const advanceFromCrucible = () => {
    const cur = crucibleRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const gapId = crucibleCacheRef.current[cur.nodeId]?.gap.id;
    if (gapId) removeGapNode(gapId);
    setCrucible(null);
    if (!node) return leaveTo(undefined);
    if (crucibleScaffolded(cur)) {
      // Closed with help. The node stays Shaky on its `crucible-fail` reason,
      // and the cold problem waits out the night in the rung's own slot.
      setPhaseProgress((p) => ({
        ...p,
        [node.id]: {
          ...p[node.id],
          crucible: { ...crucibleStart(node.id), ...holdFrom() },
        },
      }));
      leaveTo(node.id);
      showToast(tc().guidedPass(node.label));
      return;
    }
    // A cold pass: the rung closes, and what that makes the node is the
    // ledger's call — which also counts any gap still open under it.
    setShakyReason(node.id, null);
    const state = completePhase(node, "crucible", null);
    // The rung is closed — a re-entry must open a fresh problem, not the
    // attempt that passed.
    dropParked(setPhaseProgress, node.id, "crucible");
    // A `concept` still owes Recall: green, the toast and the streak wait for it.
    if (state !== "mastered") {
      const gaps = gapsOf(node.id);
      if (gaps) showToast(tc().gapsHold(node.label, gaps));
      return enterOwed(node);
    }
    leaveTo(node.id);
    litUp(node);
    showToast(tc().transferConfirmed(node.label));
  };

  const exitCrucible = () => {
    leaveTo(crucibleRef.current?.nodeId);
    setCrucible(null);
  };

  return {
    enterCrucible,
    dispatchCrucible,
    crucibleSubmit,
    advanceFromCrucible,
    exitCrucible,
  };
}
