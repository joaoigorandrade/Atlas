"use client";

// Onboarding: topic in, map out, placement answered.
//
// Its own module because it is the only flow that *creates* a run rather than
// reading one — it clears whatever was live, streams a graph in concept by
// concept, and runs the adaptive placement against the prefix that has arrived
// so far. Nothing downstream of the map needs any of it.

import { useCallback, useRef, useState } from "react";
import {
  DIAGNOSTIC_COUNT,
  applyDiagnosticEffect,
  diagnosticEffect,
  emptyGraph,
  graphFromMapNodes,
  initialStates,
  stepDifficulty,
  type DiagnosticDifficulty,
  type DiagnosticEffect,
  type DiagnosticQuestion,
  type GapSpec,
} from "@/lib/curriculum";
import {
  fetchCurriculumMapStream,
  fetchDiagnosticQuestion,
  type ScopeOffer,
} from "@/lib/api";
import { FAKE_MAP_CENTER } from "@/components/onboarding/fakeMap";
import type { ViewTransform } from "@/components/map/MapCanvas";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import { TOAST_STRINGS } from "@/lib/toastCopy";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { createWarmQueue } from "@/lib/warm";

/** Minimum time the map-assembly moment plays, even when generation is fast. */
const BUILD_MS = 2600;

/** Concepts that must have streamed in before the first placement question is
 *  asked for. The map arrives foundations-first, so this prefix is exactly the
 *  material an opening question should probe — and firing here overlaps the two
 *  cold generations instead of serializing them. */
const DIAGNOSTIC_POOL_MIN = 8;

export function useOnboarding(deps: {
  run: RunState;
  sessions: SessionState;
  toast: ToastChannel;
  warm: ReturnType<typeof createWarmQueue>;
  languageRef: React.RefObject<Language>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  setSelectedId: (id: string | null) => void;
  setView: React.Dispatch<React.SetStateAction<ViewTransform>>;
  centerOn: (id: string) => void;
  later: (fn: () => void, ms: number) => void;
  /** Gap specs queued by hesitant answers, spawned once the map opens. */
  pendingGapsRef: React.RefObject<Array<{ parentId: string; spec: GapSpec }>>;
  /** The node "Start here →" targets, once the map is on screen. */
  frontierTargetId: () => string | null;
}) {
  const {
    run,
    sessions,
    toast,
    warm,
    languageRef,
    setScreen,
    setSelectedId,
    setView,
    centerOn,
    later,
    pendingGapsRef,
    frontierTargetId,
  } = deps;
  const { showToast, showError } = toast;
  const tc = useCallback(() => TOAST_STRINGS[languageRef.current], [languageRef]);
  const {
    formRef,
    graphRef,
    statesRef,
    setForm,
    setGraph,
    setStates,
    setPositions,
    setSpawnedIds,
    setRunLanguage,
    setCachesLoaded,
    setShakyReason,
    attachGap,
    clearRun,
  } = run;
  const { setLiveConsume, setLiveModel } = sessions;

  /** The generated placement diagnostic — arrives with the graph. */
  const [diagnostic, setDiagnostic] = useState<DiagnosticQuestion[]>([]);
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState(0);
  /** Uploaded-outline grounding + too-broad-topic scoping (#30). */
  const [outline, setOutline] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [scopes, setScopes] = useState<ScopeOffer[] | null>(null);
  /** What the build has actually produced so far, named for the overlay.
   *  Indeterminate waits read ~30% longer than determinate ones, and this one
   *  now has real frames to count. */
  const [buildNote, setBuildNote] = useState<string | null>(null);

  const diagnosticRef = useRef(diagnostic);
  diagnosticRef.current = diagnostic;
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  // Adaptive placement state: which concepts have already been asked (never
  // repeat one), the difficulty the next question should be pitched at, and
  // the hardest level answered correctly so far.
  const askedNodeIdsRef = useRef<string[]>([]);
  /** Which build the arriving map frames belong to. A learner who re-submits
   *  (or picks a scope) starts a second stream while the first is still
   *  writing; without this token its concepts would land on top of the new map. */
  const buildIdRef = useRef(0);
  const nextDifficultyRef = useRef<DiagnosticDifficulty>("medium");
  const maxCorrectDifficultyRef = useRef<DiagnosticDifficulty | null>(null);

  // ---- onboarding flow -------------------------------------------------

  /**
   * "Build my map": the map streams in one concept at a time, foundations
   * first, and the canvas paints each one as it lands — the learner watches
   * the territory assemble rather than a spinner standing in for it (SPEC §2).
   *
   * This is the only generation in the app that can never be warmed (the node
   * ids don't exist until it returns), so it is the one wait every learner
   * pays. Two things keep it short: the concepts are delivered progressively
   * instead of after the last one is written, and the first placement question
   * — a second cold generation — is fired as soon as `DIAGNOSTIC_POOL_MIN`
   * concepts exist, so the two calls overlap instead of queueing. The
   * remaining 4 questions still follow one at a time, since each one's
   * difficulty depends on how the last was answered (see `answerDiagnostic`).
   *
   * `BUILD_MS` stays a floor, not a target: SPEC §2 calls the assembling
   * moment a deliberate "this is mine" beat, not a spinner to be minimized.
   * The diagnostic opens once that floor has passed *and* the first question
   * has arrived.
   */
  const build = useCallback(() => {
    const topic = formRef.current.topic.trim();
    if (!topic) {
      showToast(tc().nameTopicFirst);
      return;
    }
    const buildId = ++buildIdRef.current;
    // A fresh map is generated in the UI language, so this is the one moment
    // the run's content language is known for certain.
    setRunLanguage(languageRef.current);
    /** Frames from an abandoned build — a re-submit, or a picked scope — must
     *  never land on the map that replaced it. */
    const current = () => buildIdRef.current === buildId;

    setScreen("building");
    setReveal(0);
    setScopes(null);
    setBuildNote(null);
    const scale = 0.72;
    setView({
      x: window.innerWidth / 2 - FAKE_MAP_CENTER.x * scale,
      y: window.innerHeight / 2 - FAKE_MAP_CENTER.y * scale,
      scale,
    });
    // The previous map is not this topic's map, and everything below is keyed
    // to its node ids. Clearing it all up front is what stops the assembly beat
    // animating over the *old* territory, and — more importantly — what stops a
    // failed build from persisting those nodes under the new subject name: the
    // save is gated on a non-empty graph. It happens here rather than when the
    // map lands because the map no longer lands at one moment.
    setGraph(emptyGraph());
    setPositions({});
    setStates({});
    setDiagnostic([]);
    setSpawnedIds(new Set());
    pendingGapsRef.current = [];
    setLiveConsume(null);
    setLiveModel(null);
    // `clearRun` covers the unfinished teach-backs too: missed here and in
    // `excludeTopic`, they used to survive into the new run's snapshot —
    // persisted under the new subject, keyed by node ids that no longer exist.
    clearRun();
    setCachesLoaded(true);
    // A new map invalidates every warmed key — the node ids are about to
    // mean something else.
    warm.clear();
    askedNodeIdsRef.current = [];
    nextDifficultyRef.current = "medium";
    maxCorrectDifficultyRef.current = null;
    const started = Date.now();
    const openAt = () => Math.max(0, BUILD_MS - (Date.now() - started));

    const params = {
      topic,
      goal: formRef.current.goal,
      paretoPct: formRef.current.paretoPct,
      outline: outline ?? undefined,
      language: languageRef.current,
    };
    /** Started mid-stream and awaited after it, so the two cold generations
     *  overlap instead of queueing. */
    let question1: Promise<DiagnosticQuestion> | null = null;
    const askQuestion1 = (pool: Array<{ id: string; label: string }>) => {
      const fetchOne = () =>
        fetchDiagnosticQuestion({
          topic,
          goal: formRef.current.goal,
          interests: formRef.current.interests,
          language: languageRef.current,
          pool,
          difficulty: nextDifficultyRef.current,
        });
      // This call is never cached (unlike every other generation, its node
      // ids don't exist until the map above resolves), so it fails more
      // often than a warmed call would — one retry before giving up on the
      // learner's very first question.
      const pending = fetchOne().catch(fetchOne);
      // Nothing awaits this until the map finishes; without a handler now, a
      // rejection in between is an unhandled rejection. The real handling is
      // on the awaited copy below.
      pending.catch(() => {});
      return pending;
    };

    fetchCurriculumMapStream(params, (nodes) => {
      if (!current()) return;
      const graph = graphFromMapNodes(nodes);
      setGraph(graph);
      setStates(initialStates(graph));
      setPositions(
        Object.fromEntries(graph.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      );
      setBuildNote(`${graph.nodes.length} concepts placed`);
      // The map arrives foundations-first, so this prefix is a legitimate
      // candidate pool for an opening question — and asking now is what buys
      // the overlap. Questions 2-5 see the whole map.
      if (!question1 && nodes.length >= DIAGNOSTIC_POOL_MIN)
        question1 = askQuestion1(nodes.map((n) => ({ id: n.id, label: n.label })));
    })
      .then((result) => {
        if (!current()) return;
        // Too broad for one map: offer scoped sub-maps instead (#30).
        if ("scopes" in result) {
          setScreen("welcome");
          setScopes(result.scopes);
          return;
        }
        setBuildNote(`placement question 1 of ${DIAGNOSTIC_COUNT}`);
        // Short map (or a stream that ended early): the overlap never fired, so
        // ask now against everything that landed.
        const pending =
          question1 ??
          askQuestion1(result.nodes.map((n) => ({ id: n.id, label: n.label })));
        // The panel opens on its own choice — take the placement, or go
        // straight to the map — so it must not wait on question 1: the
        // learner who wants the map shouldn't pay for a test they'll skip.
        // The question lands behind the choice.
        let failed = false;
        later(() => {
          if (!current() || failed) return;
          setScreen("diagnostic");
          setAnswered(0);
        }, openAt());
        return pending
          .then((question) => {
            if (current()) setDiagnostic([question]);
          })
          .catch((err: Error) => {
            // Placement is a nice-to-have; the map is the product, so open it
            // rather than failing a build the learner already watched
            // assemble — but say so, instead of silently skipping the step.
            if (!current()) return;
            failed = true;
            showError(err, { context: "placement" });
            later(() => setScreen("map"), openAt());
          });
      })
      .catch((err: Error) => {
        if (!current()) return;
        setScreen("welcome");
        showError(err, { context: "build", retry: () => buildRef.current?.() });
      });
  }, [
    later,
    outline,
    showError,
    showToast,
    tc,
    warm,
    setPositions,
    setView,
    setLiveConsume,
    setLiveModel,
    formRef,
    clearRun,
    setCachesLoaded,
    setGraph,
    setRunLanguage,
    setSpawnedIds,
    setStates,
    languageRef,
    pendingGapsRef,
    setScreen,
  ]);
  // Same self-reference as `switchMapRef`: "Try again" on a failed build starts
  // the same build, with the form exactly as the learner left it.
  const buildRef = useRef(build);
  buildRef.current = build;

  /** A picked scope becomes the topic and builds immediately (#30). */
  const pickScope = (label: string) => {
    setForm((prev) => ({ ...prev, topic: label }));
    setScopes(null);
    // formRef updates on render; build reads the ref, so defer one tick.
    later(() => build(), 30);
  };

  /** Upload a syllabus/outline: extract server-side, ground the map (#30). */
  const onOutlineFile = (file: File) => {
    // Drop the previous outline up front: a re-upload must not ground the
    // map in the old source while the new one is still being read.
    setOutline(null);
    setUploadNote(tc().readingFile(file.name));
    const data = new FormData();
    data.append("file", file);
    fetch("/api/extract", { method: "POST", body: data })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          text?: string;
          error?: string;
        } | null;
        if (!res.ok || !json?.text)
          throw new Error(json?.error ?? tc().unreadableFile);
        setOutline(json.text);
        setUploadNote(tc().groundedIn(file.name));
      })
      .catch((err: Error) => {
        setOutline(null);
        setUploadNote(null);
        showError(err, { context: "upload" });
      });
  };

  /**
   * A diagnostic answer writes real mastery back: a correct answer prunes the
   * concept and its whole prerequisite chain (diagnosed known); a genuine miss
   * marks it learned-but-shaky and queues its gap sub-node for the first live
   * re-plan. A miss that reads as a "luck" slip (see `diagnosticEffect`) is
   * discounted to the same effect a correct answer gives — no gap spawned.
   *
   * It also steps the difficulty ladder (harder on correct, easier on a miss)
   * and fetches the next question at that level, since there is no batch to
   * pull from — the ENEM-style placement can't know question N+1 until N is
   * graded.
   */
  const answerDiagnostic = (optionIndex: number): DiagnosticEffect => {
    // All effects run here in the event handler, never inside a state
    // updater — React may invoke updaters more than once (#16).
    const idx = answeredRef.current;
    const q = diagnosticRef.current[idx];
    if (!q) return "shaky";
    const buildId = buildIdRef.current;
    const correct = optionIndex === q.correctIndex;
    const effect = diagnosticEffect(
      q.difficulty,
      correct,
      maxCorrectDifficultyRef.current,
    );
    if (correct) {
      const rank = (d: DiagnosticDifficulty) => ["easy", "medium", "hard"].indexOf(d);
      if (
        maxCorrectDifficultyRef.current === null ||
        rank(q.difficulty) > rank(maxCorrectDifficultyRef.current)
      )
        maxCorrectDifficultyRef.current = q.difficulty;
    }
    // Written as a value, not an updater, so the pool below can filter on the
    // post-answer truth — the placement is the only writer on this screen.
    const applied = applyDiagnosticEffect(
      statesRef.current,
      effect,
      q.nodeId,
      graphRef.current.edges,
    );
    setStates(applied);
    if (effect === "shaky") {
      setShakyReason(q.nodeId, "diagnostic-hesitation");
      if (q.gap) pendingGapsRef.current.push({ parentId: q.nodeId, spec: q.gap });
    }
    askedNodeIdsRef.current.push(q.nodeId);
    // A discounted miss is noise, not a signal — it writes back like a correct
    // answer, so it must not walk the ladder down either. Hold the level.
    const nextDifficulty =
      !correct && effect === "mastered"
        ? q.difficulty
        : stepDifficulty(q.difficulty, correct);
    nextDifficultyRef.current = nextDifficulty;

    const next = idx + 1;
    const maxG = Math.max(1, ...graphRef.current.nodes.map((n) => n.g));
    setReveal(Math.ceil((Math.min(next, DIAGNOSTIC_COUNT) / DIAGNOSTIC_COUNT) * maxG));
    setAnswered(next);
    if (next >= DIAGNOSTIC_COUNT) return effect;

    // Already-asked nodes are out, and so is everything the answers above
    // already pruned: re-probing settled territory spends one of five
    // questions to learn nothing, and a miss there would undo a prune.
    const pool = graphRef.current.nodes
      .filter(
        (n) => !askedNodeIdsRef.current.includes(n.id) && applied[n.id] !== "mastered",
      )
      .map((n) => ({ id: n.id, label: n.label }));
    // Nothing left worth probing — the placement has already learned all it
    // can. End it here instead of posting a request the server would reject.
    if (pool.length === 0) {
      setAnswered(DIAGNOSTIC_COUNT);
      return effect;
    }

    fetchDiagnosticQuestion({
      topic: formRef.current.topic,
      goal: formRef.current.goal,
      interests: formRef.current.interests,
      language: languageRef.current,
      pool,
      difficulty: nextDifficulty,
    })
      .then((question) => {
        // A question written for a map the learner has already left behind
        // must not land on the one that replaced it.
        if (buildIdRef.current === buildId) setDiagnostic((prev) => [...prev, question]);
      })
      .catch((err: unknown) => {
        // The writer stumbled mid-placement: stop asking and let what's
        // already known stand rather than leaving the panel waiting forever.
        if (buildIdRef.current !== buildId) return;
        setAnswered(DIAGNOSTIC_COUNT);
        // …and say so. Ending placement early in silence looks like the app
        // decided it had learned enough about them, which is a different and
        // much more confusing thing than "that step didn't work".
        showError(err, { context: "placement" });
      });
    return effect;
  };

  /**
   * The node the "Start here →" / "Jump to frontier" affordances target:
   * the top of the goal-ordered plan, not merely the leftmost lit node.
   */

  const startMap = () => {
    setScreen("map");
    const target = frontierTargetId();
    if (target) {
      setSelectedId(target);
      later(() => centerOn(target), 30);
    }
    // The first live re-plan: every hesitation the diagnostic caught splits
    // its sub-concept out under the parent, one "Map updated" beat at a time.
    const pending = pendingGapsRef.current.splice(0);
    pending.forEach(({ parentId, spec }, i) => {
      later(
        () => {
          const parent = graphRef.current.nodes.find((n) => n.id === parentId);
          if (parent && attachGap(parentId, spec))
            showToast(tc().gapAdded(spec.label, parent.label, spec.reason), tc().mapUpdated);
        },
        BUILD_MS + i * 1100,
      );
    });
  };

  // Content: the one seam every foreground generation goes through, and one
  // builder per kind for the inputs a warm and the click after it must share.

  /** Everything onboarding owns that a run switch has to clear. Called from
   *  `useRunState.applyRun` through a ref: the run mounts first (onboarding
   *  needs it), so it cannot name this directly. */
  const reset = useCallback(() => {
    setDiagnostic([]);
    setAnswered(0);
    setOutline(null);
    setUploadNote(null);
    setScopes(null);
    setBuildNote(null);
  }, []);

  return {
    reset,
    diagnostic,
    setDiagnostic,
    answered,
    setAnswered,
    reveal,
    outline,
    uploadNote,
    scopes,
    buildNote,
    build,
    pickScope,
    onOutlineFile,
    answerDiagnostic,
    startMap,
    askedNodeIdsRef,
    setOutline,
    setUploadNote,
    setScopes,
  };
}
