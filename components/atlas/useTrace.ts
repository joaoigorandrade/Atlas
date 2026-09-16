"use client";

// Trace's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades one chain, walked a stage at a time, and it exits to the map.

import { useCallback } from "react";
import {
  phaseLabel,
  tracePassed,
  traceReducer,
  traceStart,
  type ConceptNode,
  type TraceAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useTrace(deps: {
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
  const { graphRef, traceCacheRef } = run;
  const { setTrace, traceRef } = sessions;
  const { generate, warmKey, loadTrace } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterTrace = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setTrace(traceStart(node.id));
        setSelectedId(node.id);
        setScreen("trace");
        markStarted(node);
        warmNext(node, "trace");
      };
      if (traceCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("trace", node.id),
        phaseLabel("trace"),
        tc().layingChain(node.label),
        () => loadTrace(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadTrace,
      setTrace,
      traceCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchTrace = (action: TraceAction) =>
    setTrace((prev) => {
      if (!prev) return prev;
      const content = traceCacheRef.current[prev.nodeId];
      return content ? traceReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setTrace(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  tracePassed's bar — reading the report is not passing the phase. */
  const advanceFromTrace = () => {
    const cur = traceRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = traceCacheRef.current[cur.nodeId];
    if (node && content && tracePassed(cur, content)) completePhase(node, "trace");
    leaveTo(cur.nodeId);
  };

  const exitTrace = () => leaveTo(traceRef.current?.nodeId);

  return {
    enterTrace,
    dispatchTrace,
    advanceFromTrace,
    exitTrace,
  };
}
