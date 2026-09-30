"use client";

// Feynman's wiring: opening the teach-back, grading it against the rubric, and
// writing its gaps back to the map. Out of `useSpiral` on the `useCrucible`
// precedent (W1.0): it hands the node on through one callback, `enterOwed`,
// so nothing else here needs the spiral's refs.

import { useCallback, useRef } from "react";
import {
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  type ConceptNode,
  type FeynmanAction,
  type FeynmanBeat,
  type TeachVerdict,
} from "@/lib/curriculum";
import { fetchFeynmanStream, fetchJudgeFeynman, type FeynmanJudgement } from "@/lib/api";
import { omitKey } from "@/components/atlas/phaseParking";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { Generation } from "@/components/atlas/useGeneration";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { usePhaseLedger } from "@/components/atlas/phaseLedger";
import type { createWarmQueue } from "@/lib/warm";

export function useFeynman(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  ledger: ReturnType<typeof usePhaseLedger>;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  languageRef: React.RefObject<Language>;
  judgingRef: React.RefObject<boolean>;
  setJudging: (v: boolean) => void;
  warm: ReturnType<typeof createWarmQueue>;
  loadingRef: React.RefObject<{ phase: string; message: string } | null>;
  /** Back to the map on this node — the spiral's own exit. */
  leaveTo: (nodeId: string | undefined) => void;
  /** Open whatever the node's plan still owes, else land on it. */
  enterOwed: (node: ConceptNode) => void;
  /** File a confusion the learner voiced into misconception memory. */
  fileMisconception: (label: string, nodeLabel: string) => void;
}) {
  const { run, sessions, gen, toast, ledger, setSelectedId, setScreen } = deps;
  const { languageRef, judgingRef, setJudging, warm, loadingRef } = deps;
  const { leaveTo, enterOwed, fileMisconception } = deps;
  const { graphRef, formRef, setStates, attachGap } = run;
  const { feynmanCacheRef, setFeynmanCache, feynmanProgressRef, setFeynmanProgress } =
    run;
  const { feynman, setFeynman, feynmanRef, setLiveFeynman, liveFeynmanRef } = sessions;
  const { generate, warmKey, feynmanParams, loadFeynman } = gen;
  const { tc, showToast, showError } = toast;
  const { completePhase, warmNext } = ledger;

  /**
   * Open the Feynman teach-back on a node, generating its beats first if
   * needed. The node moves Unknown/Frontier → Learning and the naive-student
   * session begins on its opening prompt.
   */
  const enterFeynman = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setStates((prev) =>
          prev[node.id] === "unknown" || prev[node.id] === undefined
            ? { ...prev, [node.id]: "learning" }
            : prev,
        );
        // A pass left on its Gap Report resumes there — the gaps it found are
        // not something to re-earn by teaching the whole thing again.
        setFeynman(feynmanProgressRef.current[node.id] ?? feynmanStart(node.id));
        setSelectedId(node.id);
        setScreen("feynman");
        // Feynman hands straight off to Connect — and the pool Connect keys on
        // doesn't move during a teach-back, so warming it here always lands.
        warmNext(node, "feynman");
      };
      if (feynmanCacheRef.current[node.id]) {
        open();
        return;
      }
      const key = warmKey("feynman", node.id);
      // A background warm is already writing this — join it rather than
      // starting a second, duplicate request.
      if (warm.has(key)) {
        generate(
          key,
          tc().kickerFeynman,
          tc().wakingStudent(node.label),
          () => loadFeynman(node),
          open,
        );
        return;
      }
      if (loadingRef.current) return;
      // Nothing cached and nothing warming: open on the first beat and let the
      // rest arrive while the learner is still teaching it.
      setLiveFeynman({ nodeId: node.id, beats: [] });
      open();
      let receivedAny = false;
      const arrived: FeynmanBeat[] = [];
      fetchFeynmanStream(feynmanParams(node), (beat, index) => {
        receivedAny = true;
        arrived[index] = beat;
        setLiveFeynman((prev) =>
          prev?.nodeId === node.id ? { nodeId: node.id, beats: [...arrived] } : prev,
        );
      })
        .then((beats) => {
          setFeynmanCache((prev) =>
            prev[node.id] ? prev : { ...prev, [node.id]: beats },
          );
          setLiveFeynman((prev) => (prev?.nodeId === node.id ? null : prev));
        })
        .catch((err: Error) => {
          if (receivedAny) {
            // Commit what arrived: without this the rubric never reaches the
            // cache, so the diff has nothing to grade against and the gaps
            // never write back to the map — silently, while the toast claims
            // the opposite.
            const partial = arrived.filter(Boolean);
            setFeynmanCache((prev) =>
              prev[node.id] ? prev : { ...prev, [node.id]: partial },
            );
            setLiveFeynman((prev) => (prev?.nodeId === node.id ? null : prev));
            showError(err, { context: "content" });
            return;
          }
          setScreen("map");
          setFeynman(null);
          setLiveFeynman(null);
          showError(err, {
            context: "content",
            retry: () => enterFeynmanRef.current?.(node),
          });
        });
    },
    [
      warmNext,
      tc,
      feynmanParams,
      generate,
      loadFeynman,
      showError,
      warm,
      setFeynman,
      setLiveFeynman,
      feynmanCacheRef,
      feynmanProgressRef,
      setFeynmanCache,
      setStates,
      warmKey,
      loadingRef,
      setScreen,
      setSelectedId,
    ],
  );
  const enterFeynmanRef = useRef(enterFeynman);
  enterFeynmanRef.current = enterFeynman;

  /** The rubric for a node: the committed one, else whatever has streamed in
   *  so far — the same fallback `feynmanBeats` renders from. Without it every
   *  dispatch is a no-op on the cold path, and the learner's first click after
   *  the opening prompt does nothing until the last row lands. */
  const feynmanBeatsFor = useCallback(
    (nodeId: string): FeynmanBeat[] | undefined => {
      const cached = feynmanCacheRef.current[nodeId];
      if (cached?.length) return cached;
      const live = liveFeynmanRef.current;
      return live?.nodeId === nodeId ? live.beats : undefined;
    },
    [liveFeynmanRef, feynmanCacheRef],
  );

  const dispatchFeynman = (action: FeynmanAction) => {
    setFeynman((prev) => {
      if (!prev) return prev;
      const beats = feynmanBeatsFor(prev.nodeId);
      if (!beats?.length && !["begin", "scaffold"].includes(action.type)) return prev;
      return feynmanReducer(prev, action, beats ?? []);
    });
  };

  /**
   * Real teach-back diffing (#26): the learner's whole explanation is diffed
   * server-side against a rubric they never saw — every verdict is detected
   * from their words, and a sub-point they never mentioned is a finding, not
   * an unanswered prompt.
   */
  const feynmanTeach = (text: string) => {
    const session = feynmanRef.current;
    if (!session || judgingRef.current) return;
    const beats = feynmanBeatsFor(session.nodeId);
    const node = graphRef.current.nodes.find((n) => n.id === session.nodeId);
    if (!beats?.length || !node) return;
    setJudging(true);
    // Verdicts-first, as in Socratic: the diff lands early and the Gap
    // Report opens; the student's actual words fill in behind it.
    let applied = false;
    const apply = (action: FeynmanAction) =>
      setFeynman((prev) =>
        prev?.nodeId === session.nodeId ? feynmanReducer(prev, action, beats) : prev,
      );
    /** Rows come back by rubric index; the session keys verdicts by beat id. */
    const byBeat = (rows: FeynmanJudgement["verdicts"]) => {
      const verdicts: Record<string, TeachVerdict> = {};
      const quotes: Record<string, string> = {};
      for (const row of rows) {
        const beat = beats[row.i];
        if (!beat) continue;
        verdicts[beat.id] = row.verdict;
        if (row.quote) quotes[beat.id] = row.quote;
      }
      return { verdicts, quotes };
    };
    // A confusion caught here is the richest one the app sees — the learner
    // said it unprompted, in their own words. Filed once per judgement, on
    // whichever frame carried the verdicts first.
    let filed = false;
    const fileCaught = (rows: FeynmanJudgement["verdicts"]) => {
      if (filed) return;
      filed = true;
      for (const row of rows)
        if (row.verdict === "confused" && row.quote)
          fileMisconception(row.quote, node.label);
    };
    fetchJudgeFeynman(
      {
        topic: formRef.current.topic,
        nodeLabel: node.label,
        rubric: beats.map((b) => ({
          subPoint: b.subPoint,
          mustConvey: b.mustConvey,
        })),
        answer: text,
        language: languageRef.current,
      },
      (partial) => {
        if (!partial.verdicts?.length) return;
        applied = true;
        fileCaught(partial.verdicts);
        apply({
          type: "taught",
          text,
          ...byBeat(partial.verdicts),
          response: "",
          pending: true,
        });
      },
      // …and the student's reaction types itself in as it is written.
      (draft) => {
        if (draft.response)
          apply({ type: "stream", text: draft.response, pending: true });
      },
    )
      .then((j) => {
        fileCaught(j.verdicts);
        apply(
          applied
            ? { type: "stream", text: j.response }
            : {
                type: "taught",
                text,
                ...byBeat(j.verdicts),
                jargon: j.jargon,
                response: j.response,
              },
        );
        // The jargon list only arrives with the full judgement, so a session
        // that opened on the verdict frame picks it up here.
        if (applied && j.jargon.length)
          setFeynman((prev) =>
            prev?.nodeId === session.nodeId ? { ...prev, jargon: j.jargon } : prev,
          );
      })
      .catch((err: unknown) => {
        // Settle the session before surfacing the failure. `pending` is what
        // the mirror effect below waits on, so a reaction that stopped
        // mid-write used to leave the pass permanently unsaveable: the Gap
        // Report was on screen, the verdicts were real, and stepping back to
        // the map threw away a teach-back the learner had already given.
        setFeynman((prev) =>
          prev?.nodeId === session.nodeId && prev.pending
            ? { ...prev, pending: false }
            : prev,
        );
        showError(err, {
          context: "judge",
          retry: () => feynmanTeachRef.current?.(text),
        });
      })
      .finally(() => setJudging(false));
  };
  const feynmanTeachRef = useRef(feynmanTeach);
  feynmanTeachRef.current = feynmanTeach;

  const exitFeynman = () => {
    leaveTo(feynman?.nodeId);
    setFeynman(null);
  };

  /**
   * The write-back — Feynman's connective tissue. Every unresolved gap becomes
   * a red Gap sub-node hung under the parent (via `attachGap`, idempotent),
   * then the phase hands off to whatever the plan owes next — Perform on a
   * procedure, Connect on a concept. The node stays Learning.
   */
  const advanceFromFeynman = () => {
    if (!feynman) return;
    const node = graphRef.current.nodes.find((n) => n.id === feynman.nodeId);
    const beats = feynmanBeatsFor(feynman.nodeId) ?? [];
    const specs = feynmanGaps(feynman, beats);
    if (node) specs.forEach((spec) => attachGap(node.id, spec));
    setFeynman(null);
    // The gaps are on the map now — the pass has nothing left to come back to.
    setFeynmanProgress(omitKey(feynman.nodeId));
    if (node) {
      // No gap on the first teach-back earns the Socratic rung (W3.2).
      const clean = !specs.length && !feynman.previous;
      completePhase(node, "feynman", undefined, undefined, clean);
      enterOwed(node);
      if (specs.length)
        showToast(tc().gapsAttached(specs.length, node.label), tc().mapUpdated);
    } else {
      setScreen("map");
    }
  };

  return {
    enterFeynman,
    feynmanBeatsFor,
    dispatchFeynman,
    feynmanTeach,
    exitFeynman,
    advanceFromFeynman,
  };
}
