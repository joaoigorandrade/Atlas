"use client";

// Recall's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades a blank page and what comes back unaided, and it exits to the map.

import { useCallback, useRef } from "react";
import {
  phaseLabel,
  recallPassed,
  recallReducer,
  recallStart,
  type ConceptNode,
  type RecallAction,
  type TeachVerdict,
} from "@/lib/curriculum";
import { fetchJudgeRecall } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useRecall(deps: {
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
  const { graphRef, formRef, recallCacheRef } = run;
  const { setRecall, recallRef } = sessions;
  const { generate, warmKey, loadRecall } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterRecall = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setRecall(recallStart(node.id));
        setSelectedId(node.id);
        setScreen("recall");
        markStarted(node);
        warmNext(node, "recall");
      };
      if (recallCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("recall", node.id),
        phaseLabel("recall"),
        tc().blankPage(node.label),
        () => loadRecall(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadRecall,
      setRecall,
      recallCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchRecall = (action: RecallAction) =>
    setRecall((prev) => (prev ? recallReducer(prev, action) : prev));

  /**
   * Submit the blank page. The judge diffs it against a rubric the learner was
   * never shown, and is told whether they took the cue — a cued retrieval is a
   * different reading than an unaided one and the reaction has to say so.
   */
  const recallSubmit = () => {
    const cur = recallRef.current;
    if (!cur || cur.reported || judgingRef.current) return;
    if (!cur.written.trim()) {
      showToast(tc().workspaceEmpty);
      return;
    }
    const content = recallCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    setJudging(true);
    dispatchRecall({ type: "pending" });
    fetchJudgeRecall({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      brief: content.brief,
      cued: cur.cued,
      rubric: content.rubric.map((r) => ({
        subPoint: r.point,
        mustConvey: r.mustRetrieve,
      })),
      answer: cur.written,
      language: languageRef.current,
    })
      .then((j) => {
        // The judge rules by rubric index; the session keys by row id. Joined
        // here rather than anywhere a renderer can see it.
        const retrieved: Record<string, TeachVerdict> = {};
        const quotes: Record<string, string> = {};
        for (const row of j.verdicts) {
          const r = content.rubric[row.i];
          if (!r) continue;
          retrieved[r.id] = row.verdict;
          if (row.quote) quotes[r.id] = row.quote;
        }
        dispatchRecall({ type: "report", response: j.response, retrieved, quotes });
      })
      .catch((err: unknown) =>
        showError(err, { context: "judge", retry: () => recallSubmitRef.current?.() }),
      )
      .finally(() => setJudging(false));
  };
  const recallSubmitRef = useRef(recallSubmit);
  recallSubmitRef.current = recallSubmit;

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setRecall(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  recallPassed's bar — reading the report is not passing the phase. */
  const advanceFromRecall = () => {
    const cur = recallRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = recallCacheRef.current[cur.nodeId];
    if (node && content && recallPassed(cur, content)) completePhase(node, "recall");
    leaveTo(cur.nodeId);
  };

  const exitRecall = () => leaveTo(recallRef.current?.nodeId);

  return {
    enterRecall,
    dispatchRecall,
    recallSubmit,
    advanceFromRecall,
    exitRecall,
  };
}
