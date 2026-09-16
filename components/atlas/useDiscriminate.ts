"use client";

// Discriminate's wiring: opening it, running it, and leaving it.
//
// Its own hook rather than more of `useSpiral`, on the `phaseLedger`
// precedent: the spiral is one module because its phases transition *into
// each other*, and this one does not. It is entered from the node's plan, it
// grades the boundary between this concept and its neighbours, and it exits to the map.

import { useCallback } from "react";
import {
  phaseLabel,
  discriminatePassed,
  discriminateReducer,
  discriminateStart,
  type ConceptNode,
  type DiscriminateAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useDiscriminate(deps: {
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
  const { graphRef, discriminateCacheRef } = run;
  const { setDiscriminate, discriminateRef } = sessions;
  const { generate, warmKey, loadDiscriminate } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterDiscriminate = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setDiscriminate(discriminateStart(node.id));
        setSelectedId(node.id);
        setScreen("discriminate");
        markStarted(node);
        warmNext(node, "discriminate");
      };
      if (discriminateCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("discriminate", node.id),
        phaseLabel("discriminate"),
        tc().sortingCases(node.label),
        () => loadDiscriminate(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadDiscriminate,
      setDiscriminate,
      discriminateCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchDiscriminate = (action: DiscriminateAction) =>
    setDiscriminate((prev) => {
      if (!prev) return prev;
      const content = discriminateCacheRef.current[prev.nodeId];
      return content ? discriminateReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setDiscriminate(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that actually cleared
   *  discriminatePassed's bar — reading the report is not passing the phase. */
  const advanceFromDiscriminate = () => {
    const cur = discriminateRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = discriminateCacheRef.current[cur.nodeId];
    if (node && content && discriminatePassed(cur, content))
      completePhase(node, "discriminate");
    leaveTo(cur.nodeId);
  };

  const exitDiscriminate = () => leaveTo(discriminateRef.current?.nodeId);

  return {
    enterDiscriminate,
    dispatchDiscriminate,
    advanceFromDiscriminate,
    exitDiscriminate,
  };
}
