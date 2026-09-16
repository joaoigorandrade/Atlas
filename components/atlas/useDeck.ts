"use client";

// The deck family · Discriminate (and Predict · Trace · Drill, as they land).
//
// Its own hook for the reason `useRecite` is: the spiral is one module because
// its phases transition into each other, and this family does not. It is
// entered from the plan, it runs a handful of items, and it exits to the map.
//
// One hook for the whole family. The differences between its phases are in
// what the items ARE — the generator's brief — and in how the deck presents
// them (`DECK_SHAPE`), never in this.

import { useCallback } from "react";
import {
  deckPassed,
  deckReducer,
  deckStart,
  phaseLabel,
  type ConceptNode,
  type DeckAction,
  type DeckPhase,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useDeck(deps: {
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
  const { graphRef, deckCacheRef } = run;
  const { setDeck, deckRef } = sessions;
  const { generate, warmKey, loadDeck } = gen;
  const { tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterDeck = useCallback(
    (node: ConceptNode, phase: DeckPhase) => {
      const open = () => {
        setDeck(deckStart(node.id, phase));
        setSelectedId(node.id);
        setScreen(phase);
        markStarted(node);
        warmNext(node, phase);
      };
      if (deckCacheRef.current[`${phase}:${node.id}`]) {
        open();
        return;
      }
      generate(
        warmKey(phase, node.id),
        phaseLabel(phase),
        tc().sortingCases(node.label),
        () => loadDeck(node, phase),
        open,
      );
    },
    [
      tc,
      generate,
      loadDeck,
      setDeck,
      deckCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchDeck = (action: DeckAction) =>
    setDeck((prev) => {
      if (!prev) return prev;
      const content = deckCacheRef.current[`${prev.phase}:${prev.nodeId}`];
      return content ? deckReducer(prev, action, content) : prev;
    });

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setDeck(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /**
   * Leave the run. The rung closes only on a run that actually cleared the
   * bar — leaving early, or getting most of them wrong, is a pass through the
   * screen rather than a pass of the phase.
   */
  const advanceFromDeck = () => {
    const cur = deckRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = deckCacheRef.current[`${cur.phase}:${cur.nodeId}`];
    if (node && content && deckPassed(cur, content)) completePhase(node, cur.phase);
    leaveTo(cur.nodeId);
  };

  const exitDeck = () => leaveTo(deckRef.current?.nodeId);

  return { enterDeck, dispatchDeck, advanceFromDeck, exitDeck };
}
