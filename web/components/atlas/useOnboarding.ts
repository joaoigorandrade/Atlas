"use client";

// Onboarding: topic in, map out.
//
// Its own module because it is the only flow that *creates* a run rather than
// reading one — it clears whatever was live, streams a graph in concept by
// concept, and runs the adaptive placement against the prefix that has arrived
// so far. Nothing downstream of the map needs any of it.

import { useCallback, useRef, useState } from "react";
import {
  emptyGraph,
  graphFromMapNodes,
  initialStates,
  type GapSpec,
} from "@/lib/curriculum";
import { fetchCurriculumMapStream, type ScopeOffer } from "@/lib/api";
import { placeholderView } from "@/components/onboarding/fakeMap";
import type { ViewTransform } from "@/components/map/MapCanvas";
import type { Language } from "@/lib/i18n";
import { openTopic } from "@/components/atlas/topicLifecycle";
import { useOutlineUpload } from "@/components/atlas/outlineUpload";
import type { Screen } from "@/components/atlas/screen";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { createWarmQueue } from "@/lib/warm";

/** Minimum time the map-assembly moment plays, even when generation is fast. */
const BUILD_MS = 2600;

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
  const { showToast, showError, tc } = toast;
  const {
    formRef,
    setForm,
    setGraph,
    setStates,
    setPositions,
    setSpawnedIds,
    setRunLanguage,
    setTopicId,
    clearRun,
  } = run;
  const { setLiveConsume, setLiveModel } = sessions;

  /** Uploaded-outline grounding + too-broad-topic scoping (#30). */
  const upload = useOutlineUpload(toast);
  const { outline, clearOutline } = upload;
  const [scopes, setScopes] = useState<ScopeOffer[] | null>(null);
  /** What the build has actually produced so far, named for the overlay.
   *  Indeterminate waits read ~30% longer than determinate ones, and this one
   *  now has real frames to count. */
  const [buildNote, setBuildNote] = useState<string | null>(null);

  /** Which build the arriving map frames belong to. A learner who re-submits
   *  (or picks a scope) starts a second stream while the first is still
   *  writing; without this token its concepts would land on top of the new map. */
  const buildIdRef = useRef(0);
  /** Set by `pickScope` for exactly the build it triggers. The learner has
   *  already answered the too-broad question, and a picked scope arrives as a
   *  bare label with the period or qualifier that bounded it left behind in
   *  the offer's note — so without this the model reads it as wide again and
   *  offers to scope it a second and third time, and church history never
   *  becomes a map. Consumed at the top of `build`, with any continent it joins. */
  const scopedRef = useRef<{ continentId: string | null } | null>(null);

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
  const build = useCallback(async () => {
    const topic = formRef.current.topic.trim();
    if (!topic) {
      showToast(tc().nameTopicFirst);
      return;
    }
    const buildId = ++buildIdRef.current;
    // Consumed here, so it applies to this build and no later one: a learner
    // who types a fresh topic after a scoped build is asking the open question
    // again and should get the offers back.
    const scoped = scopedRef.current;
    scopedRef.current = null;
    // A fresh map is generated in the UI language, so this is the one moment
    // the run's content language is known for certain.
    setRunLanguage(languageRef.current);
    /** Frames from an abandoned build — a re-submit, or a picked scope — must
     *  never land on the map that replaced it. */
    const current = () => buildIdRef.current === buildId;

    setScreen("building");
    setScopes(null);
    setBuildNote(null);
    setView(placeholderView(formRef.current.goal, window.innerWidth, window.innerHeight));
    // The previous map is not this topic's map, and everything below is keyed
    // to its node ids. Clearing it up front stops the assembly beat animating
    // over the *old* territory, and stops a failed build persisting those nodes
    // under the new subject. Here rather than when the map lands, because the
    // map no longer lands at one moment.
    setGraph(emptyGraph());
    setPositions({});
    setStates({});
    setSpawnedIds(new Set());
    pendingGapsRef.current = [];
    setLiveConsume(null);
    setLiveModel(null);
    // `clearRun` covers the unfinished teach-backs too: missed here and in
    // `excludeTopic`, they used to survive into the new run's snapshot —
    // persisted under the new subject, keyed by node ids that no longer exist.
    clearRun();
    // A new map invalidates every warmed key — the node ids are about to
    // mean something else.
    warm.clear();
    // Before the generation, not after — see `openTopic`.
    const topicRow = await openTopic(
      { ...formRef.current, topic, continentId: scoped?.continentId },
      languageRef.current,
      (id) => current() && setTopicId(id), // a superseded build must not re-address the run
    );
    if (!current()) return topicRow.abandon(); // don't bill a stream nobody will see
    // The clock starts after it, not before: `BUILD_MS` is the floor the
    // *build* is held to, and the learner is watching concepts land, not a
    // topic row being created. Timing it from before the round trip took that
    // long off the map's head start and opened the placement panel over a map
    // still streaming in underneath it.
    const started = Date.now();
    const openAt = () => Math.max(0, BUILD_MS - (Date.now() - started));

    const params = {
      topic,
      topicId: topicRow.id ?? undefined,
      goal: formRef.current.goal,
      outline: outline ?? undefined,
      ...(scoped ? { scoped: true } : {}),
      language: languageRef.current,
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
    })
      .then((result) => {
        if (!current()) return;
        // Too broad for one map: offer scoped sub-maps instead (#30).
        if ("scopes" in result) {
          setScreen("welcome");
          setScopes(result.scopes);
          topicRow.abandon();
          return;
        }
        topicRow.adoptAxes(current);
        // No placement: the map is the product, opened as soon as it lands.
        later(() => startRef.current(), openAt());
      })
      .catch((err: Error) => {
        if (!current()) return;
        setScreen("welcome");
        topicRow.abandon();
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
    setTopicId,
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

  /** A picked scope becomes the topic and builds immediately (#30). The build
   *  it triggers is marked scoped so the offer cannot come back — see
   *  `scopedRef`. */
  const pickScope = (label: string, continentId: string | null = null) => {
    scopedRef.current = { continentId };
    setForm((prev) => ({ ...prev, topic: label }));
    setScopes(null);
    // formRef updates on render; build reads the ref, so defer one tick.
    later(() => build(), 30);
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
  /**
   * The node the "Start here →" / "Jump to frontier" affordances target:
   * the top of the goal-ordered plan, not merely the leftmost lit node.
   */

  const startRef = useRef(() => {}); // `build` is memoized above `startMap`
  const startMap = () => {
    setScreen("map");
    const target = frontierTargetId();
    if (target) {
      setSelectedId(target);
      later(() => centerOn(target), 30);
    }
  };
  startRef.current = startMap;

  /** Everything onboarding owns that a run switch has to clear. Called from
   *  `useRunState.applyRun` through a ref: the run mounts first (onboarding
   *  needs it), so it cannot name this directly. */
  const reset = useCallback(() => {
    clearOutline();
    setScopes(null);
    setBuildNote(null);
  }, [clearOutline]);

  return {
    reset,
    upload,
    scopes,
    buildNote,
    build,
    pickScope,
    startMap,
    setScopes,
  };
}
