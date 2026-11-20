"use client";

// Explain's wiring: opening it, revealing the model, checking the reply, and
// moving on.
//
// Its own hook on the `useDiscriminate` precedent. Unlike Discriminate it does
// not exit to the map: it sits straight behind the reading, so finishing it
// hands off to whatever the plan owes next (`enterOwed`) — the learner is mid
// sitting, not done with the node.

import { useCallback } from "react";
import {
  explainPassed,
  explainReducer,
  explainScore,
  explainStart,
  phaseLabel,
  type ConceptNode,
  type ExplainAction,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useExplain(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  centerOn: (id: string) => void;
  later: (fn: () => void, ms: number) => void;
  enterOwed: (node: ConceptNode) => void;
}) {
  const { run, sessions, gen, toast, ledger, setSelectedId, setScreen } = deps;
  const { centerOn, later, enterOwed } = deps;
  const { graphRef, explainCacheRef } = run;
  const { setExplain, explainRef } = sessions;
  const { generate, warmKey, loadExplain } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterExplain = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setExplain(explainStart(node.id));
        setSelectedId(node.id);
        setScreen("explain");
        markStarted(node);
        warmNext(node, "explain");
      };
      if (explainCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("explain", node.id),
        phaseLabel("explain"),
        tc().draftingExplanation(node.label),
        () => loadExplain(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadExplain,
      setExplain,
      explainCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchExplain = (action: ExplainAction) =>
    setExplain((prev) => {
      if (!prev) return prev;
      const content = explainCacheRef.current[prev.nodeId];
      return content ? explainReducer(prev, action, content) : prev;
    });

  /** Finish: close the rung on a found reply, then on to the owed phase. */
  const advanceFromExplain = () => {
    const cur = explainRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    setExplain(null);
    if (!node) return setScreen("map");
    if (explainPassed(cur)) {
      completePhase(node, "explain", undefined, explainScore(cur), !cur.tried.length);
      return enterOwed(node);
    }
    setScreen("map");
  };

  const exitExplain = () => {
    const id = explainRef.current?.nodeId;
    setScreen("map");
    setExplain(null);
    if (!id) return;
    setSelectedId(id);
    later(() => centerOn(id), 30);
  };

  return { enterExplain, dispatchExplain, advanceFromExplain, exitExplain };
}
