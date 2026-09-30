"use client";

// Perform's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades one case, carried out for real, and it exits to the map.

import { postAttempt, recordAttempt } from "@/lib/attempts";
import { useCallback, useRef } from "react";
import {
  phaseLabel,
  performBroken,
  performPassed,
  performReducer,
  performStart,
  type ConceptNode,
  type PerformAction,
  type PerformContent,
  type PerformSession,
  type TeachVerdict,
} from "@/lib/curriculum";
import { fetchJudgePerform } from "@/lib/api";
import { dropParked, parkedSession } from "@/components/atlas/phaseParking";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function usePerform(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  centerOn: (id: string) => void;
  later: (fn: () => void, ms: number) => void;
  languageRef: React.RefObject<Language>;
  judgingRef: React.RefObject<boolean>;
  setJudging: (v: boolean) => void;
}) {
  const {
    run,
    sessions,
    gen,
    toast,
    ledger,
    setSelectedId,
    setScreen,
    centerOn,
    later,
    languageRef,
    judgingRef,
    setJudging,
  } = deps;
  const { graphRef, formRef, performCacheRef, setPhaseProgress, phaseProgressRef } = run;
  const { setPerformCache } = run;
  const { setPerform, performRef } = sessions;
  const { generate, warmKey, loadPerform } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterPerform = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        // Their own work, if they left part-way through it. A run is long-form
        // — reopening a blank workspace for a case they already started is the
        // refresh deciding to throw it away.
        setPerform(
          parkedSession<PerformSession>(phaseProgressRef.current, node.id, "perform") ??
            performStart(node.id),
        );
        setSelectedId(node.id);
        setScreen("perform");
        markStarted(node);
        warmNext(node, "perform");
      };
      if (performCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("perform", node.id),
        phaseLabel("perform"),
        tc().settingCase(node.label),
        () => loadPerform(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadPerform,
      setPerform,
      performCacheRef,
      phaseProgressRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchPerform = (action: PerformAction) =>
    setPerform((prev) => (prev ? performReducer(prev, action) : prev));

  /**
   * Submit the run. The checker is given the case as well as the steps, so it
   * grades what the work produced *on this case* rather than whether the
   * method sounds right.
   */
  const performSubmit = () => {
    const cur = performRef.current;
    if (!cur || cur.reported || judgingRef.current) return;
    if (!cur.work.trim()) {
      showToast(tc().workspaceEmpty);
      return;
    }
    const content = performCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    setJudging(true);
    dispatchPerform({ type: "pending" });
    fetchJudgePerform({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      task: content.task,
      rubric: content.steps.map((st) => ({
        subPoint: st.step,
        mustConvey: st.mustShow,
      })),
      answer: cur.work,
      language: languageRef.current,
    })
      .then((j) => {
        const ran: Record<string, TeachVerdict> = {};
        const quotes: Record<string, string> = {};
        for (const row of j.verdicts) {
          const st = content.steps[row.i];
          if (!st) continue;
          ran[st.id] = row.verdict;
          if (row.quote) quotes[st.id] = row.quote;
        }
        dispatchPerform({ type: "report", response: j.response, ran, quotes });
      })
      .catch((err: unknown) =>
        showError(err, { context: "judge", retry: () => performSubmitRef.current?.() }),
      )
      .finally(() => setJudging(false));
  };
  const performSubmitRef = useRef(performSubmit);
  performSubmitRef.current = performSubmit;

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setPerform(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  performPassed's bar — reading the report is not passing the phase. */
  const advanceFromPerform = () => {
    const cur = performRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = performCacheRef.current[cur.nodeId];
    const passed = !!(node && content && performPassed(cur, content));
    if (content && !passed)
      recordAttempt({ nodeId: cur.nodeId, phase: "perform", passed: false });
    if (node && passed) {
      completePhase(node, "perform");
      // Only a run that actually closed the rung is forgotten. A failed one is
      // still the learner's work on a case they will be handed again, and
      // `exitPerform` keeps it for the same reason — a rung that did not close
      // is something to come back to, which is Crucible's rule too.
      dropParked(setPhaseProgress, cur.nodeId, "perform");
    }
    leaveTo(cur.nodeId);
  };

  /**
   * Run it again — on a new case (W1.4). Re-running the case whose report
   * just showed what was wrong tests reading the report, not the procedure.
   * The failed run is logged first, which is what bumps the server's `rerun`,
   * so the case that arrives is one this learner has not seen; the report
   * quotes where the last run broke.
   */
  const performRerun = () => {
    const cur = performRef.current;
    const node = cur && graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = cur && performCacheRef.current[cur.nodeId];
    if (!cur || !node || !content) return;
    const previous = performBroken(cur, content).map((s) => s.step);
    // The loader keeps a node's first case; this one replaces it.
    const open = (fresh: PerformContent) => {
      setPerformCache((p) => ({ ...p, [node.id]: fresh }));
      setPerform({ ...performStart(node.id), previous });
    };
    void postAttempt({ nodeId: node.id, phase: "perform", passed: false }).then(() =>
      generate(
        warmKey("perform", node.id),
        phaseLabel("perform"),
        tc().settingCase(node.label),
        () => loadPerform(node),
        open,
        true,
      ),
    );
  };

  const exitPerform = () => leaveTo(performRef.current?.nodeId);

  return {
    enterPerform,
    dispatchPerform,
    performSubmit,
    advanceFromPerform,
    performRerun,
    exitPerform,
  };
}
