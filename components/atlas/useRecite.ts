"use client";

// The recite family · Recall (and Perform, when it ships).
//
// Its own hook rather than another 130 lines of `useSpiral`, for the reason
// `phaseLedger` is its own module: the spiral is one state machine because its
// phases transition *into each other* — Feynman's advance opens Connect, a
// failed Crucible re-plans the map and routes back into Socratic. This family
// does none of that. It is entered from the plan, it grades an answer, and it
// exits to the map. Nothing else reaches into it, so nothing is served by
// having it share a two-thousand-line file with the surfaces that do.
//
// One hook for the whole family, not one per phase: Recall and Perform differ
// in their brief and their rubric, never in what the learner does. The session
// carries `phase`, and every cache address is keyed by it.

import { useCallback, useRef } from "react";
import {
  phaseLabel,
  recitePassed,
  reciteReducer,
  reciteStart,
  type ConceptNode,
  type ReciteAction,
  type RecitePhase,
  type TeachVerdict,
} from "@/lib/curriculum";
import { fetchJudgeRecite } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";

export function useRecite(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  languageRef: React.RefObject<Language>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  centerOn: (id: string) => void;
  later: (fn: () => void, ms: number) => void;
  judgingRef: React.RefObject<boolean>;
  setJudging: (v: boolean) => void;
}) {
  const {
    run,
    sessions,
    gen,
    toast,
    ledger,
    languageRef,
    setSelectedId,
    setScreen,
    centerOn,
    later,
    judgingRef,
    setJudging,
  } = deps;
  const { graphRef, formRef, reciteCacheRef } = run;
  const { setRecite, reciteRef } = sessions;
  const { generate, warmKey, loadRecite } = gen;
  const { showToast, showError, tc } = toast;
  const { completePhase, markStarted, warmNext } = ledger;

  const enterRecite = useCallback(
    (node: ConceptNode, phase: RecitePhase) => {
      const open = () => {
        setRecite(reciteStart(node.id, phase));
        setSelectedId(node.id);
        setScreen(phase);
        markStarted(node);
        warmNext(node, phase);
      };
      if (reciteCacheRef.current[`${phase}:${node.id}`]) {
        open();
        return;
      }
      generate(
        warmKey(phase, node.id),
        phaseLabel(phase),
        tc().writingPass(node.label),
        () => loadRecite(node, phase),
        open,
      );
    },
    [
      tc,
      generate,
      loadRecite,
      setRecite,
      reciteCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
      markStarted,
      warmNext,
    ],
  );

  const dispatchRecite = (action: ReciteAction) =>
    setRecite((prev) => (prev ? reciteReducer(prev, action) : prev));

  /**
   * Submit the blank page. The judge diffs it against a rubric the learner was
   * never shown — the same verdict rows the Feynman report renders, because a
   * rubric diff is a rubric diff.
   */
  const reciteSubmit = () => {
    const cur = reciteRef.current;
    if (!cur || cur.reported || judgingRef.current) return;
    if (!cur.answer.trim()) {
      showToast(tc().workspaceEmpty);
      return;
    }
    const content = reciteCacheRef.current[`${cur.phase}:${cur.nodeId}`];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    setJudging(true);
    dispatchRecite({ type: "pending" });
    fetchJudgeRecite({
      frame: cur.phase,
      topic: formRef.current.topic,
      nodeLabel: node.label,
      brief: content.brief,
      rubric: content.rubric.map((r) => ({
        subPoint: r.point,
        mustConvey: r.mustConvey,
      })),
      answer: cur.answer,
      language: languageRef.current,
    })
      .then((j) => {
        // The judge answers by rubric index; the session keys by row id, so
        // the two are joined here rather than anywhere a renderer can see it.
        const verdicts: Record<string, TeachVerdict> = {};
        const quotes: Record<string, string> = {};
        for (const row of j.verdicts) {
          const rubricRow = content.rubric[row.i];
          if (!rubricRow) continue;
          verdicts[rubricRow.id] = row.verdict;
          if (row.quote) quotes[rubricRow.id] = row.quote;
        }
        dispatchRecite({ type: "report", response: j.response, verdicts, quotes });
      })
      .catch((err: unknown) =>
        showError(err, { context: "judge", retry: () => reciteSubmitRef.current?.() }),
      )
      .finally(() => setJudging(false));
  };
  const reciteSubmitRef = useRef(reciteSubmit);
  reciteSubmitRef.current = reciteSubmit;

  /** Back to the map, landing on the node. */
  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    setRecite(null);
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  /**
   * Leave the pass. The rung closes only when the answer actually cleared the
   * rubric — a report the learner read is not a rung they passed, and this is
   * the only gate in the family, so a generous exit here would let a node go
   * green on a blank page plus a click.
   */
  const advanceFromRecite = () => {
    const cur = reciteRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const content = reciteCacheRef.current[`${cur.phase}:${cur.nodeId}`];
    if (node && content && recitePassed(cur, content)) completePhase(node, cur.phase);
    leaveTo(cur.nodeId);
  };

  const exitRecite = () => leaveTo(reciteRef.current?.nodeId);

  return {
    enterRecite,
    dispatchRecite,
    reciteSubmit,
    advanceFromRecite,
    exitRecite,
  };
}
