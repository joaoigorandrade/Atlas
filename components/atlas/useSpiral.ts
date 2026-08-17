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
  PHASES,
  SOCRATIC_STEPS,
  connectCards,
  connectReducer,
  connectStart,
  crucibleReducer,
  crucibleStart,
  emptyConsumeProgress,
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  markTodayMet,
  preferredModality,
  readingPhaseIndex,
  recordMisconception,
  recurringMisconceptions,
  removeNode,
  retainReducer,
  retainStart,
  reviewCard,
  socraticOutcome,
  socraticPlan,
  socraticReducer,
  socraticStart,
  type AltKey,
  type ConceptNode,
  type ConnectAction,
  type ConsumeChunk,
  type ConsumeModelBeat,
  type ConsumeProgress,
  type CrucibleAction,
  type FeynmanAction,
  type FeynmanBeat,
  type GapSpec,
  type NodeState,
  type ReviewConfidence,
  type ReviewGrade,
  type SocraticAction,
  type SocraticStep,
  type TeachVerdict,
} from "@/lib/curriculum";
import {
  dueCards,
  gradeStoredCard,
  newStoredCard,
  retainContentFromStore,
  type StoredCard,
} from "@/lib/fsrs";
import { TOAST_STRINGS } from "@/lib/toastCopy";
import {
  fetchConsumeModelStream,
  fetchConsumeStream,
  fetchFeynmanStream,
  fetchJudgeCrucible,
  fetchJudgeFeynman,
  fetchJudgeSocratic,
  fetchPassageStream,
  fetchRetain,
  fetchSocraticStream,
  type FeynmanJudgement,
} from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Surface } from "@/components/map/TopBar";
import type { Screen } from "@/components/atlas/screen";
import type { PassageAsk } from "@/components/session/ConsumeView";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { Generation } from "@/components/atlas/useGeneration";
import type { createWarmQueue } from "@/lib/warm";

/** The momentum replay spans onboarding (week 0) plus three weeks of work. */
const MOMENTUM_WEEKS = 3;

/** Confidence tap → a felt-% reading for the calibration curve. */
const CRUCIBLE_FELT: Record<number, number> = { 0: 35, 1: 65, 2: 90 };
const REVIEW_FELT: Record<number, number> = { 0: 20, 1: 55, 2: 88 };
const GRADE_REAL: Record<ReviewGrade, number> = {
  again: 25,
  hard: 55,
  good: 75,
  easy: 95,
};

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
  setSocraticRetry: (v: (() => void) | null) => void;
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
    setSocraticRetry,
    momentumPlaying,
    setMomentumPlaying,
    setMomentumWeek,
    momentumRef,
    frontierTargetId,
  } = deps;
  const { showToast, showError } = toast;
  // Read at fire time, not render time: every toast and overlay line below
  // comes out of a callback, and the language can change between the two.
  const tc = useCallback(() => TOAST_STRINGS[languageRef.current], [languageRef]);
  const {
    graphRef,
    formRef,
    statesRef,
    cardsRef,
    setGraph,
    setStates,
    setPositions,
    setSpawnedIds,
    setCards,
    setAdherence,
    setLitToday,
    setReviewedNodes,
    reviewedNodes,
    setMisconceptions,
    misconceptionsRef,
    setModalityTally,
    modalityTallyRef,
    setConsumeCache,
    consumeCacheRef,
    setModelCache,
    modelCacheRef,
    setSocraticCache,
    socraticCacheRef,
    setFeynmanCache,
    feynmanCacheRef,
    connectCacheRef,
    setCrucibleCache,
    crucibleCacheRef,
    setRetainContent,
    retainContentRef,
    setConsumeProgress,
    consumeProgressRef,
    socraticProgressRef,
    setFeynmanProgress,
    feynmanProgressRef,
    setConnectProgress,
    connectProgressRef,
    setShakyReason,
    recordCalib,
    attachGap,
    removeGapNode,
  } = run;
  const {
    consume,
    setConsume,
    consumeRef,
    setLiveConsume,
    liveConsumeRef,
    setLiveModel,
    socratic,
    setSocratic,
    socraticRef,
    setLiveSocratic,
    liveSocraticRef,
    feynman,
    setFeynman,
    feynmanRef,
    setLiveFeynman,
    liveFeynmanRef,
    connect,
    setConnect,
    setCrucible,
    crucibleRef,
    setRetain,
    retainRef,
    consumeChunksRef,
  } = sessions;
  const {
    generate,
    warmKey,
    warmOne,
    consumeParams,
    modelParams,
    modelKey,
    socraticParams,
    feynmanParams,
    connectParams,
    prereqNodesOf,
    loadConsume,
    loadModel,
    loadSocratic,
    loadFeynman,
    loadConnect,
    loadCrucible,
  } = gen;

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
          ...(saved ?? emptyConsumeProgress()),
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
        warmOne("socratic", node);
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
      tc,
      consumeParams,
      generate,
      loadConsume,
      showError,
      warm,
      warmOne,
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

  /** The end-of-section comprehension check — a wrong pick is kept (so the
   *  miss can be named) and simply replaced by the next attempt. */
  const consumeCheck = (chunkId: string, oi: number, correct: boolean) => {
    setConsume((prev) =>
      prev ? { ...prev, checks: { ...prev.checks, [chunkId]: { oi, correct } } } : prev,
    );
  };

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

  // ---- ask about this (the passage aside) --------------------------------

  /** Open the ask panel on a section. `selection` is the highlighted text, or
   *  "" when asked from the keyboard path (the question is the whole section). */
  const consumeOpenPassage = (chunkId: string, selection: string) => {
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            passage: {
              chunkId,
              selection,
              question: "",
              parts: [],
              status: "composing",
            },
          }
        : prev,
    );
  };

  const consumeClosePassage = () => {
    setConsume((prev) => (prev ? { ...prev, passage: null } : prev));
  };

  /**
   * Ask it — the learner's own question about the passage they highlighted,
   * answered against the section they're reading and streamed back a paragraph
   * at a time.
   *
   * The section prose stands in for the selection on the keyboard path: the
   * generator needs something to be *about*, and "this whole section" is the
   * truthful answer there rather than an arbitrary sentence from it.
   */
  const consumeAskPassage = (question: string) => {
    const live = consumeRef.current;
    const ask = live?.passage;
    if (!live || !ask || ask.status !== "composing") return;
    const node = graphRef.current.nodes.find((n) => n.id === live.nodeId);
    const chunks =
      consumeCacheRef.current[live.nodeId] ??
      (liveConsumeRef.current?.nodeId === live.nodeId
        ? liveConsumeRef.current.chunks
        : []);
    const chunk = chunks.find((c) => c.id === ask.chunkId);
    if (!node || !chunk) return;
    const section = chunk.body.join("\n\n");

    /** Fold an update into the ask, but only while it's still the open one —
     *  a learner who closed the panel or moved node mid-stream must not have
     *  a late frame reopen it. */
    const patch = (fn: (a: PassageAsk) => PassageAsk) =>
      setConsume((prev) =>
        prev &&
        prev.nodeId === live.nodeId &&
        prev.passage?.chunkId === ask.chunkId &&
        prev.passage.status !== "composing"
          ? { ...prev, passage: fn(prev.passage) }
          : prev,
      );

    setConsume((prev) =>
      prev && prev.passage?.chunkId === ask.chunkId
        ? { ...prev, passage: { ...prev.passage, question, status: "asking" } }
        : prev,
    );

    fetchPassageStream(
      {
        topic: formRef.current.topic,
        nodeLabel: node.label,
        kicker: chunk.kicker,
        section,
        selection: ask.selection || section,
        question,
        language: languageRef.current,
      },
      (part, index) =>
        patch((a) => {
          const parts = [...a.parts];
          parts[index] = part;
          return { ...a, parts: parts.filter((p) => p !== undefined) };
        }),
    )
      .then((parts) => patch((a) => ({ ...a, parts, status: "done" })))
      .catch(() => patch((a) => ({ ...a, status: "error" })));
  };

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
    if (s && (s.idx >= 1 || s.finished)) {
      setStates((prev) =>
        prev[s.nodeId] === "unknown" || prev[s.nodeId] === undefined
          ? { ...prev, [s.nodeId]: "learning" }
          : prev,
      );
    }
    setScreen("map");
  };

  // ---- Socratic (Phase 3a) ---------------------------------------------

  /**
   * Open the Socratic surface on a node, generating its questioning script
   * first if needed. The node moves Unknown/Frontier → Learning and the
   * contingent-questioning session begins on its first probe.
   */
  const enterSocratic = useCallback(
    (node: ConceptNode) => {
      // The written pass is longer than the pass the learner runs: `steps`
      // carries spare probes past the plan, and only a struggling learner ever
      // spends them (`socraticReducer`). So a session opens on the plan.
      const open = (steps: SocraticStep[], total = socraticPlan(steps)) => {
        setStates((prev) =>
          prev[node.id] === "unknown" || prev[node.id] === undefined
            ? { ...prev, [node.id]: "learning" }
            : prev,
        );
        // The reading handed off. Without this, a node whose pass was read to
        // the end and then left for the map is indistinguishable from one
        // that went on to be questioned — see `readingPhaseIndex`.
        setConsumeProgress((prev) =>
          prev[node.id] && !prev[node.id].handedOff
            ? { ...prev, [node.id]: { ...prev[node.id], handedOff: true } }
            : prev,
        );
        // A pass left part-answered resumes on the probe it stopped at, with
        // its transcript, scaffolding level and ruled-out replies intact.
        // A session saved while parked on a step that hadn't streamed in yet
        // has to be re-hydrated against the steps we now hold, or it reopens
        // with nothing to answer and nothing coming.
        const saved = socraticProgressRef.current[node.id];
        setSocratic(
          saved
            ? socraticReducer(saved, { type: "hydrate", total }, steps)
            : socraticStart(node.id, steps, total),
        );
        setSelectedId(node.id);
        setScreen("socratic");
        // Socratic hands straight off to Feynman — warm it now rather than
        // waiting on the general pass's settle delay to notice the state flip.
        warmOne("feynman", node);
      };
      const cached = socraticCacheRef.current[node.id];
      if (cached) {
        open(cached);
        return;
      }
      const key = warmKey("socratic", node.id);
      // A background warm is already writing this — join it rather than
      // starting a second, duplicate request.
      if (warm.has(key)) {
        generate(
          key,
          tc().kickerSocratic,
          tc().preparingQuestions(node.label),
          () => loadSocratic(node),
          (steps) => open(steps),
        );
        return;
      }
      if (loadingRef.current) return;
      // Nothing cached and nothing warming: open on the first probe and let
      // the rest arrive behind it, the way Consume already does.
      setLiveSocratic({ nodeId: node.id, steps: [] });
      open([], SOCRATIC_STEPS);
      let receivedAny = false;
      // The authoritative arrival order, kept in the closure so the hydrate
      // dispatch below sees the same array the reducer will read.
      const arrived: SocraticStep[] = [];
      fetchSocraticStream(socraticParams(node), (step, index) => {
        receivedAny = true;
        arrived[index] = step;
        setLiveSocratic((prev) =>
          prev?.nodeId === node.id ? { nodeId: node.id, steps: [...arrived] } : prev,
        );
        // The session may be parked waiting for exactly this step.
        setSocratic((prev) =>
          prev?.nodeId === node.id
            ? socraticReducer(prev, { type: "hydrate" }, arrived)
            : prev,
        );
      })
        .then((steps) => {
          setSocraticCache((prev) =>
            prev[node.id] ? prev : { ...prev, [node.id]: steps },
          );
          setLiveSocratic((prev) => (prev?.nodeId === node.id ? null : prev));
          // A short pass still has to be finishable — and now that the whole
          // pass is in hand its real plan is known, so the re-cap caps at the
          // core count: a three-probe concept stops at three instead of
          // running the four-step estimate out.
          setSocratic((prev) =>
            prev?.nodeId === node.id
              ? socraticReducer(
                  prev,
                  { type: "hydrate", total: socraticPlan(steps) },
                  steps,
                )
              : prev,
          );
        })
        .catch((err: unknown) => {
          // A partial pass is still a usable pass — the probes that landed are
          // answerable — so this stays a notice rather than closing the screen.
          if (receivedAny) {
            showError(err, { context: "content" });
            return;
          }
          setScreen("map");
          setSocratic(null);
          setLiveSocratic(null);
          showError(err, {
            context: "content",
            retry: () => enterSocraticRef.current?.(node),
          });
        });
    },
    [
      tc,
      generate,
      loadSocratic,
      socraticParams,
      showError,
      warm,
      warmOne,
      setLiveSocratic,
      setSocratic,
      setConsumeProgress,
      setSocraticCache,
      setStates,
      socraticCacheRef,
      socraticProgressRef,
      warmKey,
      loadingRef,
      setScreen,
      setSelectedId,
    ],
  );
  const enterSocraticRef = useRef(enterSocratic);
  enterSocraticRef.current = enterSocratic;

  /** Steps for the node on screen — the cached array once it lands, or the
   *  live one still streaming in behind it. Without this fallback every
   *  Socratic control (send, "I'm stuck", "Just tell me") is a silent no-op
   *  for as long as the pass is still generating. */
  const socraticStepsFor = (nodeId: string): SocraticStep[] | undefined => {
    const cached = socraticCacheRef.current[nodeId];
    if (cached?.length) return cached;
    const live = liveSocraticRef.current;
    return live?.nodeId === nodeId ? live.steps : undefined;
  };

  const dispatchSocratic = (action: SocraticAction) => {
    // A caught wrong turn is filed run-wide before it scrolls out of the
    // transcript: this pass is discarded when it ends, the roll-up isn't.
    // Outside the updater below on purpose — that one has to stay pure.
    const live = socraticRef.current;
    const picked =
      action.type === "reply" && live
        ? socraticStepsFor(live.nodeId)?.[live.step]?.replies[action.index]
        : undefined;
    if (live && picked?.quality === "wrong" && !live.ruledOut.includes(picked.label)) {
      const label = graphRef.current.nodes.find((n) => n.id === live.nodeId)?.label ?? "";
      setMisconceptions((list) => recordMisconception(list, picked.label, label));
    }
    setSocratic((prev) => {
      if (!prev) return prev;
      const steps = socraticStepsFor(prev.nodeId);
      if (!steps?.length) return prev;
      // Whether this pass earned its ending (and any prerequisite-gap flag)
      // is settled once, at completion, in `advanceFromSocratic` (#C) — not
      // mid-dialogue here.
      return socraticReducer(prev, action, steps, languageRef.current);
    });
  };

  /** File a misconception the judge named into the run-wide roll-up. Once per
   *  judgement: the verdict frame files it, and the full judgement only fills
   *  in if the verdict never arrived on its own. */
  const fileMisconception = (label: string, nodeLabel: string) => {
    setMisconceptions((list) => recordMisconception(list, label, nodeLabel));
  };

  /**
   * The live judging loop (#25): the learner's own typed answer goes to the
   * server judge; the classified verdict drives the same contingent rules the
   * scripted replies used — correct advances, near hints, wrong gets caught.
   */
  const socraticAnswer = (text: string) => {
    const session = socraticRef.current;
    if (!session || judgingRef.current) return;
    const steps = socraticStepsFor(session.nodeId);
    const step = steps?.[session.step];
    const node = graphRef.current.nodes.find((n) => n.id === session.nodeId);
    if (!step || !node) return;
    setJudging(true);
    const apply = (action: SocraticAction) =>
      setSocratic((prev) =>
        prev ? socraticReducer(prev, action, steps, languageRef.current) : prev,
      );
    // The turns since this step opened — the tutor's actual last question
    // (which may be a reframe, not the opening prompt) plus enough history
    // that a repeated hint or a misgraded reframe doesn't happen twice (#A).
    let openIdx = 0;
    for (let i = session.log.length - 1; i >= 0; i--) {
      if (session.log[i].role === "ai" && session.log[i].move) {
        openIdx = i;
        break;
      }
    }
    const sinceStepOpen = session.log.slice(openIdx);
    const lastAiTurn = [...session.log].reverse().find((t) => t.role === "ai");
    const attempt = sinceStepOpen.filter((t) => t.role === "learner").length + 1;
    // The answer lands in the transcript on send, with the tutor's bubble
    // already writing beside it. Verdict-first: the classification arrives
    // about a second in and moves the tutor on; the wording fills that
    // same bubble when it lands.
    apply({ type: "answer", text });
    setSocraticRetry(null);
    // Wrapped so the retry can re-run *just the judge*: the learner's answer
    // is already in the transcript, and sending it twice would put it there
    // twice. `retryJudge` re-opens the bubble this fills.
    const runJudge = (): Promise<void> => {
      let applied = false;
      return fetchJudgeSocratic(
        {
          topic: formRef.current.topic,
          nodeLabel: node.label,
          question: lastAiTurn?.text ?? step.prompt,
          reference: step.tell,
          answer: text,
          history: sinceStepOpen.map((t) => ({ role: t.role, text: t.text })),
          attempt,
          misconceptions: step.replies
            .filter((r) => r.quality !== "correct")
            .map((r) => ({ label: r.label, quality: r.quality })),
          // …and what this learner keeps getting wrong everywhere else, so a
          // repeat is named as a repeat instead of caught cold again.
          recurring: recurringMisconceptions(misconceptionsRef.current),
          help: session.help,
          language: languageRef.current,
        },
        (partial) => {
          if (!partial.quality) return;
          // The input stays gated until the wording lands — a second answer
          // racing the first would break "at most one pending turn", and the
          // learner is reading the verdict anyway.
          applied = true;
          if (partial.misconception) fileMisconception(partial.misconception, node.label);
          apply({
            type: "judged",
            answer: text,
            quality: partial.quality,
            response: partial.response ?? "",
            pending: !partial.response,
          });
        },
        // …and the wording types itself into that bubble as it is written.
        (draft) => {
          if (draft.response)
            apply({ type: "stream", text: draft.response, pending: true });
        },
      )
        .then((j) => {
          if (!applied && j.misconception) fileMisconception(j.misconception, node.label);
          apply(
            applied
              ? { type: "stream", text: j.response }
              : {
                  type: "judged",
                  answer: text,
                  quality: j.quality,
                  response: j.response,
                },
          );
        })
        .catch((err: unknown) => {
          // Don't strand the open bubble on its dots — but don't fill it with
          // the failure either. Writing `err.message` in here was the tutor
          // saying "OpenRouter 502" to a learner mid-question; the turn is
          // marked failed instead and the view offers the retry.
          apply({ type: "judgeFailed" });
          const again = () => {
            if (judgingRef.current) return;
            setSocraticRetry(null);
            setJudging(true);
            apply({ type: "retryJudge" });
            void runJudge();
          };
          // Offered in two places on purpose: the toast is where the learner is
          // looking the moment it fails, and the bubble is where they look when
          // they come back to the screen a minute later.
          setSocraticRetry(() => again);
          showError(err, { context: "judge", retry: again });
        })
        .finally(() => setJudging(false));
    };
    void runJudge();
  };

  const exitSocratic = () => {
    setScreen("map");
    const nodeId = socratic?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setSocratic(null);
  };

  // ---- Feynman (Phase 3b) ----------------------------------------------

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
        warmOne("connect", node);
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
      tc,
      feynmanParams,
      generate,
      loadFeynman,
      showError,
      warm,
      warmOne,
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
      if (!beats?.length) return prev;
      return feynmanReducer(prev, action, beats);
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
      setFeynman((prev) => (prev ? feynmanReducer(prev, action, beats) : prev));
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
    setScreen("map");
    const nodeId = feynman?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setFeynman(null);
  };

  // ---- Connect (Phase 4 · Elaboration) ---------------------------------

  // Connect can skip straight to the Crucible, which is defined in the section
  // below — the ref keeps that hand-off out of a forward reference.
  const enterCrucibleRef = useRef<(node: ConceptNode) => void>(() => {});

  /**
   * Open the Connect surface on a node, generating its elaboration content
   * first if needed. Candidates are drawn from nodes the learner has actually
   * touched — the links are personal and true, never generic trivia.
   */
  const enterConnect = useCallback(
    (node: ConceptNode) => {
      // Nothing touched yet means nothing true to wire into: skip the phase
      // rather than ask the learner to link concepts they have never met.
      if (connectParams(node).pool.length === 0) {
        showToast(tc().nothingToWire(node.label));
        enterCrucibleRef.current(node);
        return;
      }
      const open = () => {
        setStates((prev) =>
          prev[node.id] === "unknown" || prev[node.id] === undefined
            ? { ...prev, [node.id]: "learning" }
            : prev,
        );
        // Resume the pass if one was left open — the links already written
        // are the learner's words, not something to re-earn.
        setConnect(connectProgressRef.current[node.id] ?? connectStart(node.id));
        setSelectedId(node.id);
        setScreen("connect");
        // Connect ends by handing the node to the Crucible, and the mastered
        // set its problem keys on doesn't change in between.
        warmOne("crucible", node);
      };
      if (connectCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("connect", node.id),
        tc().kickerConnect,
        tc().findingWires(node.label),
        () => loadConnect(node),
        open,
      );
    },
    [
      tc,
      connectParams,
      generate,
      loadConnect,
      showToast,
      warmOne,
      setConnect,
      connectCacheRef,
      connectProgressRef,
      setStates,
      warmKey,
      setScreen,
      setSelectedId,
    ],
  );

  const dispatchConnect = (action: ConnectAction) => {
    setConnect((prev) => {
      if (!prev) return prev;
      const content = connectCacheRef.current[prev.nodeId];
      if (!content) return prev;
      return connectReducer(prev, action, content);
    });
  };

  const exitConnect = () => {
    setScreen("map");
    const nodeId = connect?.nodeId;
    if (nodeId) {
      // Park the pass, don't discard it: ← Map is "come back to this later".
      if (connect) setConnectProgress((prev) => ({ ...prev, [nodeId]: connect }));
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setConnect(null);
  };

  /**
   * The write-back — Feynman's connective tissue. Every unresolved gap becomes
   * a red Gap sub-node hung under the parent (via `attachGap`, idempotent),
   * then the phase hands straight off to Connect. The node stays Learning —
   * mastery waits for the Crucible.
   */
  const advanceFromFeynman = () => {
    if (!feynman) return;
    const node = graphRef.current.nodes.find((n) => n.id === feynman.nodeId);
    const beats = feynmanBeatsFor(feynman.nodeId) ?? [];
    const specs = feynmanGaps(feynman, beats);
    if (node) specs.forEach((spec) => attachGap(node.id, spec));
    setFeynman(null);
    // The gaps are on the map now — the pass has nothing left to come back to.
    setFeynmanProgress((prev) => {
      if (!prev[feynman.nodeId]) return prev;
      const { [feynman.nodeId]: _done, ...rest } = prev;
      return rest;
    });
    if (node) {
      enterConnect(node);
      if (specs.length)
        showToast(tc().gapsAttached(specs.length, node.label), tc().mapUpdated);
    } else {
      setScreen("map");
    }
  };

  /**
   * Understood and connected: the learner made real links (each drafted a card
   * for Retain), so Connect (Phase 4) is complete. The node moves Learning →
   * Shaky — its next phase is the Crucible, where transfer is proven.
   */
  const advanceFromConnect = () => {
    if (!connect) return;
    const node = graphRef.current.nodes.find((n) => n.id === connect.nodeId);
    const content = connectCacheRef.current[connect.nodeId];
    const drafted = content ? connectCards(connect, content, languageRef.current) : [];
    // Confirmed links + accepted mnemonic become REAL persisted cards (#21) —
    // they surface in Review without a generation inventing them. The card id
    // is the link's own identity, not a timestamp, so re-doing the phase
    // rewrites its cards in place instead of stacking a second copy of every
    // one of them into the review queue.
    if (node && drafted.length) {
      const now = new Date();
      setCards((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const c of drafted) {
          const existing = byId.get(c.key);
          byId.set(
            c.key,
            existing
              ? { ...existing, front: c.front, back: c.back }
              : newStoredCard(
                  {
                    id: c.key,
                    nodeId: node.id,
                    // A mnemonic is order-recall, not a "why" — grading it as
                    // one would misreport what the learner actually proved.
                    type: c.kind === "mnemonic" ? "recall" : "why",
                    source: "Connect",
                    front: c.front,
                    back: c.back,
                  },
                  now,
                ),
          );
        }
        return [...byId.values()];
      });
    }
    if (node) {
      setStates((prev) =>
        prev[node.id] === "learning" || prev[node.id] === "unknown"
          ? { ...prev, [node.id]: "shaky" }
          : prev,
      );
      setShakyReason(node.id, "connect-complete");
    }
    // Finished — the parked copy has nothing left to come back to.
    setConnectProgress((prev) => {
      if (!prev[connect.nodeId]) return prev;
      const { [connect.nodeId]: _done, ...rest } = prev;
      return rest;
    });
    setScreen("map");
    setConnect(null);
    if (node) {
      setSelectedId(node.id);
      later(() => centerOn(node.id), 30);
      showToast(tc().cardsDrafted(drafted.length));
    }
  };

  // ---- Crucible (Phase 5 · application / transfer) ---------------------

  /**
   * Open the Crucible surface on a node, generating its transfer problem
   * first if needed. The session opens on the confidence gate — the
   * calibration hook that precedes the problem.
   */
  const enterCrucible = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setCrucible(crucibleStart(node.id));
        setSelectedId(node.id);
        setScreen("crucible");
      };
      if (crucibleCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        warmKey("crucible", node.id),
        tc().kickerCrucible,
        tc().forgingProblem(node.label),
        () => loadCrucible(node),
        open,
      );
    },
    [
      tc,
      generate,
      loadCrucible,
      setCrucible,
      crucibleCacheRef,
      warmKey,
      setScreen,
      setSelectedId,
    ],
  );
  enterCrucibleRef.current = enterCrucible;

  const dispatchCrucible = (action: CrucibleAction) => {
    setCrucible((prev) => {
      if (!prev) return prev;
      const content = crucibleCacheRef.current[prev.nodeId];
      if (!content) return prev;
      return crucibleReducer(prev, action, content);
    });
  };

  /**
   * Submitting an attempt. An empty workspace isn't diagnostic — nudge instead.
   * A first-rung failure is precise: it spawns its named sub-concept as a red
   * Gap node under the parent and flips the parent Shaky. The stated
   * confidence, held against the outcome, becomes a live calibration reading.
   */
  const crucibleSubmit = () => {
    const cur = crucibleRef.current;
    if (!cur || cur.submitted || judgingRef.current) return;
    if (!cur.attempt.trim()) {
      showToast(tc().workspaceEmpty);
      return;
    }
    const content = crucibleCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    const problem = content.problems[Math.min(cur.rung, content.problems.length - 1)];
    // The judge grades the REAL attempt (#27): pass/partial is earned, the
    // diagnostic quotes their work, and a failure names the actual gap.
    setJudging(true);
    // The worst wait in the app. `outcome` is one word and arrives on its own
    // frame, so the result panel opens on it and the three diagnostic rows
    // land into an already-open panel.
    let applied = false;
    const apply = (action: CrucibleAction) =>
      setCrucible((prev) => (prev ? crucibleReducer(prev, action, content) : prev));
    fetchJudgeCrucible(
      {
        topic: formRef.current.topic,
        nodeLabel: node.label,
        problem: problem.q,
        hint: problem.hint,
        answer: cur.attempt,
        language: languageRef.current,
      },
      (partial) => {
        if (!partial.outcome) return;
        applied = true;
        apply({ type: "result", outcome: partial.outcome, transfer: [] });
      },
    )
      .then((j) => {
        apply(
          applied
            ? { type: "transfer", transfer: j.transfer }
            : { type: "result", outcome: j.outcome, transfer: j.transfer },
        );
        // The calibration hook made real: felt (the confidence tap) vs. what
        // actually happened on this attempt.
        if (cur.conf !== null)
          recordCalib(
            cur.nodeId,
            CRUCIBLE_FELT[cur.conf],
            j.outcome === "partial" ? 45 : 88,
          );
        if (j.outcome !== "partial") return;
        // The judged gap replaces the pre-generated one when the judge named
        // a different missing sub-concept.
        const gap: GapSpec =
          j.gapLabel && j.gapReason
            ? { ...content.gap, label: j.gapLabel, reason: j.gapReason }
            : content.gap;
        if (j.gapLabel)
          setCrucibleCache((prev) => ({
            ...prev,
            [cur.nodeId]: {
              ...content,
              gap,
              reExplain: j.reExplain ?? content.reExplain,
            },
          }));
        setStates((prev) => ({ ...prev, [node.id]: "shaky" }));
        setShakyReason(node.id, "crucible-fail");
        if (attachGap(node.id, gap))
          showToast(tc().transferBroke(gap.label, node.label), tc().mapUpdated);
      })
      .catch((err: unknown) =>
        showError(err, {
          context: "judge",
          retry: () => crucibleSubmitRef.current?.(),
        }),
      )
      .finally(() => setJudging(false));
  };
  const crucibleSubmitRef = useRef(crucibleSubmit);
  crucibleSubmitRef.current = crucibleSubmit;

  /**
   * Transfer confirmed: the re-attempt carried the concept into a framing it
   * was never taught in, so the first-attempt gap resolves — it leaves the
   * map — and the node lifts Shaky → Mastered, the only path to green.
   */
  const advanceFromCrucible = () => {
    const cur = crucibleRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const gapId = crucibleCacheRef.current[cur.nodeId]?.gap.id;
    if (gapId) {
      setGraph((g) => removeNode(g, gapId));
      setPositions((prev) => {
        if (!prev[gapId]) return prev;
        const nextPos = { ...prev };
        delete nextPos[gapId];
        return nextPos;
      });
      setSpawnedIds((prev) => {
        if (!prev.has(gapId)) return prev;
        const nextIds = new Set(prev);
        nextIds.delete(gapId);
        return nextIds;
      });
    }
    setStates((prev) => {
      const nextStates = { ...prev };
      if (gapId) delete nextStates[gapId];
      if (node) nextStates[node.id] = "mastered";
      return nextStates;
    });
    setScreen("map");
    setCrucible(null);
    if (node) {
      setSelectedId(node.id);
      later(() => centerOn(node.id), 30);
      // Adherence: a node just went green — the day's winnable end.
      setLitToday((prev) => (prev.includes(node.label) ? prev : [...prev, node.label]));
      setAdherence((prev) => markTodayMet(prev));
      showToast(tc().transferConfirmed(node.label));
    }
  };

  const exitCrucible = () => {
    setScreen("map");
    const nodeId = crucibleRef.current?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setCrucible(null);
  };

  // ---- Retain (Phase 6 · Review queue / FSRS) --------------------------

  /**
   * What the Review queue would generate right now: the card factory only runs
   * for touched nodes that have no cards yet. Derived in one place so a warm
   * and the real entry address the same cache row.
   */
  const retainPlan = useCallback(() => {
    const budgetMin = Math.min(15, Math.max(5, Math.round(formRef.current.target / 2)));
    const touched = graphRef.current.nodes.filter(
      (n) =>
        !n.gap &&
        ["learning", "shaky", "mastered"].includes(statesRef.current[n.id] ?? ""),
    );
    const uncovered = touched.filter(
      (n) => !cardsRef.current.some((c) => c.nodeId === n.id),
    );
    return {
      budgetMin,
      touched,
      uncovered,
      key: `retain:${uncovered.map((n) => n.id).join(",")}`,
      params: {
        topic: formRef.current.topic,
        budgetMin,
        nodes: uncovered.map((n) => ({
          id: n.id,
          label: n.label,
          state: statesRef.current[n.id]!,
        })),
        interests: formRef.current.interests,
        language: languageRef.current,
      },
    };
  }, [cardsRef, formRef, graphRef, statesRef, languageRef]);

  /** Draft the day's new cards ahead of the click. The result is discarded —
   *  its point is filling the shared cache so opening Review is a lookup. */
  const warmRetain = useCallback(() => {
    const plan = retainPlan();
    if (plan.uncovered.length === 0) return;
    warm.warm(plan.key, () => fetchRetain(plan.params, { prefetch: true }));
  }, [retainPlan, warm]);

  /**
   * Open the daily Review queue — a global surface. The day's cards are
   * generated once from the nodes the learner has actually touched; there is
   * nothing to review until at least one concept has been learned.
   */
  const enterReview = useCallback(() => {
    const { budgetMin, touched, uncovered, key, params } = retainPlan();
    // The queue reads from the real card store (#21): due cards, real
    // intervals on the grade buttons, forecast from actual due dates.
    const openFrom = (store: StoredCard[]) => {
      if (dueCards(store).length === 0) {
        showToast(tc().queueClear);
        return;
      }
      setRetainContent(
        retainContentFromStore(store, budgetMin, new Date(), languageRef.current),
      );
      setRetain(retainStart());
      setScreen("review");
    };
    if (touched.length === 0) {
      showToast(tc().nothingToReview);
      return;
    }
    // First review of a node: generate its atomic cards once, then they live
    // in the store forever (the generation is a card FACTORY, not the queue).
    if (uncovered.length === 0) {
      openFrom(cardsRef.current);
      return;
    }
    generate(
      key,
      tc().kickerRetain,
      tc().draftingCards,
      () => fetchRetain(params),
      (content) => {
        const now = new Date();
        const stamp = Date.now();
        const seeded = content.cards.map((c, i) =>
          newStoredCard(
            {
              id: `${c.node}-retain-${stamp}-${i}`,
              nodeId: c.node,
              type: c.type,
              source: c.source,
              cloze: c.cloze,
              answer: c.answer,
              front: c.front,
              back: c.back,
              reExplain: c.reExplain,
            },
            now,
          ),
        );
        const all = [...cardsRef.current, ...seeded];
        setCards(all);
        openFrom(all);
      },
    );
  }, [
    languageRef,
    tc,
    generate,
    retainPlan,
    showToast,
    setRetain,
    cardsRef,
    setCards,
    setRetainContent,
    setScreen,
  ]);

  const retainConfidence = (level: ReviewConfidence) => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "confidence", level }, retainContentRef.current);
    });
  };

  const retainToggleAside = () => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "toggleAside" }, retainContentRef.current);
    });
  };

  const retainContinue = () => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "continue" }, retainContentRef.current);
    });
  };

  /**
   * Grade a card — feeds FSRS and advances. "Again" is the alive-loop: the
   * fail stage opens and the card's node is flagged Shaky, so retention
   * failure re-enters Phase 1. The pre-flip confidence tap, held against the
   * grade, becomes a live calibration reading.
   */
  const retainGrade = (grade: ReviewGrade) => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    setRetain(retainReducer(cur, { type: "grade", grade }, content));
    // Real FSRS (#21): the scheduler computes the card's next due date.
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? gradeStoredCard(c, grade) : c)),
    );
    // Real review history — what finally earns "Retained ✓" (#13).
    if (grade === "good" || grade === "easy")
      setReviewedNodes((prev) =>
        prev.includes(card.node) ? prev : [...prev, card.node],
      );
    if (cur.conf !== null)
      recordCalib(card.node, REVIEW_FELT[cur.conf], GRADE_REAL[grade]);
    if (grade === "again" && card.fails) {
      setStates((prev) =>
        prev[card.node] === "shaky" ? prev : { ...prev, [card.node]: "shaky" },
      );
      setShakyReason(card.node, "review-miss");
      showToast(
        tc().cardFlaggedShaky(
          graphRef.current.nodes.find((n) => n.id === card.node)?.label ?? tc().thisNode,
        ),
        tc().mapUpdated,
      );
    }
  };

  const retainReteach = () => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    const node = graphRef.current.nodes.find((n) => n.id === card.node);
    setRetain(null);
    if (node) {
      enterSession(node);
      later(() => showToast(tc().reEnteringLoop(node.label)), 420);
    } else {
      setScreen("map");
    }
  };

  const exitReview = () => {
    setScreen("map");
    setRetain(null);
  };

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
    enterCrucible(node);
  };

  /**
   * The pass is done — but "done" isn't automatically "understood" (#C). A
   * gap node closes only when every step was reconstructed, not told; a
   * regular node hands off to Feynman when it was, with a softer note if it
   * took a hint or two, and — leaning on "Just tell me" (or the judge calling
   * "lost") twice or more — the node stays in Learning and a real gap gets
   * attached under it instead of a promise the old toast never kept.
   */
  const advanceFromSocratic = () => {
    const session = socratic;
    const node = graphRef.current.nodes.find((n) => n.id === session?.nodeId);
    setSocratic(null);
    if (!session || !node) {
      setScreen("map");
      return;
    }
    const outcome = socraticOutcome(session, !!node.gap);
    if (node.gap) {
      if (outcome === "unaided") {
        removeGapNode(node.id);
        setScreen("map");
        setSelectedId(null);
        showToast(tc().gapClosed(node.label), tc().mapUpdated);
      } else {
        setScreen("map");
        setSelectedId(node.id);
        showToast(tc().stillLeaning(node.label), tc().gapNotClosed);
      }
      return;
    }
    if (outcome === "flagged") {
      // Land on the map first: it's where the learner stays if the reading
      // below can't be reopened (nothing cached, a generation already in
      // flight), rather than on a screen whose session was just cleared.
      setScreen("map");
      setSelectedId(node.id);
      // ponytail: a synthetic gap (no model-authored label/reason like
      // Feynman/Crucible's) — promote to a generated one if this needs
      // richer framing than "foundations" later.
      const spec: GapSpec = {
        id: `gap-soc-${node.id}`,
        label: tc().socraticGapLabel(node.label),
        reason: tc().socraticGapReason,
        dx: -140,
        dy: 150,
      };
      attachGap(node.id, spec);
      // The flag on its own is passive — it names the problem and leaves the
      // learner free to click on to Feynman anyway. A pass that had to be told
      // through is a reading that didn't land, so the hand-off runs backwards:
      // into the reading, reopened at the top with nothing collapsed to its
      // takeaway. The ref is written alongside the state because
      // `enterSession` reads it synchronously, one line down.
      const saved = consumeProgressRef.current[node.id];
      if (saved) {
        const reread = { ...saved, idx: 0, collapsed: {}, handedOff: false };
        consumeProgressRef.current = {
          ...consumeProgressRef.current,
          [node.id]: reread,
        };
        setConsumeProgress((prev) =>
          prev[node.id] ? { ...prev, [node.id]: reread } : prev,
        );
      }
      showToast(tc().leaningOnTold(node.label), tc().reReadFirst);
      enterSession(node);
      return;
    }
    enterFeynman(node);
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

  /** The recap's CTA — the actual hand-off into Socratic (Phase 3a). */
  const beginSocraticFromConsume = () => {
    const nodeId = consumeRef.current?.nodeId;
    setConsume(null);
    if (!nodeId) return;
    const node = graphRef.current.nodes.find((n) => n.id === nodeId);
    if (node) enterSocratic(node);
  };

  const consumeSkipCrucible = () => {
    const node = graphRef.current.nodes.find((n) => n.id === consume?.nodeId);
    setConsume(null);
    if (node) enterCrucible(node);
    else setScreen("map");
  };

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
    if (statesRef.current[weakest.id] === "shaky") enterCrucible(weakest);
    else enterFeynman(weakest);
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

  const onPrimaryAction = (node: ConceptNode, displayState: NodeState) => {
    switch (displayState) {
      case "frontier":
        enterSession(node);
        break;
      case "learning": {
        // A node that went Learning on a part-read reading pass resumes it
        // — the map's own CTA says "Resume reading", and sending them to
        // Feynman instead would be teaching back something half-read.
        const progress = consumeProgressRef.current[node.id];
        if (progress && !progress.finished) enterSession(node);
        else enterFeynman(node);
        break;
      }
      case "shaky":
        enterCrucible(node);
        break;
      case "mastered":
        enterReview();
        break;
      case "gap":
        // The targeted Socratic micro-pass the spec promises (#12) —
        // completing it removes the gap node from the map.
        enterSocratic(node);
        break;
      default:
        showToast(tc().clearPrereqs);
    }
  };

  /**
   * The aggressive faster lever: prune a frontier node the learner already
   * owns. Mastery is written back, so the frontier re-derives past it and
   * the pace math immediately eases.
   */
  const skipKnown = (node: ConceptNode) => {
    setStates((prev) => ({ ...prev, [node.id]: "mastered" }));
    showToast(tc().pruned(node.label), tc().mapUpdated);
  };

  const onPhaseAction = (node: ConceptNode, displayState: NodeState, idx: number) => {
    // The same index NodeDetail draws, reading progress included — a row
    // that shows as current has to behave as current.
    const current = readingPhaseIndex(
      displayState,
      reviewedNodes.includes(node.id),
      consumeProgressRef.current[node.id],
    );
    if (current < 0) return;
    const phase = PHASES[idx];
    if (phase === "Consume") {
      // Re-reading is a first-class action, and on a part-read node it is
      // the resume. Neither used to open anything: Consume fell through to
      // a "re-doing…" toast.
      enterSession(node);
      return;
    }
    if (phase === "Socratic") {
      enterSocratic(node);
      return;
    }
    if (phase === "Feynman") {
      enterFeynman(node);
      return;
    }
    if (phase === "Connect") {
      enterConnect(node);
      return;
    }
    if (phase === "Crucible") {
      enterCrucible(node);
      return;
    }
    if (idx === current) {
      onPrimaryAction(node, displayState);
    } else if (idx < current) {
      // Secondary action: any completed phase stays open for a re-do.
      if (phase === "Retained") enterReview();
      else showToast(tc().redoing(phase, node.label));
    } else {
      // The learner jumped the recommended step — allowed, already nudged.
      setStates((prev) =>
        prev[node.id] === "unknown" ? { ...prev, [node.id]: "learning" } : prev,
      );
      showToast(tc().jumpingAhead(phase, node.label));
    }
  };

  const onSurface = (surface: Surface) => {
    if (surface === "map") return;
    if (surface === "review") {
      enterReview();
      return;
    }
    const node = graphRef.current.nodes.find((n) => n.id === selectedId);
    const state = node ? displayRef.current[node.id] : undefined;
    if (node && state === "frontier") enterSession(node);
    else if (node && state === "learning") enterFeynman(node);
    else if (node && state === "shaky") enterCrucible(node);
    else showToast(tc().sessionHint);
  };

  const jumpFrontier = () => {
    const target = frontierTargetId();
    if (!target) return;
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
    consumeContinue,
    consumeOpenModel,
    consumeCloseModel,
    consumeToggleTerm,
    consumeOpenPassage,
    consumeClosePassage,
    consumeAskPassage,
    consumeToggleCollapse,
    exitConsume,
    enterSocratic,
    socraticStepsFor,
    dispatchSocratic,
    socraticAnswer,
    exitSocratic,
    enterFeynman,
    feynmanBeatsFor,
    dispatchFeynman,
    feynmanTeach,
    exitFeynman,
    enterConnect,
    dispatchConnect,
    exitConnect,
    advanceFromFeynman,
    advanceFromConnect,
    enterCrucible,
    dispatchCrucible,
    crucibleSubmit,
    advanceFromCrucible,
    exitCrucible,
    retainPlan,
    enterReview,
    retainConfidence,
    retainToggleAside,
    retainContinue,
    retainGrade,
    retainReteach,
    exitReview,
    enterCalib,
    exitCalib,
    closeCalibGap,
    advanceFromSocratic,
    finishConsume,
    beginSocraticFromConsume,
    consumeSkipCrucible,
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
