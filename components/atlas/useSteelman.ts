"use client";

// Steelman's wiring: opening it, submitting both cases, and leaving it.
//
// Its own hook on the `usePerform` precedent. It is entered from the node's
// plan, it judges two written cases plus the learner's disconfirmer in ONE
// call, and it exits to the map.
//
// One judge call, not two: the phase's whole standard is that the weaker side
// is judged by the same measure as the stronger one, and a judge shown both
// cases at once can actually apply that.

import { useCallback, useRef } from "react";
import {
  phaseLabel,
  steelmanPassed,
  steelmanReady,
  steelmanReducer,
  steelmanStart,
  type ConceptNode,
  type SteelmanAction,
  type SteelmanVerdict,
} from "@/lib/curriculum";
import { fetchJudgeSteelman } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useSteelman(deps: {
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
  const { graphRef, formRef, steelmanCacheRef } = run;
  const { setSteelman, steelmanRef } = sessions;
  const { generate, warmKey, loadSteelman } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterSteelman = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setSteelman(steelmanStart(node.id));
        setSelectedId(node.id);
        setScreen("steelman");
        markStarted(node);
        warmNext(node, "steelman");
      };
      if (steelmanCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("steelman", node.id),
        phaseLabel("steelman"),
        tc().findingDispute(node.label),
        () => loadSteelman(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadSteelman,
      setSteelman,
      steelmanCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchSteelman = (action: SteelmanAction) =>
    setSteelman((prev) => (prev ? steelmanReducer(prev, action) : prev));

  const steelmanSubmit = () => {
    const cur = steelmanRef.current;
    if (!cur || cur.done || judgingRef.current) return;
    const content = steelmanCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    if (!steelmanReady(cur, content)) {
      showToast(tc().bothCasesNeeded);
      return;
    }
    if (!cur.holds || !(cur.disconfirmer ?? "").trim()) {
      showToast(tc().disconfirmerNeeded);
      return;
    }
    setJudging(true);
    fetchJudgeSteelman({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      question: content.question,
      positions: content.positions.map((p) => ({ ...p })),
      cases: cur.cases,
      holds: cur.holds,
      answer: cur.disconfirmer ?? "",
      language: languageRef.current,
    })
      .then((j) => {
        const verdicts: Record<string, SteelmanVerdict> = {};
        for (const row of j.verdicts) verdicts[row.positionId] = row.verdict;
        dispatchSteelman({ type: "judged", verdicts, response: j.response });
      })
      .catch((err: unknown) =>
        showError(err, { context: "judge", retry: () => submitRef.current?.() }),
      )
      .finally(() => setJudging(false));
  };
  const submitRef = useRef(steelmanSubmit);
  submitRef.current = steelmanSubmit;

  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setSteelman(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  const advanceFromSteelman = () => {
    const cur = steelmanRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = steelmanCacheRef.current[cur.nodeId];
    if (node && content && steelmanPassed(cur, content)) completePhase(node, "steelman");
    leaveTo(cur.nodeId);
  };

  const exitSteelman = () => leaveTo(steelmanRef.current?.nodeId);

  return {
    enterSteelman,
    dispatchSteelman,
    steelmanSubmit,
    advanceFromSteelman,
    exitSteelman,
  };
}
