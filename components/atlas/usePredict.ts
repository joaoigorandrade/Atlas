"use client";

// Predict's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades a forecast committed before the outcome is shown, and it exits to the map.

import { useCallback } from "react";
import {
  phaseLabel,
  predictPassed,
  predictReducer,
  predictStart,
  type ConceptNode,
  type PredictAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function usePredict(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  centerOn: (id: string) => void;
  later: (fn: () => void, ms: number) => void;
}) {
  const { run, sessions, gen, toast, ledger, setSelectedId, setScreen, centerOn, later } =
    deps;
  const { graphRef, predictCacheRef } = run;
  const { setPredict, predictRef } = sessions;
  const { generate, warmKey, loadPredict } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterPredict = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setPredict(predictStart(node.id));
        setSelectedId(node.id);
        setScreen("predict");
        markStarted(node);
        warmNext(node, "predict");
      };
      if (predictCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("predict", node.id),
        phaseLabel("predict"),
        tc().settingUpForecast(node.label),
        () => loadPredict(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadPredict,
      setPredict,
      predictCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchPredict = (action: PredictAction) =>
    setPredict((prev) => {
      if (!prev) return prev;
      const content = predictCacheRef.current[prev.nodeId];
      return content ? predictReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setPredict(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  predictPassed's bar — reading the report is not passing the phase. */
  const advanceFromPredict = () => {
    const cur = predictRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = predictCacheRef.current[cur.nodeId];
    if (node && content && predictPassed(cur, content)) completePhase(node, "predict");
    leaveTo(cur.nodeId);
  };

  const exitPredict = () => leaveTo(predictRef.current?.nodeId);

  return {
    enterPredict,
    dispatchPredict,
    advanceFromPredict,
    exitPredict,
  };
}
