"use client";

// Perform's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades one case, carried out for real, and it exits to the map.

import { useCallback, useRef } from "react";
import {
  phaseLabel,
  performPassed,
  performReducer,
  performStart,
  type ConceptNode,
  type PerformAction,
  type TeachVerdict,
} from "@/lib/curriculum";
import { fetchJudgePerform } from "@/lib/api";
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
  const { graphRef, formRef, performCacheRef } = run;
  const { setPerform, performRef } = sessions;
  const { generate, warmKey, loadPerform } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterPerform = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setPerform(performStart(node.id));
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
    if (node && content && performPassed(cur, content)) completePhase(node, "perform");
    leaveTo(cur.nodeId);
  };

  const exitPerform = () => leaveTo(performRef.current?.nodeId);

  return {
    enterPerform,
    dispatchPerform,
    performSubmit,
    advanceFromPerform,
    exitPerform,
  };
}
