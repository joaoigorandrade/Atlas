"use client";

// The spiral: opening a phase, running it, and advancing out of it.
//
// One module rather than six because the six phases are one state machine, not
// six independent ones — Feynman's advance opens Connect, Connect's opens the
// Crucible, a failed Crucible re-plans the map and routes back into Socratic.
// Split per phase, every one of those transitions would have to travel through
// a ref between hooks, which is the indirection this refactor exists to remove.
//
// What it needs arrives as three objects — the run (persisted state), the
// sessions (what is open) and the generation layer (how content is asked for) —
// plus the handful of things AtlasApp itself owns: the screen, the canvas
// centring, the overlay and the judge-in-flight flag.

import { useCallback, useEffect, useRef } from "react";
import {
  phaseIndex,
  phaseLabel,
  phasePlan,
  proofGate,
  primaryPhase,
  afterPretest,
  normaliseConsumeProgress,
  markTodayMet,
  openGapIds,
  preferredModality,
  type AltKey,
  type ConceptNode,
  type PhaseId,
  type ConsumeChunk,
  type ConsumeModelBeat,
  type ConsumeProgress,
  type NodeState,
} from "@/lib/curriculum";
import {} from "@/lib/fsrs";
import { fetchConsumeModelStream, fetchConsumeStream } from "@/lib/api";
import { usePhaseLedger } from "@/components/atlas/phaseLedger";
import { useExplain } from "@/components/atlas/useExplain";
import {} from "@/components/atlas/phaseParking";
import { usePerform } from "@/components/atlas/usePerform";
import { usePassage } from "@/components/atlas/usePassage";
import { useRetain } from "@/components/atlas/useRetain";
import type { Language } from "@/lib/i18n";
import type { Surface } from "@/components/map/TopBar";
import type { Screen } from "@/components/atlas/screen";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { Generation } from "@/components/atlas/useGeneration";
import type { createWarmQueue } from "@/lib/warm";

/** The momentum replay spans onboarding (week 0) plus three weeks of work. */
const MOMENTUM_WEEKS = 3;

export function useSpiral(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  warm: ReturnType<typeof createWarmQueue>;
  languageRef: React.RefObject<Language>;
  displayRef: React.RefObject<Record<string, NodeState>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  /** Put a node in the middle of the canvas — every phase exit lands on one. */
  centerOn: (id: string) => void;
  /** Schedule work on a timer the unmount clears. */
  later: (fn: () => void, ms: number) => void;
  timersRef: React.RefObject<ReturnType<typeof setTimeout>[]>;
  loadingRef: React.RefObject<{ phase: string; message: string } | null>;
  judgingRef: React.RefObject<boolean>;
  setJudging: (v: boolean) => void;
  setConsumeFailed: (v: { nodeId: string; retry: () => void } | null) => void;
  momentumPlaying: boolean;
  setMomentumPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setMomentumWeek: React.Dispatch<React.SetStateAction<number>>;
  momentumRef: React.RefObject<ReturnType<typeof setInterval> | null>;
  /** The node "Start here →" targets — the top of the goal-ordered plan. */
  frontierTargetId: () => string | null;
}) {
  const {
    run,
    sessions,
    gen,
    toast,
    warm,
    languageRef,
    displayRef,
    selectedId,
    setSelectedId,
    setScreen,
    centerOn,
    later,
    timersRef,
    loadingRef,
    judgingRef,
    setJudging,
    setConsumeFailed,
    momentumPlaying,
    setMomentumPlaying,
    setMomentumWeek,
    momentumRef,
    frontierTargetId,
  } = deps;
  const { showToast, showError, tc } = toast;
  const {
    graphRef,
    statesRef,
    setStates,
    setAdherence,
    setLitToday,
    reviewedNodes,
    setPhasesDone,
    phasesDoneRef,
    shakyReasonsRef,
    setModalityTally,
    modalityTallyRef,
    setConsumeCache,
    consumeCacheRef,
    setModelCache,
    modelCacheRef,
    setConsumeProgress,
    consumeProgressRef,
    setPhaseProgress,
    phaseProgressRef,
    setShakyReason,
  } = run;
  const {
    consume,
    setConsume,
    consumeRef,
    setLiveConsume,
    liveConsumeRef,
    setLiveModel,
    consumeChunksRef,
  } = sessions;
  const {
    generate,
    warmKey,
    warmOne,
    consumeParams,
    modelParams,
    modelKey,
    prereqNodesOf,
    loadConsume,
    loadModel,
  } = gen;

  // The phase ledger — what each node has finished, and the mastery state
  // derived from it. Its own module: every handler below calls into it from
  // inside a `useCallback`, so these have to be stable.
  const ledger = usePhaseLedger({
    graphRef,
    phasesDoneRef,
    setPhasesDone,
    shakyReasonsRef,
    setShakyReason,
    setStates,
    setPhaseProgress,
    phaseProgressRef,
    warmOne,
  });
  const { completePhase, markStarted, warmNext, armChallenge, disarmChallenge } = ledger;

  // Explain and Perform, one hook each, on the `phaseLedger` precedent.
  const phaseDeps = {
    run,
    sessions,
    gen,
    toast,
    ledger,
    setSelectedId,
    setScreen,
    centerOn,
    later,
  };
  const judgeDeps = { languageRef, judgingRef, setJudging };

  // Retain is mounted below; a passed Perform hands on to it through a ref.
  const enterReviewRef = useRef<() => void>(() => {});
  const perform = usePerform({
    ...phaseDeps,
    ...judgeDeps,
    onLearned: (node) => {
      litUp(node);
      enterReviewRef.current();
    },
  });

  // ---- map actions ------------------------------------------------------

  /**
   * Entering a frontier node opens Phase 2 · Consume, generating the node's
   * reading pass first if this run hasn't yet. The write-back to Learning
   * happens on exit — on finishing the pass, and now also on leaving one
   * part-read, since two sections in is real progress and losing it was the
   * difference between a document and somewhere you can leave.
   *
   * A node opened again resumes: the stored `ConsumeProgress` becomes the
   * session, so the learner lands back on the section they stopped at with
   * their rewrites, collapsed sections and guess intact.
   */
  const enterSession = useCallback(
    (node: ConceptNode) => {
      // A fresh open (including the retry, which is this same call) clears the
      // stale "the rest never arrived" notice from the previous attempt.
      setConsumeFailed(null);
      const open = () => {
        const saved = consumeProgressRef.current[node.id];
        setConsume({
          nodeId: node.id,
          ...normaliseConsumeProgress(saved),
          term: null,
          // A resumed session never reopens the lens the learner left open —
          // they came back for the reading, not for the view over it.
          model: null,
          passage: null,
          recap: false,
          // The modality the learner reads best in is marked on sections they
          // haven't opened a lens over themselves (§6's adaptive modality).
          preferred: preferredModality(modalityTallyRef.current),
        });
        setSelectedId(node.id);
        setScreen("consume");
        // Reading takes minutes; the questioning pass that follows can be
        // written in that time.
        warmNext(node, "consume");
      };
      if (consumeCacheRef.current[node.id]) {
        open();
        return;
      }
      const key = warmKey("consume", node.id);
      // A background warm is already writing this — join it the old way
      // rather than starting a second, duplicate request.
      if (warm.has(key)) {
        generate(
          key,
          tc().kickerConsume,
          tc().writingReading(node.label),
          () => loadConsume(node),
          open,
        );
        return;
      }
      // Still streaming from a visit moments ago: rejoin it, don't bill a second.
      if (liveConsumeRef.current?.nodeId === node.id) return open();
      if (loadingRef.current) return;
      // Open the screen immediately rather than behind an overlay spinner —
      // ConsumeView shows its own inline skeleton for a still-empty section
      // 1, which reads as "in progress" while the wait is identical either
      // way. This is the one path with nothing cached and nothing already
      // warming, so it's the only time this skeleton is ever seen.
      setLiveConsume({ nodeId: node.id, chunks: [] });
      open();
      let receivedAny = false;
      fetchConsumeStream(consumeParams(node), (chunk, index) => {
        receivedAny = true;
        setLiveConsume((prev) => {
          if (!prev || prev.nodeId !== node.id) return prev;
          // Frames address slots by index, so a section re-sent for any
          // reason patches in place rather than duplicating.
          const chunks = [...prev.chunks];
          chunks[index] = chunk;
          return { nodeId: node.id, chunks };
        });
      })
        .then((chunks) => {
          setConsumeCache((prev) =>
            prev[node.id] ? prev : { ...prev, [node.id]: chunks },
          );
          setLiveConsume((prev) => (prev?.nodeId === node.id ? null : prev));
        })
        .catch((err: unknown) => {
          // Sections already read stay on screen — `liveConsume` is untouched.
          // What changes is that the learner is told the rest isn't coming and
          // handed the retry, instead of being left to work out that a reading
          // pass which simply stopped was supposed to have more in it.
          if (receivedAny)
            setConsumeFailed({
              nodeId: node.id,
              retry: () => enterSessionRef.current?.(node),
            });
          showError(err, {
            context: "content",
            retry: () => enterSessionRef.current?.(node),
          });
        });
    },
    [
      warmNext,
      liveConsumeRef,
      tc,
      consumeParams,
      generate,
      loadConsume,
      showError,
      warm,
      setConsume,
      setLiveConsume,
      consumeCacheRef,
      consumeProgressRef,
      modalityTallyRef,
      setConsumeCache,
      warmKey,
      loadingRef,
      setConsumeFailed,
      setScreen,
      setSelectedId,
    ],
  );
  // Retry for a reading pass that stopped halfway: reopening the node is the
  // retry, since nothing incomplete was ever cached.
  const enterSessionRef = useRef(enterSession);
  enterSessionRef.current = enterSession;

  // ---- Consume (Learn view) --------------------------------------------

  /** The end-of-section comprehension check — answered once. A miss is kept
   *  so the recap can name it; a second pick would be elimination. */
  const consumeCheck = (chunkId: string, oi: number, correct: boolean) => {
    setConsume((prev) =>
      prev && !prev.checks[chunkId]
        ? { ...prev, checks: { ...prev.checks, [chunkId]: { oi, correct } } }
        : prev,
    );
  };

  /** The same check, asked before its section (W3.3): a right answer passes
   *  it and collapses the section; a miss only opens the reading in full. */
  const consumePretest = (id: string, oi: number, correct: boolean, stake?: number) =>
    setConsume((prev) => (prev ? afterPretest(prev, id, oi, correct, stake) : prev));

  const consumeContinue = (chunkIndex: number) => {
    setConsume((prev) =>
      prev ? { ...prev, idx: Math.max(prev.idx, chunkIndex + 1) } : prev,
    );
  };

  /**
   * Open a lens over a section of the reading.
   *
   * The view opens on the state change, never on the round-trip: what has been
   * generated this run is already in `modelCache`, a warm in flight is joined
   * rather than duplicated, and a genuine miss streams so the first beat is on
   * screen while the rest are still being written.
   *
   * Every open feeds the run-wide tally that produces the learned default,
   * which is what closes §6's adaptive-modality loop. There is no "un-pick" to
   * discount any more — closing the view *is* the revert, and it leaves the
   * reading exactly as it found it — so a tap on a lens is always a vote for
   * it. `MODALITY_PREFERENCE_MIN` is what keeps one curious tap from becoming
   * a preference.
   *
   * The lens a learner reaches for is the lens they reach for again, so opening
   * one also warms the same lens on the next section — at one background call
   * rather than the twenty it would take to pre-generate every lens of every
   * section.
   */
  const consumeOpenModel = (chunk: ConsumeChunk, lens: AltKey) => {
    const nodeId = consumeRef.current?.nodeId;
    const node = graphRef.current.nodes.find((n) => n.id === nodeId);
    if (!nodeId || !node) return;
    setModalityTally((prev) => ({ ...prev, [lens]: (prev[lens] ?? 0) + 1 }));
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            model: { chunkId: chunk.id, lens },
            variant: { ...prev.variant, [chunk.id]: lens },
          }
        : prev,
    );

    const chunks = consumeChunksRef.current;
    const next = chunks[chunks.findIndex((c) => c.id === chunk.id) + 1];
    if (next) {
      const nextKey = modelKey(nodeId, next.id, lens);
      if (!modelCacheRef.current[nextKey])
        warm.warm(nextKey, () => loadModel(node, next, lens, true));
    }

    const key = modelKey(nodeId, chunk.id, lens);
    if (modelCacheRef.current[key]) return;

    const settle = (beats?: ConsumeModelBeat[]) => {
      if (beats) setModelCache((prev) => (prev[key] ? prev : { ...prev, [key]: beats }));
      setLiveModel((prev) => (prev?.key === key ? { ...prev, done: true } : prev));
    };
    const failed = (err: unknown) => {
      settle();
      showError(err, {
        context: "content",
        retry: () => consumeOpenModelRef.current?.(chunk, lens),
      });
    };

    const stream = () =>
      fetchConsumeModelStream(modelParams(node, chunk, lens), (beat, index) => {
        setLiveModel((prev) => {
          if (!prev || prev.key !== key) return prev;
          const beats = [...prev.beats];
          beats[index] = beat;
          // Frames address slots, so a gap is possible until the one before
          // it lands; rendering a hole would put `undefined` on screen.
          return { key, beats: beats.filter((b) => b !== undefined) };
        });
      })
        .then((beats) => settle(beats))
        .catch(failed);

    setLiveModel({ key, beats: [] });
    // A warm is already writing exactly this view — join it. The queue hands
    // back the one in-flight promise, so clicking through early costs the
    // remainder of a request already running, never a second generation.
    // If that warm turns out to have failed — including the silent decline a
    // background request gets instead of an error — this is a foreground
    // open now, so it retries properly rather than reporting the warm's fate.
    if (warm.has(key)) {
      warm
        .run(key, () => loadModel(node, chunk, lens), true)
        .then((beats) => settle(beats))
        .catch(() => stream());
      return;
    }
    void stream();
  };
  const consumeOpenModelRef = useRef(consumeOpenModel);
  consumeOpenModelRef.current = consumeOpenModel;

  /** Close the open view. The lens stays recorded on the section — that is the
   *  adaptive-modality signal, and what the missing-prerequisite flag counts. */
  const consumeCloseModel = () => {
    setConsume((prev) => (prev ? { ...prev, model: null } : prev));
  };

  const consumeToggleTerm = (key: string) => {
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            term: prev.term === key ? null : key,
            // Opening it is what counts; closing it again doesn't un-meet the
            // term, and the recap lists everything the learner looked up.
            termsSeen: prev.termsSeen.includes(key)
              ? prev.termsSeen
              : [...prev.termsSeen, key],
          }
        : prev,
    );
  };

  // ---- ask about this (the passage aside) — see `usePassage` --------------
  const { consumeOpenPassage, consumeClosePassage, consumeAskPassage } = usePassage({
    run,
    sessions,
    languageRef,
  });

  /** "Skip — I know this" on one section — collapses it to its takeaway,
   *  short of bailing on the whole node the way header's "I know this" does. */
  const consumeToggleCollapse = (chunkId: string) => {
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            collapsed: {
              ...prev.collapsed,
              [chunkId]: !prev.collapsed[chunkId],
            },
          }
        : prev,
    );
  };

  /**
   * Mirror the live session into the persisted per-node progress.
   *
   * An effect rather than a write on the way out, because "on the way out" is
   * not the only way a reading pass ends — a closed tab, a refresh and a
   * crash all end one too, and losing ten minutes of reading to any of them
   * was the thing worth fixing. Every field here is a stable reference that
   * only changes when the learner does something, so this doesn't fire on
   * every keystroke in an ask panel.
   */
  useEffect(() => {
    const s = consume;
    if (!s) return;
    const chunks =
      consumeCacheRef.current[s.nodeId] ??
      (liveConsumeRef.current?.nodeId === s.nodeId ? liveConsumeRef.current.chunks : []);
    setConsumeProgress((prev) => {
      const before = prev[s.nodeId];
      const next: ConsumeProgress = {
        idx: s.idx,
        variant: s.variant,
        collapsed: s.collapsed,
        checks: s.checks,
        pretest: s.pretest,
        stakes: s.stakes,
        termsSeen: s.termsSeen,
        // A pass still streaming has fewer sections in hand than it will end
        // up with; never let a mid-stream count shrink a known total.
        total: Math.max(chunks.length, before?.total ?? 0),
        finished: s.finished,
        handedOff: before?.handedOff ?? s.handedOff,
      };
      // Opening a term pill or an ask panel changes the session but not the
      // progress. Returning the same object keeps those off the snapshot's
      // save debounce entirely.
      if (
        before &&
        (Object.keys(next) as Array<keyof ConsumeProgress>).every(
          (k) => before[k] === next[k],
        )
      )
        return prev;
      return { ...prev, [s.nodeId]: next };
    });
  }, [
    consume,
    consume?.nodeId,
    consume?.idx,
    consume?.variant,
    consume?.collapsed,
    consume?.pretest,
    consume?.checks,
    consume?.termsSeen,
    consume?.finished,
    liveConsumeRef,
    consumeCacheRef,
    setConsumeProgress,
  ]);

  /**
   * Leaving the reading.
   *
   * Reading past the first section is real progress, and used to leave no
   * trace at all: the node stayed Frontier and the map said the learner had
   * never started. It moves to Learning here — `readingPhaseIndex` is what
   * keeps that honest about *which* phase is actually current, so a part-read
   * node doesn't get Socratic ticked off along with it.
   */
  const exitConsume = () => {
    const s = consumeRef.current;
    const node = s && graphRef.current.nodes.find((n) => n.id === s.nodeId);
    if (s && node) {
      // Reading it through closes the rung. Leaving part-way through doesn't,
      // but it is still real progress and the map should say so.
      if (s.finished) completePhase(node, "consume");
      else if (s.idx >= 1) markStarted(node);
    }
    setScreen("map");
  };

  // ---- Socratic (Phase 3a) ---------------------------------------------

  /** Back to the map with the node selected and centred. Three exits below
   *  had these four lines each; `usePerform` keeps the same helper for the
   *  same reason. */
  const leaveTo = (nodeId: string | undefined) => {
    setScreen("map");
    if (!nodeId) return;
    setSelectedId(nodeId);
    later(() => centerOn(nodeId), 30);
  };

  // A phase hands off to the owed one, resolved below — out of a forward reference.
  const enterOwedRef = useRef<(node: ConceptNode) => void>(() => {});
  const enterOwed = (node: ConceptNode) => enterOwedRef.current(node);

  // Explain sits behind the reading and hands on to the owed rung — see `useExplain`.
  const explain = useExplain({ ...phaseDeps, enterOwed });

  /** A node just went green — the day's winnable end, from any path there. */
  const litUp = (node: ConceptNode) => {
    setLitToday((prev) => (prev.includes(node.label) ? prev : [...prev, node.label]));
    setAdherence((prev) => markTodayMet(prev));
  };

  // ---- Retain (Phase 6 · Review queue / FSRS) — see `useRetain` -----------
  const { retainPlan, warmRetain, enterReview, reviewActions } = useRetain({
    run,
    sessions,
    gen,
    toast,
    warm,
    languageRef,
    setScreen,
    later,
    enterSession,
  });
  enterReviewRef.current = enterReview;

  // ---- Calibration (§12 · Metacognition) -------------------------------

  /** Open the Calibration surface — an Analytics-layer screen, reached from the
   *  left rail. It reads the live confidence-vs-performance readings. */
  const enterCalib = () => setScreen("calibration");

  const exitCalib = useCallback(() => setScreen("map"), [setScreen]);

  /**
   * The calibration payoff: tapping an overconfident node drops straight into
   * its Crucible to close the real gap.
   */
  const closeCalibGap = (nodeId: string) => {
    const node = graphRef.current.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setSelectedId(nodeId);
  };

  // ---- Consume → Socratic hand-off -------------------------------------

  /**
   * Finishing the last chunk.
   *
   * This used to fire the learner straight into Socratic mid-scroll. Eight to
   * fifteen minutes of reading earns a beat that says what it added before the
   * next phase starts taking it back: the takeaways collected, the terms met,
   * the opening guess and how it landed. The hand-off is the recap's CTA.
   */
  const finishConsume = () => {
    setConsume((prev) => (prev ? { ...prev, finished: true, recap: true } : prev));
  };

  /** Leaving a finished reading forwards — the recap's two CTAs. The rung
   *  closes here as well as in `exitConsume`: this is the path a learner
   *  actually takes, and closing it only on the way *back* to the map left the
   *  ledger empty, so the rail kept offering a reading already finished. */
  const leaveConsume = (go: (node: ConceptNode) => void) => {
    const s = consumeRef.current;
    setConsume(null);
    const node = s && graphRef.current.nodes.find((n) => n.id === s.nodeId);
    if (!node) return setScreen("map");
    if (s.finished) completePhase(node, "consume");
    go(node);
  };

  /**
   * Enter the rung this node actually owes — the only thing allowed to decide
   * where a learner goes next, and the same function the CTA reads to name
   * itself, so a button cannot promise a phase it won't open.
   *
   * A hand-off that names its target instead skips whatever the plan put in
   * front of it. `exhausted` takes a finished one.
   */
  const enterOwedPhase = (
    node: ConceptNode,
    exhausted: () => void = () => setScreen("map"),
    state: NodeState | undefined = displayRef.current[node.id],
  ) => {
    disarmChallenge();
    const next = primaryPhase(phasePlan(node), phasesDoneRef.current[node.id], state);
    if (!next) exhausted();
    else enterPhase[next](node);
  };
  enterOwedRef.current = (node) => enterOwedPhase(node, () => leaveTo(node.id));

  /** The recap's primary CTA: forward into whatever the plan says is next. */
  const beginNextFromConsume = () => leaveConsume(enterOwedPhase);
  /** The recap's "you knew every section": straight to the proof gate, under
   *  the challenge that credits the ladder on a cold pass (W3.4). */
  const proveFromConsume = () => leaveConsume((node) => skipKnown(node));

  /** "Review prerequisite" — routes to the weakest direct prereq (shaky over
   *  merely learning) via the same session each state opens from the map. */
  const consumeRoutePrereq = () => {
    const node = graphRef.current.nodes.find((n) => n.id === consume?.nodeId);
    setConsume(null);
    const prereqs = node ? prereqNodesOf(node.id) : [];
    const weakest =
      prereqs.find((n) => statesRef.current[n.id] === "shaky") ??
      prereqs.find((n) => statesRef.current[n.id] === "learning");
    if (!weakest) {
      setScreen("map");
      return;
    }
    // The weakest prereq's *own* plan decides where reviewing it lands — a
    // shaky `fact` has no Crucible and a `procedure` no Socratic pass.
    enterOwedPhase(weakest);
  };

  const onNodeDoubleClick = (id: string) => {
    const node = graphRef.current.nodes.find((n) => n.id === id);
    if (!node) return;
    const state = displayRef.current[id];
    if (state === "frontier") enterSession(node);
    else if (state === "unknown") {
      setSelectedId(id);
      showToast(tc().locked);
    } else setSelectedId(id);
  };

  /**
   * Open a phase of a node's own plan. One table, so adding a phase is one
   * entry rather than another `if` in three different dispatchers — which is
   * what the five string comparisons below used to be, and why the ladder they
   * guarded had become unreachable.
   *
   * These are closures over the hook's refs, which is why the table is built
   * here and not in `PHASE_DEFS`.
   */
  const enterPhase: Record<PhaseId, (node: ConceptNode) => void> = {
    consume: enterSession,
    explain: explain.enterExplain,
    perform: perform.enterPerform,
    // Retain isn't entered on a node — it's the shared review queue.
    retain: () => enterReview(),
  };

  const onPrimaryAction = (node: ConceptNode, displayState: NodeState) => {
    if (displayState === "unknown") {
      showToast(tc().clearPrereqs);
      return;
    }
    // The targeted Socratic micro-pass the spec promises (#12) — completing it
    // removes the gap node from the map. A gap runs no plan of its own.
    if (displayState === "gap") {
      return;
    }
    // A node with a part-read reading pass resumes it, whatever the plan says
    // comes next — the map's own CTA says "Resume reading", and sending them
    // on would be teaching back something half-read.
    const progress = consumeProgressRef.current[node.id];
    if (progress && !progress.finished) {
      enterSession(node);
      return;
    }
    // Otherwise: the rung this node actually owes. Nothing here knows which
    // phase that is — that is the point, and it is the same function the CTA
    // reads to name itself, so the button can't promise a different one. A
    // ladder with nothing owed that its open gaps still hold opens the first.
    const gap = graphRef.current.nodes.find(
      (n) => n.id === openGapIds(graphRef.current, node.id)[0],
    );
    const closeGap = (g: ConceptNode) => {
      setSelectedId(g.id);
    };
    enterOwedPhase(node, gap ? () => closeGap(gap) : enterReview, displayState);
  };

  /** "I already know this" — prove it: open the node's proof gate, and a
   *  first-try pass credits every rung before it (`ledgerAfter`). */
  const skipKnown = (node: ConceptNode) => {
    markStarted(node);
    armChallenge(node.id);
    enterPhase[proofGate(phasePlan(node))](node);
  };

  const onPhaseAction = (node: ConceptNode, displayState: NodeState, idx: number) => {
    const plan = phasePlan(node);
    // The same index NodeDetail draws — a row that shows as current has to
    // behave as current.
    const current = phaseIndex(
      plan,
      phasesDoneRef.current[node.id],
      displayState,
      reviewedNodes.includes(node.id),
    );
    if (current < 0) return;
    disarmChallenge();
    const phase = plan[idx];
    if (!phase) return;
    // Every phase opens from its own row, done or not: re-reading and re-doing
    // are first-class actions. Only the jump-ahead needs saying out loud, and
    // the nudge has already said it.
    if (idx > current) {
      markStarted(node);
      showToast(tc().jumpingAhead(phaseLabel(phase), node.label));
    }
    enterPhase[phase](node);
  };

  const onSurface = (surface: Surface) => {
    if (surface === "map") return;
    if (surface === "review") {
      enterReview();
      return;
    }
    const node = graphRef.current.nodes.find((n) => n.id === selectedId);
    const state = node ? displayRef.current[node.id] : undefined;
    // Routed through the same function as the node's own CTA. They used to
    // disagree: this one ignored a part-read reading pass, so the rail sent a
    // half-read node to Feynman while its CTA resumed the reading.
    if (node && state && state !== "unknown") onPrimaryAction(node, state);
    else showToast(tc().sessionHint);
  };

  const jumpFrontier = () => {
    const target = frontierTargetId();
    if (!target) return showToast(tc().everythingMastered);
    setSelectedId(target);
    centerOn(target);
  };

  const toggleMomentum = () => {
    if (momentumPlaying) {
      if (momentumRef.current) clearInterval(momentumRef.current);
      setMomentumPlaying(false);
      return;
    }
    setMomentumPlaying(true);
    setMomentumWeek(0);
    momentumRef.current = setInterval(() => {
      setMomentumWeek((prev) => {
        const next = Math.min(MOMENTUM_WEEKS, prev + 1);
        if (next >= MOMENTUM_WEEKS && momentumRef.current) {
          clearInterval(momentumRef.current);
          // Let the final frame read for a beat, then drop the week-mask so
          // later-spawned nodes (week 4 gaps) render normally again (#9).
          timersRef.current.push(setTimeout(() => setMomentumPlaying(false), 1000));
        }
        return next;
      });
    }, 1000);
  };

  return {
    enterSession,
    consumeCheck,
    consumePretest,
    consumeContinue,
    consumeOpenModel,
    consumeCloseModel,
    consumeToggleTerm,
    consumeOpenPassage,
    consumeClosePassage,
    consumeAskPassage,
    consumeToggleCollapse,
    exitConsume,
    explain,
    ...perform,
    retainPlan,
    enterReview,
    reviewActions,
    enterCalib,
    exitCalib,
    closeCalibGap,
    finishConsume,
    beginNextFromConsume,
    proveFromConsume,
    consumeRoutePrereq,
    onNodeDoubleClick,
    skipKnown,
    onPhaseAction,
    onSurface,
    jumpFrontier,
    toggleMomentum,
    warmRetain,
    onPrimaryAction,
  };
}
