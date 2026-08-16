"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyDiagnosticEffect,
  calibItems,
  calibOverCount,
  daysUntil,
  displayStates,
  emptyGraph,
  graphFromMapNodes,
  DIAGNOSTIC_COUNT,
  diagnosticEffect,
  stepDifficulty,
  GOALS,
  initialStates,
  localDay,
  markTodayMet,
  orderedFrontier,
  paceStatus,
  reviewCard,
  rolloverAdherence,
  toggleReminder,
  unmetPathOf,
  type ConceptNode,
  type DiagnosticDifficulty,
  type DiagnosticEffect,
  type DiagnosticQuestion,
  type GapSpec,
  type NodeState,
  type StateMap,
  type ProgressState,
} from "@/lib/curriculum";
import { dueCards } from "@/lib/fsrs";
import {
  fetchCachedContent,
  fetchCurriculumMapStream,
  fetchDiagnosticQuestion,
  type ScopeOffer,
} from "@/lib/api";
import { createWarmQueue } from "@/lib/warm";
import { type Language, languageAction, useLanguage } from "@/lib/i18n";
import { InkRule } from "@/components/Pending";
import { color, font } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { deleteRun, type LoadedRun } from "@/lib/persistence";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import {
  FAKE_MAP_CENTER,
  FAKE_MAP_EDGES,
  FAKE_MAP_NODES,
  FAKE_MAP_POSITIONS,
} from "@/components/onboarding/fakeMap";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import DashboardScreen from "@/components/DashboardScreen";
import ProfileScreen, { type ProfileStat } from "@/components/ProfileScreen";
import SettingsScreen from "@/components/SettingsScreen";
import ConsumeView from "@/components/session/ConsumeView";
import SocraticView from "@/components/session/SocraticView";
import FeynmanView from "@/components/session/FeynmanView";
import ConnectView from "@/components/session/ConnectView";
import CrucibleView from "@/components/session/CrucibleView";
import RetainView from "@/components/session/RetainView";
import CalibrationView from "@/components/analytics/CalibrationView";
import GeneratingOverlay from "@/components/GeneratingOverlay";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas, { CELEBRATE_MS } from "@/components/map/MapCanvas";
import { usePresence, useEarned } from "@/lib/motion";
import { useToast } from "@/components/atlas/useToast";
import { useViewport } from "@/components/atlas/useViewport";
import { useCanvas } from "@/components/atlas/useCanvas";
import { useSessionState } from "@/components/atlas/useSessionState";
import { useRunState } from "@/components/atlas/useRunState";
import {
  useGeneration,
  warmKindsFor,
  type WarmKind,
} from "@/components/atlas/useGeneration";
import { useSpiral } from "@/components/atlas/useSpiral";
import { SHEET_SCREENS, type Screen } from "@/components/atlas/screen";
import { exportCardsCsv, exportCardsJson, exportMap } from "@/components/atlas/exporters";
import { SHEET_EXIT_MS } from "@/components/Sheet";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar from "@/components/map/TopBar";
import Toast from "@/components/Toast";
import ScreenTimer from "@/components/ScreenTimer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import OfflineBanner from "@/components/OfflineBanner";
import { AtlasError, codeForStatus, isErrorCode } from "@/lib/errors";
import { ERROR_STRINGS } from "@/lib/errorCopy";
import { logWarning } from "@/lib/log";
import { useOnline } from "@/lib/online";

/** The state changes worth marking on the map. Reaching the frontier isn't one
 *  — that's derived, and it's the map telling you where to go, not a result. */
const isEarned = (next: ProgressState) =>
  next === "mastered" || next === "gap" || next === "shaky";

/** Minimum time the map-assembly moment plays, even when generation is fast. */
const BUILD_MS = 2600;

/** Concepts that must have streamed in before the first placement question is
 *  asked for. The map arrives foundations-first, so this prefix is exactly the
 *  material an opening question should probe — and firing here overlaps the two
 *  cold generations instead of serializing them. */
const DIAGNOSTIC_POOL_MIN = 8;

export default function AtlasApp({
  userEmail,
  initialRun,
}: {
  userEmail: string;
  /** The saved run's core, already read on the server (see app/page.tsx).
   *  `undefined` means "not provided" — fall back to loading it here; `null`
   *  means "read, and there is no saved run". */
  initialRun?: LoadedRun | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  // The learner's chosen UI language — threaded into every generation/judge
  // call so AI content comes back in it too (a ref, like `formRef` etc.
  // below, so it can be read from stable callbacks without widening their
  // dependency arrays).
  const { language, adoptLanguage, settled, explicit } = useLanguage();
  // The background warm queue: content for the phases just ahead is fetched
  // while the learner works, so entering them is a state change, not a wait.
  // A foreground click on something already warming joins that request rather
  // than starting a second one.
  const warm = useMemo(() => createWarmQueue(), []);
  // The live phase sessions and the streams feeding them.
  const sessions = useSessionState();
  const {
    consume,
    setConsume,
    liveConsume,
    setLiveConsume,
    liveModel,
    setLiveModel,
    socratic,
    liveSocratic,
    feynman,
    liveFeynman,
    connect,
    crucible,
    retain,
    consumeChunksRef,
    reset: resetSessions,
  } = sessions;
  const [screen, setScreen] = useState<Screen>("welcome");
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The generated placement diagnostic — arrives with the graph.
  const [diagnostic, setDiagnostic] = useState<DiagnosticQuestion[]>([]);
  // The "AI is writing this" overlay, or null.
  const [loading, setLoading] = useState<{
    phase: string;
    message: string;
  } | null>(null);
  // Held so the overlay has copy to render while it fades out.
  const lastLoading = useRef<{ phase: string; message: string } | null>(null);
  if (loading) lastLoading.current = loading;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
  // A server judge round-trip is in flight (#25-#27) — views disable inputs.
  const [judging, setJudging] = useState(false);
  // A dashboard topic exclusion is in flight. State rather than a ref on
  // purpose: it also flips `runActive` off the moment the learner confirms, so
  // the pending save debounces are cleared and no write can re-create the row
  // between the delete landing and the local run being cleared.
  const [excluding, setExcluding] = useState(false);
  // Uploaded-outline grounding + too-broad-topic scoping (#30).
  const [outline, setOutline] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [scopes, setScopes] = useState<ScopeOffer[] | null>(null);
  /** What the build has actually produced so far, named for the overlay.
   *  Indeterminate waits read ~30% longer than determinate ones, and this one
   *  now has real frames to count. */
  const [buildNote, setBuildNote] = useState<string | null>(null);
  // Viewport width drives the minimum responsive pass (#8).
  const { vw, railOpen, setRailOpen, detailOpen, setDetailOpen } = useViewport();
  /** A reading pass whose stream died after some sections had landed. What
   *  arrived stays on screen; this is the notice pinned under it. */
  const [consumeFailed, setConsumeFailed] = useState<{
    nodeId: string;
    retry: () => void;
  } | null>(null);
  const online = useOnline();
  /** Re-runs the judge for a Socratic turn whose grading failed — held here so
   *  the failed bubble can offer it, not just the toast. */
  const [socraticRetry, setSocraticRetry] = useState<(() => void) | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  // Generated content carries the language of the prompt that wrote it and
  // nothing else, so switching language mid-run must drop every cached
  // surface — otherwise the learner keeps reading the old language back out
  // of memory (and out of the saved snapshot) forever.
  const contentLanguageRef = useRef(language);

  const toastChannel = useToast(supabase, languageRef);
  const { toast, dismissToast, showToast, showError } = toastChannel;

  const diagnosticRef = useRef(diagnostic);
  diagnosticRef.current = diagnostic;
  const answeredRef = useRef(answered);
  answeredRef.current = answered;
  // Adaptive placement state: which concepts have already been asked (never
  // repeat one), the difficulty the next question should be pitched at, and
  // the hardest level answered correctly so far — the evidence the "luck"
  // read in `diagnosticEffect` leans on.
  const askedNodeIdsRef = useRef<string[]>([]);
  /** Which build the arriving map frames belong to. A learner who re-submits
   *  (or picks a scope) starts a second stream while the first is still
   *  writing; without this token its concepts would land on top of the new map. */
  const buildIdRef = useRef(0);
  const nextDifficultyRef = useRef<DiagnosticDifficulty>("medium");
  const maxCorrectDifficultyRef = useRef<DiagnosticDifficulty | null>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const judgingRef = useRef(judging);
  judgingRef.current = judging;
  // Gap specs queued by hesitant diagnostic answers, spawned once the map opens.
  const pendingGapsRef = useRef<Array<{ parentId: string; spec: GapSpec }>>([]);
  // Assigned in the derived section below; read by event handlers.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const momentumRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Both boxes are read at cleanup time on purpose — the timers to clear are
    // whatever is outstanding when the component goes away, not whatever was
    // outstanding when it mounted. Captured here so the rule can see that.
    const timers = timersRef.current;
    const momentum = momentumRef;
    return () => {
      timers.forEach(clearTimeout);
      if (momentum.current) clearInterval(momentum.current);
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  /** The onboarding/selection state a run switch has to clear — neither run
   *  state nor session state, so `useRunState` is handed it rather than
   *  reaching for it. */
  const resetTransient = useCallback(() => {
    setSelectedId(null);
    setDiagnostic([]);
    setAnswered(0);
    pendingGapsRef.current = [];
    setMomentumPlaying(false);
    setOutline(null);
    setUploadNote(null);
    setScopes(null);
  }, []);

  // The run: the persisted map, its progress, its cached content, and the
  // loaders and debounced writers that keep all three on the server.
  const run = useRunState({
    supabase,
    warm,
    screen,
    excluding,
    setScreen,
    showError,
    resetSessions,
    resetTransient,
    initialRun,
  });

  const {
    form,
    setForm,
    graph,
    setGraph,
    graphRef,
    spawnedIds,
    setSpawnedIds,
    summaryFailed,
    states,
    setStates,
    statesRef,
    positions,
    setPositions,
    positionsRef,
    runLanguage,
    setRunLanguage,
    consumeCache,
    modelCache,
    socraticCache,
    feynmanCache,
    connectCache,
    crucibleCache,
    retainContent,
    consumeProgress,
    setSocraticProgress,
    setFeynmanProgress,
    adherence,
    setAdherence,
    litToday,
    setLitToday,
    calibSamples,
    setCalibSamples,
    shakyReasons,
    setShakyReasons,
    reviewedNodes,
    setReviewedNodes,
    cards,
    setCards,
    cardsRef,
    formRef,
    hydrated,
    setCachesLoaded,
    saveFailed,
    runSubject,
    maps,
    setMaps,
    mapsFailed,
    refreshMaps,
    switchMap,
    setShakyReason,
    attachGap,
    clearRun,
    clearCaches,
  } = run;

  // ---- day rollover (#22): judge passed days whenever the calendar turns —
  // on load (after hydration applies it too) and once a minute while open.
  useEffect(() => {
    const tick = () => {
      setAdherence((prev) =>
        prev.lastDay && prev.lastDay !== localDay() ? rolloverAdherence(prev) : prev,
      );
    };
    const id = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [setAdherence]);

  // Clearing the daily queue is the honest "done for today" — it marks the day
  // met, so the streak ticks forward and the flame reads lit everywhere.
  useEffect(() => {
    if (retain?.finished) setAdherence((prev) => markTodayMet(prev));
  }, [retain?.finished, setAdherence]);

  const onToggleReminder = () => setAdherence((prev) => toggleReminder(prev));

  const displayRef = useRef<Record<string, NodeState>>({});
  const { view, setView, onWheel, onCanvasDown, onNodeDown, centerOn } = useCanvas({
    setSelectedId,
    displayRef,
    showToast,
    positionsRef,
    setPositions,
  });

  // Which language wins, and whether a change is a *switch* (regenerate) or
  // merely the app working out where it is (leave everything alone).
  //
  // `settled` is what makes this correct: detection needs `window`, so the
  // first render is always the "pt-BR" placeholder and the real language lands
  // an effect later — after this component has already hydrated the run. Acting
  // on that transition treated every device whose locale disagreed with the run
  // as a deliberate language switch, and dropped the caches mid-load.
  useEffect(() => {
    const action = languageAction({
      settled,
      explicit,
      runLanguage,
      language,
      contentLanguage: contentLanguageRef.current,
    });
    if (action === "wait" || action === "none") return;
    if (action === "adopt") {
      // `runLanguage` is defined whenever the decision is "adopt".
      contentLanguageRef.current = runLanguage as Language;
      adoptLanguage(runLanguage as Language);
      return;
    }
    contentLanguageRef.current = language;
    // Everything is about to be regenerated in the new language, so from here
    // the run's language is known — whatever it was before.
    setRunLanguage(language);
    warm.clear();
    clearCaches();
  }, [
    language,
    settled,
    explicit,
    runLanguage,
    adoptLanguage,
    warm,
    clearCaches,
    setRunLanguage,
  ]);

  // The live session is the source of truth while it's open; this mirrors it
  // into the persisted per-node record. A finished pass drops out — coming
  // back to a node you completed should offer the pass again, not the
  // "understood" panel. A turn still being written is skipped: what's saved
  // stays the last complete state rather than a bubble stuck on its dots.
  useEffect(() => {
    if (!socratic || socratic.log.some((t) => t.pending)) return;
    const { nodeId } = socratic;
    setSocraticProgress((prev) => {
      if (socratic.done) {
        if (!prev[nodeId]) return prev;
        const { [nodeId]: _gone, ...rest } = prev;
        return rest;
      }
      return { ...prev, [nodeId]: socratic };
    });
  }, [socratic, setSocraticProgress]);

  // Same mirror for the teach-back. A pass mid-judgement is skipped — what's
  // saved stays the last complete state — and a finished one drops out in
  // `advanceFromFeynman`, once its gaps have actually reached the map.
  useEffect(() => {
    if (!feynman || feynman.pending) return;
    const { nodeId } = feynman;
    setFeynmanProgress((prev) => ({ ...prev, [nodeId]: feynman }));
  }, [feynman, setFeynmanProgress]);

  const signOut = () => {
    // Navigate either way: a failed sign-out still means the learner asked to
    // leave, and /login clears the client session on arrival. The unhandled
    // rejection this used to throw left them sitting on the map instead.
    supabase.auth
      .signOut()
      .catch((err: unknown) => logWarning("sign_out_failed", err))
      .finally(() => {
        window.location.href = "/login";
      });
  };

  /** Delete account + all data (#33). Confirm, then the server wipes the rows. */
  const deleteAccount = () => {
    if (
      !window.confirm(
        "Delete your account and all data — map, cards, streak? This cannot be undone.",
      )
    )
      return;
    fetch("/api/account/delete", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as {
            code?: string;
          } | null;
          throw new AtlasError(
            isErrorCode(body?.code) ? body.code : codeForStatus(r.status),
            `account delete failed (${r.status})`,
            {
              status: r.status,
              requestId: r.headers.get("x-atlas-request-id") ?? undefined,
            },
          );
        }
        window.location.href = "/login";
      })
      .catch((err: unknown) => showError(err, { context: "account" }));
  };

  // ---- Home (dashboard) + profile navigation ---------------------------

  const enterDashboard = () => {
    setScreen("dashboard");
    refreshMaps();
  };
  const enterProfile = () => setScreen("profile");
  const openMap = useCallback(() => setScreen("map"), []);
  /** "+ New map" — onboarding builds a new run alongside whatever's saved. */
  const newMap = useCallback(() => setScreen("welcome"), []);

  /**
   * "Exclude this topic" on a dashboard map card (confirmed there first): the
   * saved run is deleted outright. Excluding the live map also clears it from
   * memory — graph, mastery states, cards, calibration, every generated cache
   * — and returns to the dashboard with whatever maps remain; onboarding only
   * shows up if that was the learner's last map. Excluding any other map just
   * drops its row and refreshes the grid.
   *
   * `excluding` gates `runActive`, so the debounced writers are already off by
   * the time the delete lands; nothing can re-upsert the row behind it.
   * Adherence is deliberately untouched: the streak is the learner's habit,
   * not the topic's, and fabricating a reset would be the dishonest read.
   */
  const excludeTopic = (subject: string) => {
    setExcluding(true);
    deleteRun(supabase, subject)
      .then(() => {
        if (subject !== runSubject) {
          refreshMaps();
          showToast(`“${subject}” excluded`);
          return;
        }
        // Every warmed key belongs to node ids that no longer exist.
        warm.clear();
        setGraph(emptyGraph());
        setStates({});
        setPositions({});
        setSpawnedIds(new Set());
        pendingGapsRef.current = [];
        setSelectedId(null);
        setDiagnostic([]);
        setAnswered(0);
        setConsume(null);
        setLiveConsume(null);
        resetSessions();
        clearRun();
        setCards([]);
        setCalibSamples([]);
        setShakyReasons({});
        setReviewedNodes([]);
        setLitToday([]);
        setMomentumPlaying(false);
        setOutline(null);
        setUploadNote(null);
        setScopes(null);
        setForm((prev) => ({ ...prev, topic: "" }));
        const others = maps.filter((m) => m.subject !== subject);
        if (others.length) {
          setMaps(others);
          setScreen("dashboard");
          showToast(`“${subject}” excluded`);
        } else {
          setScreen("welcome");
          showToast(`Name a topic to build your next map.`, `“${subject}” excluded`);
        }
      })
      .catch((err: unknown) => showError(err, { context: "exclude" }))
      .finally(() => setExcluding(false));
  };
  const enterSettings = useCallback(() => setScreen("settings"), []);
  const exitSettings = useCallback(() => setScreen("map"), []);

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
      showToast("Name a topic first — the map is generated from it");
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
    setUploadNote(`Reading ${file.name}…`);
    const data = new FormData();
    data.append("file", file);
    fetch("/api/extract", { method: "POST", body: data })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          text?: string;
          error?: string;
        } | null;
        if (!res.ok || !json?.text)
          throw new Error(json?.error ?? "Couldn't read that file");
        setOutline(json.text);
        setUploadNote(`Grounded in ${file.name} ✓ — the map will follow its outline`);
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
  const frontierTargetId = useCallback(() => {
    const plan = orderedFrontier(displayRef.current, graphRef.current, form.goal);
    return plan[0]?.node.id ?? null;
  }, [form.goal, graphRef]);

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
            showToast(
              `Added ${spec.label} under ${parent.label} — ${spec.reason}`,
              "Map updated",
            );
        },
        BUILD_MS + i * 1100,
      );
    });
  };

  // Content: the one seam every foreground generation goes through, and one
  // builder per kind for the inputs a warm and the click after it must share.
  const gen = useGeneration({
    run,
    warm,
    languageRef,
    loadingRef,
    setLoading,
    showError,
  });
  const { modelKey, isCached, requestFor, applyWarmHit, warmOne } = gen;

  /**
   * Hovering a node is 150-400 ms of lead time on the click that usually
   * follows, and the pass in `warmTargets` deliberately settles for 600 ms
   * before it fires. Starting the node's first surface on hover spends nothing
   * extra — `warm.warm` dedupes by key, so the click joins this request
   * instead of making a second one — and buys back that settle.
   */
  const hoverNode = (id: string | null) => {
    setHoverId(id);
    if (!id) return;
    const node = graphRef.current.nodes.find((n) => n.id === id);
    if (!node) return;
    // The hover card says what the concept is, same as the rail — so a node
    // still missing its sentence starts writing one on the hover rather than
    // on the click that may not come for another half second.
    if (!node.summary) warmOne("summary", node);
    const kind = warmKindsFor(displayRef.current[id])[0];
    if (kind) warmOne(kind, node);
  };

  // The spiral: opening a phase, running it, and advancing out of it.
  const {
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
    dispatchSocratic,
    socraticAnswer,
    exitSocratic,
    dispatchFeynman,
    feynmanTeach,
    exitFeynman,
    dispatchConnect,
    exitConnect,
    advanceFromFeynman,
    advanceFromConnect,
    dispatchCrucible,
    crucibleSubmit,
    advanceFromCrucible,
    exitCrucible,
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
  } = useSpiral({
    run,
    sessions,
    gen,
    toast: toastChannel,
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
  });

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  // The full-screen surfaces. They animate out, which means the screen they
  // belong to has to outlive `screen` moving on — `sheetScreen` lags behind for
  // exactly the length of the leave. Their session state is not torn down on
  // exit (`exitConsume` and friends only set the screen), so the outgoing view
  // still has everything it needs to draw those last frames.
  const onSheet = SHEET_SCREENS.has(screen);
  const sheet = usePresence(onSheet, SHEET_EXIT_MS);
  const lastSheet = useRef<Screen | null>(null);
  if (onSheet) lastSheet.current = screen;
  const sheetScreen = onSheet ? screen : lastSheet.current;
  // …and stops lagging once the leave is over. `sheetScreen` alone never goes
  // back to null, so rendering off it left the last sheet mounted for the rest
  // of the run: `sheetOut` fills to opacity 0, but an inset-0 element at
  // z-index 30 still swallows every click meant for the map behind it. The
  // `onSheet ||` covers the entry frame, where `mounted` is still catching up
  // in an effect and the map would otherwise flash through.
  const openSheet = onSheet || sheet.mounted ? sheetScreen : null;
  // The canvas backs onboarding + the map, but Consume is a full surface.
  // Kept mounted underneath a sheet as well, so a session genuinely rises off
  // the map and settles back onto it instead of onto blank paper. The canvas is
  // inert behind an opaque surface — it re-renders only when the graph or the
  // mastery states move, which during a session is a handful of times.
  const showCanvas =
    screen === "building" || screen === "diagnostic" || screen === "map" || sheet.mounted;
  // Before the real map exists, assemble a placeholder territory instead of
  // an empty canvas — swapped for the real graph the instant it streams in.
  const usingFakeMap = screen === "building" && graph.nodes.length === 0;

  // What the canvas shows: the live state map, masked during onboarding
  // (generations beyond the diagnostic reveal stay hidden) and during the
  // momentum replay (states that lit after the replay week stay hidden).
  const visibleStates = useMemo<StateMap>(
    () =>
      Object.fromEntries(
        graph.nodes.map((n) => [
          n.id,
          (!isMap && n.g > reveal) || (momentumPlaying && n.week > momentumWeek)
            ? "unknown"
            : states[n.id],
        ]),
      ),
    [graph, isMap, reveal, momentumPlaying, momentumWeek, states],
  );
  // Concepts the learner just moved. Tracked against stored progress rather
  // than `display`, which is masked during onboarding and by the replay, and
  // released only once the map is actually on screen — the state is usually
  // written mid-session, several seconds before there is anything to see it.
  // The momentum replay steps whole weeks at a time and is never a moment.
  const earnedNodes = useEarned(states, isEarned, {
    visible: isMap,
    enabled: !momentumPlaying,
    ms: CELEBRATE_MS,
  });

  const display = useMemo(
    () => displayStates(visibleStates, graph),
    [visibleStates, graph],
  );
  displayRef.current = display;

  const masteredCount = graph.nodes.filter((n) => states[n.id] === "mastered").length;
  const masteryPct = graph.nodes.length
    ? Math.round((masteredCount / graph.nodes.length) * 100)
    : 0;

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedDisplayState: NodeState | null = selectedNode
    ? display[selectedNode.id]
    : null;

  // "Learn these first": a selected locked node highlights its unlearned
  // prerequisite chain on the canvas.
  const lockedPath = useMemo(
    () =>
      isMap && selectedId && display[selectedId] === "unknown"
        ? unmetPathOf(selectedId, states, graph)
        : null,
    [isMap, selectedId, display, states, graph],
  );

  // The plan, continuously re-derived: the frontier ordered to the goal…
  const allFrontier = useMemo(
    () => orderedFrontier(display, graph, form.goal),
    [display, graph, form.goal],
  );
  // Only the top 3 are worth naming in the UI ("next up")…
  const nextUp = useMemo(() => allFrontier.slice(0, 3), [allFrontier]);
  // ---- the warm pass ----------------------------------------------------
  // …but every frontier node's reading pass is worth having ready: a learner
  // picks whichever unlocked topic they like, not necessarily the goal-ordered
  // one, so anything less than "all of them" still shows a loading screen on
  // the "wrong" click. A 12-18 node map keeps this small regardless, and the
  // warm queue's own concurrency cap (`MAX_CONCURRENT` in lib/warm.ts) throttles
  // how many actually run at once — this list is just what's worth wanting.
  //
  // Runs regardless of which screen is open (map or mid-spiral) — a learner
  // reading one node's Consume is exactly when the next node's should be
  // warming, and when this node's own state flips to "learning" mid-spiral,
  // this same pass is what picks up Feynman/Connect for it next. Computed
  // without consulting the caches so filling them doesn't re-trigger the pass.
  const warmTargets = useMemo(() => {
    if (!hydrated || graph.nodes.length === 0) return [];
    const ids: string[] = [];
    if (selectedId) ids.push(selectedId);
    for (const { node } of allFrontier) ids.push(node.id);
    for (const n of graph.nodes) {
      const state = display[n.id];
      if (state === "learning" || state === "shaky" || state === "gap") ids.push(n.id);
    }
    const seen = new Set<string>();
    const targets: Array<{ node: ConceptNode; kinds: WarmKind[] }> = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) continue;
      // The rail's own sentence leads: it is by far the smallest generation
      // here, and the only one a learner reads without opening anything. Nodes
      // whose map already wrote one — and gap sub-nodes, which are their own
      // explanation — ask for nothing.
      const kinds: WarmKind[] = node.summary || node.gap ? [] : ["summary"];
      kinds.push(...warmKindsFor(display[id]));
      if (kinds.length) targets.push({ node, kinds });
    }
    return targets;
  }, [hydrated, graph, display, selectedId, allFrontier]);

  // A signature over the plan, so the pass runs when the plan really changes
  // rather than on every render that touches the graph.
  const warmSignature = warmTargets
    .map((t) => `${t.node.id}:${t.kinds.join("+")}`)
    .join("|");

  useEffect(() => {
    if (!warmSignature) return;
    let cancelled = false;
    // Settle first: clicking along a chain of nodes shouldn't fire a pass per
    // click, and the learner is reading, not waiting.
    const timer = setTimeout(() => {
      // One round-trip asks which of these are already generated — by this
      // learner or anyone before them — and takes them straight into memory.
      // Only what's genuinely missing reaches the model, in the background.
      const wanted = warmTargets.flatMap(({ node, kinds }) =>
        kinds
          .filter((kind) => !isCached(kind, node.id))
          .map((kind) => ({ kind, node, body: requestFor(kind, node) })),
      );
      const items = wanted.filter(
        (w): w is typeof w & { body: Record<string, unknown> } => w.body !== null,
      );
      if (items.length === 0) return;
      void fetchCachedContent(items.map((i) => i.body)).then((hits) => {
        if (cancelled) return;
        items.forEach((item, index) => {
          const hit = hits[index];
          if (hit !== undefined) applyWarmHit(item.kind, item.node.id, hit);
          else warmOne(item.kind, item.node);
        });
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // warmTargets is captured through its signature on purpose — the effect
    // must not re-run just because the array identity changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmSignature]);

  // The Review queue's card factory, drafted ahead of the click the same way.
  const uncoveredSignature = useMemo(
    () =>
      isMap && hydrated
        ? graph.nodes
            .filter(
              (n) =>
                !n.gap &&
                ["learning", "shaky", "mastered"].includes(states[n.id] ?? "") &&
                !cards.some((c) => c.nodeId === n.id),
            )
            .map((n) => n.id)
            .join(",")
        : "",
    [isMap, hydrated, graph, states, cards],
  );

  useEffect(() => {
    if (!uncoveredSignature) return;
    // A long settle: the uncovered set moves on every phase completion, and
    // each distinct set is its own generation. Only a stable one is worth
    // drafting ahead.
    const timer = setTimeout(warmRetain, 8000);
    return () => clearTimeout(timer);
  }, [uncoveredSignature, warmRetain]);

  // …and the pace check against the real deadline (#23) — an exam goal
  // without a date gets no fabricated countdown.
  const pace = useMemo(
    () =>
      // A date that has already passed is not a deadline — it would divide the
      // remaining territory by a floor of one day and demand a fabricated
      // 12-hour pace. No countdown beats a wrong one (#23).
      form.goal === "exam" && daysUntil(form.examDate) > 0
        ? paceStatus(states, graph, form.target, daysUntil(form.examDate))
        : null,
    [form.goal, form.examDate, form.target, states, graph],
  );

  // The live calibration readings, resolved against the node labels — read by
  // the Calibration surface and the left-rail "N over" alert.
  const calib = useMemo(
    () =>
      calibItems(calibSamples, (id) => graph.nodes.find((n) => n.id === id)?.label ?? id),
    [calibSamples, graph],
  );

  const consumeChunks = consume
    ? (consumeCache[consume.nodeId] ??
      (liveConsume?.nodeId === consume.nodeId ? liveConsume.chunks : undefined))
    : undefined;
  // True while the open session's pass is still being written — gates the
  // "Continue"/"Finish" affordance on the deepest streamed-in section so it
  // never reaches for a section that hasn't arrived yet.
  const consumeStreaming = !!consume && !consumeCache[consume.nodeId];
  consumeChunksRef.current = consumeChunks ?? [];
  // The open model view, if any: committed beats, else the ones streaming in.
  const openModelKey =
    consume && consume.model
      ? modelKey(consume.nodeId, consume.model.chunkId, consume.model.lens)
      : null;
  const modelBeats = openModelKey
    ? (modelCache[openModelKey] ??
      (liveModel?.key === openModelKey ? liveModel.beats : undefined))
    : undefined;
  // Beats are still on the way unless the view is committed, or what streamed
  // in is all there is ever going to be.
  const modelStreaming =
    !!openModelKey &&
    !modelCache[openModelKey] &&
    !(liveModel?.key === openModelKey && liveModel.done);
  // Same fallback as Consume: the committed pass if it exists, otherwise
  // whatever has streamed in for this node so far.
  const socraticSteps = socratic
    ? (socraticCache[socratic.nodeId] ??
      (liveSocratic?.nodeId === socratic.nodeId ? liveSocratic.steps : undefined))
    : undefined;
  const feynmanBeats = feynman
    ? (feynmanCache[feynman.nodeId] ??
      (liveFeynman?.nodeId === feynman.nodeId ? liveFeynman.beats : undefined))
    : undefined;
  const connectContent = connect ? connectCache[connect.nodeId] : undefined;
  const crucibleContent = crucible ? crucibleCache[crucible.nodeId] : undefined;

  // ---- Home (dashboard) + profile derived ------------------------------

  // The account, read into an avatar initial and a friendly display name —
  // honest, derived from the email, never a fabricated identity.
  const emailLocal = (userEmail.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  const nameParts = emailLocal.split(/\s+/).filter(Boolean);
  const displayName =
    nameParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || "there";
  const initials =
    (nameParts.length >= 2
      ? nameParts[0][0] + nameParts[1][0]
      : emailLocal.slice(0, 2)
    ).toUpperCase() || "A";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date()
    .toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  // The honest queue chip, read from the real card store (#21): cards
  // actually due now, in minutes.
  const dueNow = useMemo(() => dueCards(cards).length, [cards]);
  const queue = { minutes: Math.ceil(dueNow * 1.5), cards: dueNow };
  const frontierTotal = graph.nodes.filter((n) => display[n.id] === "frontier").length;
  const frontierConcept = nextUp[0]?.node.label ?? null;
  const subject = form.topic.trim() || "Your map";
  const goalLabel = GOALS.find(([g]) => g === form.goal)?.[1] ?? "General mastery";

  // The dashboard's "Your maps" grid: the live run's numbers stay live (they
  // update mid-session, before any save lands); every other saved map reads
  // off its last-saved snapshot from `maps`.
  const mapCards = useMemo(() => {
    const others = maps
      .filter((m) => m.subject !== runSubject)
      .map((m) => {
        const otherDisplay = displayStates(m.states, m.graph);
        const mastered = m.graph.nodes.filter(
          (n) => m.states[n.id] === "mastered",
        ).length;
        return {
          subject: m.subject,
          goalLabel: GOALS.find(([g]) => g === m.goal)?.[1] ?? "General mastery",
          masteryPct: m.graph.nodes.length
            ? Math.round((mastered / m.graph.nodes.length) * 100)
            : 0,
          frontierTotal: m.graph.nodes.filter((n) => otherDisplay[n.id] === "frontier")
            .length,
        };
      });
    return graph.nodes.length
      ? [{ subject, goalLabel, masteryPct, frontierTotal }, ...others]
      : others;
  }, [maps, runSubject, graph, subject, goalLabel, masteryPct, frontierTotal]);

  const interests = form.interests
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const profileStats: ProfileStat[] = [
    { value: `${adherence.streak}`, label: "Day streak", accent: true },
    { value: `${masteredCount}`, label: "Concepts mastered" },
    { value: `${frontierTotal}`, label: "On the frontier" },
    { value: `${masteryPct}%`, label: "Map mastered" },
  ];
  const reviewSummary = adherence.metToday
    ? "Today's queue is clear — new cards surface as memories fade"
    : `${queue.cards} card${queue.cards === 1 ? "" : "s"} due today · ~${queue.minutes} min budget`;

  // Hold the paper blank until the saved-run fetch settles — a resumed run
  // must open on the map, never flash the welcome screen first. The mark is
  // delayed past a fast hydration so a quick resume never flashes a spinner.
  if (!hydrated) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: color.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", animation: "softIn 0.5s 0.4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 16,
            }}
          >
            Atlas · learn anything, deeply
          </div>
          <InkRule width={180} />
        </div>
      </div>
    );
  }

  // Below the hard minimum a polished gate beats a broken layout (#8).
  if (vw < 768) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: color.paper,
          color: color.ink,
          fontFamily: font.sans,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 380, animation: "fadeUp 0.4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 16,
            }}
          >
            Atlas · learn anything, deeply
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 28,
              lineHeight: 1.2,
              marginBottom: 14,
            }}
          >
            Atlas is best on a desktop screen
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: color.inkSoft }}>
            The living concept map needs room to breathe. Open Atlas on a laptop or
            desktop — your progress is saved to your account and will be right where you
            left it.
          </div>
        </div>
      </div>
    );
  }
  const narrow = vw < 1280;
  const errorStrings = ERROR_STRINGS[language];

  /**
   * Wrap one session sheet so a throw inside it costs that sheet and nothing
   * else.
   *
   * This is the whole reason `ErrorBoundary` exists here. `AtlasApp` holds the
   * entire run in memory — graph, mastery states, every generated cache — and
   * persists it on a debounce, so before this an unhandled render error in any
   * phase view took all of it down to Next's default error page. Now the map is
   * still behind you and the way back is a button.
   *
   * `resetKeys` on the open sheet and the selected node means leaving and
   * re-entering clears the caught error without a reload.
   */
  const sheetBoundary = (children: ReactNode) => (
    <ErrorBoundary
      resetKeys={[sheetScreen, selectedId]}
      onError={(err) => logWarning("session_view_crashed", err, { sheetScreen })}
      fallback={(_err, reset) => (
        <ErrorState
          compact
          kicker={errorStrings.context.crash}
          message={errorStrings.code.unknown}
          body={errorStrings.crashBody}
          retryLabel={errorStrings.retry}
          onRetry={reset}
          secondary={{
            label: errorStrings.backToMap,
            onClick: () => {
              reset();
              setScreen("map");
            },
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );

  return (
    <div
      // The app's one addressable landmark: which screen is up, and which sheet
      // is over it (docs/AGENT-TESTING.md). Everything else an agent needs to
      // know about navigation is derivable from these two attributes, which is
      // why no screen needed a wrapper div to carry a testid.
      data-testid="app"
      data-screen={screen}
      data-sheet={openSheet ?? "none"}
      data-hydrated={hydrated ? "1" : "0"}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        // clip (not hidden) forbids programmatic scrolling — scrollIntoView on
        // off-screen canvas content can never drag the UI off-screen (#7).
        overflow: "clip",
        background: color.paper,
        color: color.ink,
        fontFamily: font.sans,
        fontSize: 15,
      }}
    >
      {showCanvas && (
        <MapCanvas
          screen={screen as "map" | "building" | "diagnostic"}
          nodes={usingFakeMap ? FAKE_MAP_NODES : graph.nodes}
          edges={usingFakeMap ? FAKE_MAP_EDGES : graph.edges}
          spawnedIds={spawnedIds}
          staggered={usingFakeMap}
          display={display}
          lockedPath={lockedPath}
          earned={earnedNodes}
          positions={usingFakeMap ? FAKE_MAP_POSITIONS : positions}
          view={view}
          selectedId={selectedId}
          hoverId={hoverId}
          consumeProgress={consumeProgress}
          reviewedNodes={reviewedNodes}
          shakyReasons={shakyReasons}
          query={query}
          onWheel={onWheel}
          onCanvasDown={onCanvasDown}
          onNodeDown={onNodeDown}
          onNodeSelect={(id) => {
            setSelectedId(id);
            centerOn(id);
          }}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeHover={hoverNode}
        />
      )}

      {screen === "building" && <BuildingOverlay note={buildNote} />}

      {screen === "diagnostic" && (
        <DiagnosticPanel
          questions={diagnostic}
          // The placement always asks this many, even when the panel opens on
          // the first one and the rest are still being written.
          expected={DIAGNOSTIC_COUNT}
          answered={answered}
          onAnswer={answerDiagnostic}
          onSkip={startMap}
          onStart={startMap}
        />
      )}

      {isMap && (
        <>
          <TopBar
            query={query}
            onQuery={setQuery}
            onSurface={onSurface}
            adherence={adherence}
            queue={queue}
            onToggleReminder={onToggleReminder}
            userEmail={userEmail}
            onHome={enterDashboard}
            onProfile={enterProfile}
          />
          {(!narrow || railOpen) && (
            <LeftRail
              subject={form.topic.trim() || "Your topic"}
              goal={form.goal}
              pace={pace}
              nextUp={nextUp}
              masteryPct={masteryPct}
              calibOver={calibOverCount(calib)}
              momentumPlaying={momentumPlaying}
              momentumWeek={momentumWeek}
              onJumpFrontier={jumpFrontier}
              onCalibration={enterCalib}
              onToggleMomentum={toggleMomentum}
              onPickNode={(id) => {
                setSelectedId(id);
                centerOn(id);
              }}
            />
          )}
          {/* Always mounted: the drawer owns its own enter and exit, so it
              needs to outlive the selection it is animating away from. */}
          <NodeDetail
            visible={!narrow || detailOpen}
            node={selectedNode}
            displayState={selectedDisplayState}
            nodes={graph.nodes}
            edges={graph.edges}
            display={display}
            reviewed={selectedNode ? reviewedNodes.includes(selectedNode.id) : false}
            shakyReason={selectedNode ? shakyReasons[selectedNode.id] : undefined}
            consumeProgress={selectedNode ? consumeProgress[selectedNode.id] : undefined}
            // A node with no sentence of its own has one on the way (the warm
            // pass and the hover both start it) — unless it already failed, or
            // there is no network to write it over.
            summaryWriting={
              !!selectedNode &&
              !selectedNode.summary &&
              !selectedNode.gap &&
              online &&
              !summaryFailed[selectedNode.id]
            }
            onSelect={setSelectedId}
            onPrimaryAction={onPrimaryAction}
            onPhaseAction={onPhaseAction}
            onSkipKnown={skipKnown}
          />
          {narrow && (
            // Collapsed-rail toggles for laptop-narrow widths (#8).
            <>
              <button
                className="at-press"
                onClick={() => setRailOpen((v) => !v)}
                style={{
                  position: "absolute",
                  top: 70,
                  left: railOpen ? 274 : 12,
                  zIndex: 16,
                  padding: "8px 11px",
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(44,40,35,0.08)",
                }}
              >
                {railOpen ? "⟨ Hide plan" : "Plan ⟩"}
              </button>
              {selectedNode && (
                <button
                  className="at-press"
                  onClick={() => setDetailOpen((v) => !v)}
                  style={{
                    position: "absolute",
                    top: 70,
                    right: detailOpen ? 368 : 12,
                    zIndex: 16,
                    padding: "8px 11px",
                    background: color.card,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 9,
                    fontSize: 12.5,
                    color: color.inkMuted,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(44,40,35,0.08)",
                  }}
                >
                  {detailOpen ? "Hide node ⟩" : "⟨ Node"}
                </button>
              )}
            </>
          )}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: !narrow || railOpen ? 280 : 18,
              fontFamily: font.mono,
              fontSize: 11,
              color: color.inkGhost,
              zIndex: 12,
            }}
          >
            scroll to zoom · drag canvas to pan · drag a node to move · double-click a lit
            node to begin
          </div>
        </>
      )}

      {screen === "welcome" && (
        <WelcomeScreen
          form={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onBuild={build}
          onFile={onOutlineFile}
          uploadNote={uploadNote}
          uploadBusy={uploadNote !== null && outline === null}
          scopes={scopes}
          onPickScope={pickScope}
        />
      )}

      {screen === "dashboard" && (
        <DashboardScreen
          greeting={greeting}
          name={displayName}
          dateLabel={dateLabel}
          initials={initials}
          streak={adherence.streak}
          queue={queue}
          metToday={adherence.metToday}
          subject={subject}
          activeSubject={runSubject}
          frontierConcept={frontierConcept}
          frontierTotal={frontierTotal}
          maps={mapCards}
          onOpenMap={openMap}
          onSelectMap={switchMap}
          onReview={enterReview}
          onProfile={enterProfile}
          onNewMap={newMap}
          onExcludeTopic={excludeTopic}
          excluding={excluding}
          mapsFailed={mapsFailed ? { onRetry: refreshMaps } : undefined}
        />
      )}

      {openSheet === "settings" && (
        <SettingsScreen
          presence={sheet.state}
          form={form}
          adherence={adherence}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onToggleReminder={onToggleReminder}
          onExportMap={() =>
            exportMap(formRef.current.topic, graphRef.current, statesRef.current)
          }
          onExportCardsJson={() =>
            exportCardsJson(formRef.current.topic, cardsRef.current)
          }
          onExportCardsCsv={() => exportCardsCsv(formRef.current.topic, cardsRef.current)}
          onDeleteAccount={deleteAccount}
          onExit={exitSettings}
        />
      )}

      {screen === "profile" && (
        <ProfileScreen
          name={displayName}
          userEmail={userEmail}
          initials={initials}
          stats={profileStats}
          goalLabel={goalLabel}
          interests={interests}
          reviewSummary={reviewSummary}
          onHome={enterDashboard}
          onReview={enterReview}
          onSettings={enterSettings}
          onSignOut={signOut}
        />
      )}

      {openSheet === "consume" &&
        consume &&
        consumeChunks &&
        sheetBoundary(
          <ConsumeView
            presence={sheet.state}
            title={graph.nodes.find((n) => n.id === consume.nodeId)?.label ?? "Concept"}
            chunks={consumeChunks}
            streaming={consumeStreaming}
            session={consume}
            modelBeats={modelBeats}
            modelStreaming={modelStreaming}
            onExit={exitConsume}
            onCheck={consumeCheck}
            onContinue={consumeContinue}
            onFinish={finishConsume}
            onBeginSocratic={beginSocraticFromConsume}
            onOpenModel={consumeOpenModel}
            onCloseModel={consumeCloseModel}
            onToggleTerm={consumeToggleTerm}
            onToggleCollapse={consumeToggleCollapse}
            onOpenPassage={consumeOpenPassage}
            onClosePassage={consumeClosePassage}
            onAskPassage={consumeAskPassage}
            onSkipCrucible={consumeSkipCrucible}
            onRoutePrereq={consumeRoutePrereq}
            incomplete={
              consumeFailed?.nodeId === consume.nodeId
                ? { onRetry: consumeFailed.retry }
                : undefined
            }
          />,
        )}

      {openSheet === "socratic" &&
        socratic &&
        socraticSteps &&
        sheetBoundary(
          <SocraticView
            presence={sheet.state}
            title={graph.nodes.find((n) => n.id === socratic.nodeId)?.label ?? "Concept"}
            session={socratic}
            judging={judging}
            gapMode={graph.nodes.find((n) => n.id === socratic.nodeId)?.gap ?? false}
            onExit={exitSocratic}
            onAnswer={socraticAnswer}
            onStuck={() => dispatchSocratic({ type: "stuck" })}
            onTell={() => dispatchSocratic({ type: "tell" })}
            onHelpChange={(level) => dispatchSocratic({ type: "setHelp", level })}
            onAdvance={advanceFromSocratic}
            onRetryJudge={socraticRetry ?? undefined}
          />,
        )}

      {openSheet === "feynman" &&
        feynman &&
        feynmanBeats &&
        sheetBoundary(
          <FeynmanView
            presence={sheet.state}
            topic={form.topic}
            title={graph.nodes.find((n) => n.id === feynman.nodeId)?.label ?? "Concept"}
            beats={feynmanBeats}
            session={feynman}
            judging={judging}
            ready={!!feynmanCache[feynman.nodeId]}
            onExit={exitFeynman}
            onBegin={() => dispatchFeynman({ type: "begin" })}
            onTeach={feynmanTeach}
            onScaffold={() => dispatchFeynman({ type: "scaffold" })}
            onOpenFix={(beatId) => dispatchFeynman({ type: "openFix", beatId })}
            onCloseFix={() => dispatchFeynman({ type: "closeFix" })}
            onFix={(index) => dispatchFeynman({ type: "fix", index })}
            onTeachAgain={() => dispatchFeynman({ type: "teachAgain" })}
            onAdvance={advanceFromFeynman}
          />,
        )}

      {openSheet === "connect" &&
        connect &&
        connectContent &&
        sheetBoundary(
          <ConnectView
            presence={sheet.state}
            content={connectContent}
            session={connect}
            onExit={exitConnect}
            onSelect={(id) => dispatchConnect({ type: "select", id })}
            onDraft={(id, value) => dispatchConnect({ type: "draft", id, value })}
            onConfirm={(id) => dispatchConnect({ type: "confirm", id })}
            onPickMnemonic={(index) => dispatchConnect({ type: "pickMnemonic", index })}
            onDraftMnemonic={(value) => dispatchConnect({ type: "draftMnemonic", value })}
            onAcceptMnemonic={() => dispatchConnect({ type: "acceptMnemonic" })}
            onFinish={advanceFromConnect}
          />,
        )}

      {openSheet === "crucible" &&
        crucible &&
        crucibleContent &&
        sheetBoundary(
          <CrucibleView
            presence={sheet.state}
            content={crucibleContent}
            session={crucible}
            judging={judging}
            onExit={exitCrucible}
            onConfidence={(level) => dispatchCrucible({ type: "confidence", level })}
            onAttempt={(value) => dispatchCrucible({ type: "attempt", value })}
            onSample={() => dispatchCrucible({ type: "sample" })}
            onSubmit={crucibleSubmit}
            onToggleReExplain={() => dispatchCrucible({ type: "toggleReExplain" })}
            onRetry={() => dispatchCrucible({ type: "retry" })}
            onFinish={advanceFromCrucible}
          />,
        )}

      {openSheet === "review" &&
        retain &&
        retainContent &&
        sheetBoundary(
          <RetainView
            presence={sheet.state}
            content={retainContent}
            session={retain}
            nodeLabel={
              graph.nodes.find((n) => n.id === reviewCard(retain, retainContent).node)
                ?.label ?? "This node"
            }
            litNodes={masteredCount}
            adherence={adherence}
            litToday={litToday}
            onToggleReminder={onToggleReminder}
            onExit={exitReview}
            onConfidence={retainConfidence}
            onGrade={retainGrade}
            onToggleAside={retainToggleAside}
            onReteach={retainReteach}
            onContinue={retainContinue}
          />,
        )}

      {openSheet === "calibration" &&
        sheetBoundary(
          <CalibrationView
            presence={sheet.state}
            items={calib}
            onExit={exitCalib}
            onCloseGap={closeCalibGap}
          />,
        )}

      {/* Mounted through its own fade-out; `loading` is already null by then,
          so the last phase/message are kept for the exit frame. */}
      <GeneratingOverlay
        open={Boolean(loading)}
        phase={loading?.phase ?? lastLoading.current?.phase ?? ""}
        message={loading?.message ?? lastLoading.current?.message ?? ""}
      />

      <OfflineBanner offline={!online} message={errorStrings.offlineBanner} />

      {/* A write that has exhausted its retries. Quiet and permanent rather
          than a toast: the debounce fires every 1.2s, so a toast would be a
          strobe, and the next tick is already the retry. Suppressed offline —
          the banner above is a truer account of the same fact. */}
      {saveFailed && online && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 38,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 12px",
            borderRadius: 999,
            background: color.dangerBg,
            border: "1px solid rgba(154,64,52,0.22)",
            color: color.dangerInk,
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.06em",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: color.dangerInk,
              animation: "breathe 1.8s ease-in-out infinite",
            }}
          />
          {errorStrings.notSaved}
        </div>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />

      <ScreenTimer />
    </div>
  );
}
