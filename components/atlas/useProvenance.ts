"use client";

// Provenance's wiring: opening it, ruling claims, and leaving it.
//
// Its own hook on the `usePerform` precedent — the spiral is one module because
// its phases transition into each other, and this one does not. It is entered
// from the node's plan, it rules a fixed set of claims against one source, and
// it exits to the map.
//
// There is no judge here at all. Every claim ships its own ruling, so the whole
// pass costs one generation and grades in the browser.

import { useCallback } from "react";
import {
  phaseLabel,
  provenancePassed,
  provenanceReducer,
  provenanceStart,
  type ConceptNode,
  type ProvenanceAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useProvenance(deps: {
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
  const { graphRef, provenanceCacheRef } = run;
  const { setProvenance, provenanceRef } = sessions;
  const { generate, warmKey, loadProvenance } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterProvenance = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setProvenance(provenanceStart(node.id));
        setSelectedId(node.id);
        setScreen("provenance");
        markStarted(node);
        warmNext(node, "provenance");
      };
      if (provenanceCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("provenance", node.id),
        phaseLabel("provenance"),
        tc().findingSource(node.label),
        () => loadProvenance(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadProvenance,
      setProvenance,
      provenanceCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchProvenance = (action: ProvenanceAction) =>
    setProvenance((prev) => {
      if (!prev) return prev;
      const content = provenanceCacheRef.current[prev.nodeId];
      return content ? provenanceReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setProvenance(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /** Leave the pass. The rung closes only on a run that cleared
   *  `provenancePassed` — reading the reveals is not passing the phase. */
  const advanceFromProvenance = () => {
    const cur = provenanceRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = provenanceCacheRef.current[cur.nodeId];
    if (node && content && provenancePassed(cur, content))
      completePhase(node, "provenance");
    leaveTo(cur.nodeId);
  };

  const exitProvenance = () => leaveTo(provenanceRef.current?.nodeId);

  return {
    enterProvenance,
    dispatchProvenance,
    advanceFromProvenance,
    exitProvenance,
  };
}
