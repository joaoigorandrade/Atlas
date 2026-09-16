"use client";

// Drill's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades the same call, timed, and it exits to the map.

import { useCallback } from "react";
import {
  phaseLabel,
  drillPassed,
  drillReducer,
  drillStart,
  type ConceptNode,
  type DrillAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useDrill(deps: {
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
  const { graphRef, drillCacheRef } = run;
  const { setDrill, drillRef } = sessions;
  const { generate, warmKey, loadDrill } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterDrill = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setDrill(drillStart(node.id));
        setSelectedId(node.id);
        setScreen("drill");
        markStarted(node);
        warmNext(node, "drill");
      };
      if (drillCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("drill", node.id),
        phaseLabel("drill"),
        tc().rackingReps(node.label),
        () => loadDrill(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadDrill,
      setDrill,
      drillCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchDrill = (action: DrillAction) =>
    setDrill((prev) => {
      if (!prev) return prev;
      const content = drillCacheRef.current[prev.nodeId];
      return content ? drillReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setDrill(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  drillPassed's bar — reading the report is not passing the phase. */
  const advanceFromDrill = () => {
    const cur = drillRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = drillCacheRef.current[cur.nodeId];
    if (node && content && drillPassed(cur, content)) completePhase(node, "drill");
    leaveTo(cur.nodeId);
  };

  const exitDrill = () => leaveTo(drillRef.current?.nodeId);

  return {
    enterDrill,
    dispatchDrill,
    advanceFromDrill,
    exitDrill,
  };
}
