"use client";

// Produce's wiring: opening it, judging one spoken turn at a time, and leaving.
//
// Its own hook on the `usePerform` precedent. Unlike Steelman's single call,
// this judges turn by turn — the learner has to hear how the last one landed
// before the next one is worth attempting, and a batch at the end would grade
// six turns the learner has already stopped thinking about.

import { useCallback, useRef } from "react";
import {
  phaseLabel,
  producePassed,
  produceReducer,
  produceStart,
  type ConceptNode,
  type ProduceAction,
} from "@/lib/curriculum";
import { fetchJudgeProduce } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useProduce(deps: {
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
  const { graphRef, formRef, produceCacheRef } = run;
  const { setProduce, produceRef } = sessions;
  const { generate, warmKey, loadProduce } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterProduce = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setProduce(produceStart(node.id));
        setSelectedId(node.id);
        setScreen("produce");
        markStarted(node);
        warmNext(node, "produce");
      };
      if (produceCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("produce", node.id),
        phaseLabel("produce"),
        tc().settingScene(node.label),
        () => loadProduce(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadProduce,
      setProduce,
      produceCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchProduce = (action: ProduceAction) =>
    setProduce((prev) => {
      if (!prev) return prev;
      const content = produceCacheRef.current[prev.nodeId];
      return content ? produceReducer(prev, action, content) : prev;
    });

  /** Send what they said for this turn. The transcript is the whole input —
   *  no audio leaves the browser, and the server never sees a recording. */
  const produceSubmit = (said: string) => {
    const cur = produceRef.current;
    if (!cur || judgingRef.current) return;
    const content = produceCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const turn = content?.turns[cur.index];
    if (!content || !node || !turn) return;
    if (!said.trim()) {
      showToast(tc().nothingHeard);
      return;
    }
    dispatchProduce({ type: "said", text: said });
    setJudging(true);
    fetchJudgeProduce({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      scene: content.scene,
      cue: turn.cue,
      targetForms: turn.targetForms,
      answer: said,
      language: languageRef.current,
    })
      .then((j) => dispatchProduce({ type: "judged", verdict: j.verdict, read: j.read }))
      .catch((err: unknown) =>
        showError(err, { context: "judge", retry: () => submitRef.current?.(said) }),
      )
      .finally(() => setJudging(false));
  };
  const submitRef = useRef(produceSubmit);
  submitRef.current = produceSubmit;

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setProduce(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  const advanceFromProduce = () => {
    const cur = produceRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = produceCacheRef.current[cur.nodeId];
    if (node && content && producePassed(cur, content)) completePhase(node, "produce");
    leaveTo(cur.nodeId);
  };

  const exitProduce = () => leaveTo(produceRef.current?.nodeId);

  return {
    enterProduce,
    dispatchProduce,
    produceSubmit,
    advanceFromProduce,
    exitProduce,
  };
}
