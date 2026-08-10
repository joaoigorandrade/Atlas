"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FORM,
  PHASES,
  ancestorsOf,
  calibItems,
  calibOverCount,
  connectCards,
  connectReducer,
  connectStart,
  crucibleReducer,
  crucibleStart,
  daysUntil,
  displayStates,
  emptyGraph,
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  freshAdherence,
  graphFromMapNodes,
  emptyConsumeProgress,
  preferredModality,
  DIAGNOSTIC_COUNT,
  diagnosticEffect,
  stepDifficulty,
  GOALS,
  initialStates,
  localDay,
  markTodayMet,
  orderedFrontier,
  paceStatus,
  readingPhaseIndex,
  removeNode,
  retainReducer,
  retainStart,
  reviewCard,
  rolloverAdherence,
  recordMisconception,
  recurringMisconceptions,
  socraticOutcome,
  socraticPlan,
  socraticReducer,
  socraticStart,
  SOCRATIC_STEPS,
  spawnGap,
  toggleReminder,
  unmetPathOf,
  type AdherenceState,
  type AltKey,
  type CalibSample,
  type ConceptGraph,
  type ConceptNode,
  type ConnectAction,
  type ConnectSession,
  type ConsumeChunk,
  type ConsumeModelBeat,
  type ConsumeProgress,
  type ModalityTally,
  type CrucibleAction,
  type CrucibleContent,
  type CrucibleSession,
  type DiagnosticDifficulty,
  type DiagnosticQuestion,
  type ElaborationContent,
  type FeynmanAction,
  type FeynmanBeat,
  type FeynmanSession,
  type TeachVerdict,
  type GapSpec,
  type NodeState,
  type OnboardingForm,
  type RetainContent,
  type RetainSession,
  type ReviewConfidence,
  type ReviewGrade,
  type ShakyReason,
  type MisconceptionRecord,
  type SocraticAction,
  type SocraticSession,
  type SocraticStep,
  type StateMap,
} from "@/lib/curriculum";
import {
  dueCards,
  gradeStoredCard,
  newStoredCard,
  retainContentFromStore,
  type StoredCard,
} from "@/lib/fsrs";
import {
  connectRequest,
  consumeRequest,
  crucibleRequest,
  feynmanRequest,
  fetchCachedContent,
  fetchConnect,
  fetchConsume,
  fetchConsumeModel,
  fetchConsumeModelStream,
  fetchConsumeStream,
  fetchCrucible,
  fetchCurriculumMapStream,
  fetchDiagnosticQuestion,
  fetchFeynman,
  fetchFeynmanStream,
  fetchJudgeCrucible,
  fetchJudgeFeynman,
  type FeynmanJudgement,
  fetchJudgeSocratic,
  fetchPassageStream,
  fetchRetain,
  fetchSocratic,
  fetchSocraticStream,
  retainRequest,
  socraticRequest,
  WarmDeclined,
  type ScopeOffer,
} from "@/lib/api";
import { createWarmQueue } from "@/lib/warm";
import { useLanguage } from "@/lib/i18n";
import { InkRule } from "@/components/Pending";
import { color, font } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import {
  deleteRun,
  listRuns,
  loadRunBySubject,
  loadRunCaches,
  loadRunCore,
  saveRun,
  saveRunCaches,
  type LoadedRun,
  type RunCaches,
  type RunSnapshot,
  type RunSummary,
} from "@/lib/persistence";
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
import ConsumeView, {
  type ConsumeSession,
  type PassageAsk,
} from "@/components/session/ConsumeView";
import SocraticView from "@/components/session/SocraticView";
import FeynmanView from "@/components/session/FeynmanView";
import ConnectView from "@/components/session/ConnectView";
import CrucibleView from "@/components/session/CrucibleView";
import RetainView from "@/components/session/RetainView";
import CalibrationView from "@/components/analytics/CalibrationView";
import GeneratingOverlay from "@/components/GeneratingOverlay";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas, { type ViewTransform } from "@/components/map/MapCanvas";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar, { type Surface } from "@/components/map/TopBar";
import Toast, { type ToastData } from "@/components/Toast";

type Screen =
  | "welcome"
  | "building"
  | "diagnostic"
  | "dashboard"
  | "profile"
  | "settings"
  | "map"
  | "consume"
  | "socratic"
  | "feynman"
  | "connect"
  | "crucible"
  | "review"
  | "calibration";

/** Minimum time the map-assembly moment plays, even when generation is fast. */
const BUILD_MS = 2600;

/** Concepts that must have streamed in before the first placement question is
 *  asked for. The map arrives foundations-first, so this prefix is exactly the
 *  material an opening question should probe — and firing here overlaps the two
 *  cold generations instead of serializing them. */
const DIAGNOSTIC_POOL_MIN = 8;

/** The generated surfaces the warm queue can fetch ahead of a click. */
type WarmKind = "consume" | "socratic" | "feynman" | "connect" | "crucible";

/**
 * What to have ready for a node in a given state, in the order the learner
 * will reach it. Two kinds deep is the useful window: far enough ahead that
 * the next two clicks are instant, near enough that a warm is rarely wasted.
 */
function warmKindsFor(state: NodeState | undefined): WarmKind[] {
  switch (state) {
    case "frontier":
      return ["consume", "socratic"];
    case "learning":
      return ["feynman", "connect"];
    case "shaky":
      return ["crucible"];
    case "gap":
      return ["socratic"];
    default:
      return [];
  }
}

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

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

interface PanState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

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
  const { language } = useLanguage();
  // The background warm queue: content for the phases just ahead is fetched
  // while the learner works, so entering them is a state change, not a wait.
  // A foreground click on something already warming joins that request rather
  // than starting a second one.
  const warm = useMemo(() => createWarmQueue(), []);
  // False until the saved run's CORE (graph, states, positions) has been
  // fetched — nothing renders before then, so a resumed run never flashes the
  // welcome screen. The generated content arrives separately, behind the map.
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState(0);
  // The graph itself is state: it arrives generated from the AI during
  // onboarding, and Phase 1 (Plan) restructures it live afterwards.
  const [graph, setGraph] = useState<ConceptGraph>(emptyGraph);
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(() => new Set());
  const [states, setStates] = useState<StateMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The generated placement diagnostic — arrives with the graph.
  const [diagnostic, setDiagnostic] = useState<DiagnosticQuestion[]>([]);
  // The active Consume (Learn) session, or null when not in one.
  const [consume, setConsume] = useState<ConsumeSession | null>(null);
  // Sections of the *current* node's reading pass as they stream in, before
  // the full pass is validated and committed to `consumeCache` below. Kept
  // separate so a partial pass never looks like a cached, instantly-reopenable
  // one to the warm/dedup logic.
  const [liveConsume, setLiveConsume] = useState<{
    nodeId: string;
    chunks: ConsumeChunk[];
  } | null>(null);
  // Model views (a lens opened over one section of the reading), keyed by
  // `modelKey`. Per (node, section, lens) rather than per node: a learner opens
  // one lens on the section that didn't land, not twenty across the pass.
  const [modelCache, setModelCache] = useState<Record<string, ConsumeModelBeat[]>>({});
  // …and the beats of the view currently open, as they stream in. Same
  // arrangement as `liveConsume`: a half-arrived view must never look cached.
  const [liveModel, setLiveModel] = useState<{
    key: string;
    beats: ConsumeModelBeat[];
    /** Nothing more is coming — the stream finished, or it failed part-way and
     *  what landed is all there is. Without it a view that died mid-stream
     *  would show "still writing…" for as long as the learner left it open. */
    done?: boolean;
  } | null>(null);
  // Where the learner got to in each node's reading pass, persisted (§6). The
  // live `consume` session above is this plus the transient UI bits; this is
  // what a refresh, a re-entry, the map and the phase spiral all read.
  const [consumeProgress, setConsumeProgress] = useState<
    Record<string, ConsumeProgress>
  >({});
  // Which lens this learner keeps opening, run-wide — the evidence behind
  // the adaptive-modality default.
  const [modalityTally, setModalityTally] = useState<ModalityTally>({});
  // The active Socratic (Phase 3a) session, or null.
  const [socratic, setSocratic] = useState<SocraticSession | null>(null);
  // …and the unfinished ones, per node, persisted so re-entering a pass lands
  // back on the probe the learner stopped at with the transcript intact.
  const [socraticProgress, setSocraticProgress] = useState<
    Record<string, SocraticSession>
  >({});
  /** What this learner keeps getting wrong, across nodes and across sessions.
   *  The pass state above is discarded the moment a pass finishes; this is the
   *  part worth keeping, and the judge reads it back on every answer. */
  const [misconceptions, setMisconceptions] = useState<MisconceptionRecord[]>([]);
  // Steps of the *current* node's questioning pass as they stream in — same
  // arrangement as `liveConsume`: held apart from `socraticCache` so a
  // half-arrived pass is never mistaken for a cached, reopenable one.
  const [liveSocratic, setLiveSocratic] = useState<{
    nodeId: string;
    steps: SocraticStep[];
  } | null>(null);
  // …and the unfinished teach-backs, per node, persisted for the same reason
  // Socratic's are: a Gap Report is somewhere to come back to, not something
  // to re-earn by teaching the whole concept again.
  const [feynmanProgress, setFeynmanProgress] = useState<
    Record<string, FeynmanSession>
  >({});
  // The active Feynman (Phase 3b) teach-back session, or null.
  const [feynman, setFeynman] = useState<FeynmanSession | null>(null);
  // …and the same for the teach-back's beats.
  const [liveFeynman, setLiveFeynman] = useState<{
    nodeId: string;
    beats: FeynmanBeat[];
  } | null>(null);
  // The active Connect (Phase 4 · Elaboration) session, or null.
  const [connect, setConnect] = useState<ConnectSession | null>(null);
  // …and the unfinished ones, per node, for the same reason Socratic's and
  // Feynman's are kept: links the learner wrote in their own words are work,
  // not something to re-earn because they stepped back to the map.
  const [connectProgress, setConnectProgress] = useState<
    Record<string, ConnectSession>
  >({});
  // The active Crucible (Phase 5 · application/transfer) session, or null.
  const [crucible, setCrucible] = useState<CrucibleSession | null>(null);
  // The active Retain (Phase 6 · Review queue) session, or null.
  const [retain, setRetain] = useState<RetainSession | null>(null);
  // Per-node generated content, cached for the run so re-entering a phase
  // doesn't re-bill a generation. Retain is global (one queue per day).
  const [consumeCache, setConsumeCache] = useState<Record<string, ConsumeChunk[]>>({});
  const [socraticCache, setSocraticCache] = useState<Record<string, SocraticStep[]>>({});
  const [feynmanCache, setFeynmanCache] = useState<Record<string, FeynmanBeat[]>>({});
  const [connectCache, setConnectCache] = useState<Record<string, ElaborationContent>>({});
  const [crucibleCache, setCrucibleCache] = useState<Record<string, CrucibleContent>>({});
  const [retainContent, setRetainContent] = useState<RetainContent | null>(null);
  // The "AI is writing this" overlay, or null.
  const [loading, setLoading] = useState<{ phase: string; message: string } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
  // §13 Adherence — starts honest: no fabricated streak, one freeze banked.
  const [adherence, setAdherence] = useState<AdherenceState>(freshAdherence);
  // Labels of nodes that reached Mastered this session run.
  const [litToday, setLitToday] = useState<string[]>([]);
  // §12 Calibration — live confidence-vs-performance readings, captured from
  // the Crucible's confidence gate and Review's pre-flip taps. Starts empty.
  const [calibSamples, setCalibSamples] = useState<CalibSample[]>([]);
  // How each Shaky node got that way — the honest confidence line (#14).
  const [shakyReasons, setShakyReasons] = useState<Record<string, ShakyReason>>({});
  // Nodes with at least one review graded good+ — gates "Retained ✓" (#13).
  const [reviewedNodes, setReviewedNodes] = useState<string[]>([]);
  // The persisted FSRS card store (#21) — the review queue's single source.
  const [cards, setCards] = useState<StoredCard[]>([]);
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
  const [vw, setVw] = useState(1440);
  const [railOpen, setRailOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  const viewRef = useRef(view);
  viewRef.current = view;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const formRef = useRef(form);
  formRef.current = form;
  const languageRef = useRef(language);
  languageRef.current = language;
  // Generated content carries the language of the prompt that wrote it and
  // nothing else, so switching language mid-run must drop every cached
  // surface — otherwise the learner keeps reading the old language back out
  // of memory (and out of the saved snapshot) forever.
  const contentLanguageRef = useRef(language);
  useEffect(() => {
    if (contentLanguageRef.current === language) return;
    contentLanguageRef.current = language;
    warm.clear();
    setConsumeCache({});
    setModelCache({});
    setSocraticCache({});
    setFeynmanCache({});
    setConnectCache({});
    setCrucibleCache({});
    setRetainContent(null);
  }, [language, warm]);
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
  const statesRef = useRef(states);
  statesRef.current = states;
  const crucibleRef = useRef(crucible);
  crucibleRef.current = crucible;
  const retainRef = useRef(retain);
  retainRef.current = retain;
  const socraticRef = useRef(socratic);
  socraticRef.current = socratic;
  const feynmanRef = useRef(feynman);
  feynmanRef.current = feynman;
  const feynmanProgressRef = useRef(feynmanProgress);
  feynmanProgressRef.current = feynmanProgress;
  const connectProgressRef = useRef(connectProgress);
  connectProgressRef.current = connectProgress;
  const consumeRef = useRef(consume);
  consumeRef.current = consume;
  /** The reading pass on screen — committed sections, or the streaming ones
   *  standing in for them. Assigned once `consumeChunks` is derived, below. */
  const consumeChunksRef = useRef<ConsumeChunk[]>([]);
  const consumeCacheRef = useRef(consumeCache);
  consumeCacheRef.current = consumeCache;
  const modelCacheRef = useRef(modelCache);
  modelCacheRef.current = modelCache;
  const liveConsumeRef = useRef(liveConsume);
  liveConsumeRef.current = liveConsume;
  const consumeProgressRef = useRef(consumeProgress);
  consumeProgressRef.current = consumeProgress;
  const modalityTallyRef = useRef(modalityTally);
  modalityTallyRef.current = modalityTally;
  const socraticCacheRef = useRef(socraticCache);
  socraticCacheRef.current = socraticCache;
  const liveSocraticRef = useRef(liveSocratic);
  liveSocraticRef.current = liveSocratic;
  const socraticProgressRef = useRef(socraticProgress);
  socraticProgressRef.current = socraticProgress;
  const misconceptionsRef = useRef(misconceptions);
  misconceptionsRef.current = misconceptions;
  const feynmanCacheRef = useRef(feynmanCache);
  feynmanCacheRef.current = feynmanCache;
  const liveFeynmanRef = useRef(liveFeynman);
  liveFeynmanRef.current = liveFeynman;
  const connectCacheRef = useRef(connectCache);
  connectCacheRef.current = connectCache;
  const crucibleCacheRef = useRef(crucibleCache);
  crucibleCacheRef.current = crucibleCache;
  const retainContentRef = useRef(retainContent);
  retainContentRef.current = retainContent;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const judgingRef = useRef(judging);
  judgingRef.current = judging;
  // Gap specs queued by hesitant diagnostic answers, spawned once the map opens.
  const pendingGapsRef = useRef<Array<{ parentId: string; spec: GapSpec }>>([]);
  // Assigned in the derived section below; read by event handlers.
  const displayRef = useRef<Record<string, NodeState>>({});

  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const momentumRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      if (momentumRef.current) clearInterval(momentumRef.current);
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  const showToast = useCallback((message: string, kicker?: string) => {
    setToast({ message, kicker });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), kicker ? 3400 : 2400);
  }, []);

  const setShakyReason = useCallback((id: string, reason: ShakyReason) => {
    setShakyReasons((prev) => ({ ...prev, [id]: reason }));
  }, []);

  // ---- responsive minimum (#8): track the viewport, collapse rails below
  // 1280, and gate the whole app below 768 (rendered later).
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      if (w === 0) return; // hidden/backgrounded surface — keep the last real width
      setVw(w);
      if (w < 1280) {
        setRailOpen(false);
        setDetailOpen(false);
      } else {
        setRailOpen(true);
        setDetailOpen(true);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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
  }, []);

  // Clearing the daily queue is the honest "done for today" — it marks the day
  // met, so the streak ticks forward and the flame reads lit everywhere.
  useEffect(() => {
    if (retain?.finished) setAdherence((prev) => markTodayMet(prev));
  }, [retain?.finished]);

  const onToggleReminder = useCallback(
    () => setAdherence((prev) => toggleReminder(prev)),
    [],
  );

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  // ---- persistence (§17) -----------------------------------------------
  // One coarse snapshot per (user, subject) in Supabase `run_states`.
  // Load once on mount; a saved run resumes straight onto the map.

  /** Apply loaded content without clobbering anything generated since: a
   *  cache entry already in memory is the fresher one. */
  const applyCaches = useCallback((c: RunCaches) => {
    const merge = <T,>(loaded: Record<string, T>) =>
      (prev: Record<string, T>): Record<string, T> => ({ ...loaded, ...prev });
    setConsumeCache(merge(c.consume));
    setModelCache(merge(c.models));
    setSocraticCache(merge(c.socratic));
    setFeynmanCache(merge(c.feynman));
    setConnectCache(merge(c.connect));
    setCrucibleCache(merge(c.crucible));
    setRetainContent((prev) => prev ?? c.retain);
  }, []);

  /**
   * Apply a loaded run as the live one, dropping any other run's in-progress
   * session state first — this is also what "switch map" from the dashboard
   * grid runs, not just the initial mount hydrate.
   */
  const applyRun = useCallback(
    (row: LoadedRun) => {
      warm.clear();
      setSelectedId(null);
      setDiagnostic([]);
      setAnswered(0);
      setConsume(null);
      setLiveConsume(null);
      setLiveModel(null);
      setSocratic(null);
      setLiveSocratic(null);
      setFeynman(null);
      setLiveFeynman(null);
      setConnect(null);
      setCrucible(null);
      setRetain(null);
      setConsumeCache({});
      setModelCache({});
      setSocraticCache({});
      setFeynmanCache({});
      setConnectCache({});
      setCrucibleCache({});
      setRetainContent(null);
      setConsumeProgress({});
      setModalityTally({});
      setSocraticProgress({});
      setFeynmanProgress({});
      setConnectProgress({});
      setMisconceptions([]);
      pendingGapsRef.current = [];
      setMomentumPlaying(false);
      setOutline(null);
      setUploadNote(null);
      setScopes(null);

      const s = row.snapshot;
      setForm(s.form);
      setGraph(s.graph);
      setStates(s.states);
      setPositions(s.positions);
      setSpawnedIds(new Set(s.spawnedIds));
      // Judge every day that passed while the tab was closed (#22) —
      // a new calendar day also clears yesterday's litToday list.
      const rolled = rolloverAdherence(s.adherence);
      setAdherence(rolled);
      setLitToday(rolled.lastDay === s.adherence.lastDay ? s.litToday : []);
      setCalibSamples(s.calibSamples);
      setShakyReasons(s.shakyReasons);
      setReviewedNodes(s.reviewedNodes);
      setCards(s.cards);
      setConsumeProgress(s.consumeProgress);
      setModalityTally(s.modalityTally);
      setSocraticProgress(s.socraticProgress);
      setFeynmanProgress(s.feynmanProgress);
      setConnectProgress(s.connectProgress);
      setMisconceptions(s.misconceptions);
      setScreen("map");
      // A pre-v3 row still carries its caches inline; take them and skip
      // the second query.
      if (row.inlineCaches) applyCaches(row.inlineCaches);
      else
        loadRunCaches(supabase, row.subject)
          .then((c) => applyCaches(c))
          .catch((err: Error) => console.warn(err.message));
    },
    [warm, applyCaches, supabase],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrate = (row: LoadedRun | null) => {
      if (cancelled) return;
      if (row) applyRun(row);
      setHydrated(true);
    };

    // The server already read the core and shipped it with the HTML, so the
    // map draws on the first commit instead of after a round-trip.
    if (initialRun !== undefined) {
      hydrate(initialRun);
      return () => {
        cancelled = true;
      };
    }

    // Two loads, deliberately: the core is what the map draws, so it is the
    // only thing the first paint waits on. The generated content — by far the
    // larger half — streams in behind an already-interactive map.
    loadRunCore(supabase)
      .then(hydrate)
      .catch((err: Error) => {
        // A failed load must not brick the app — start fresh and say so.
        if (cancelled) return;
        console.warn(err.message);
        setHydrated(true);
        showToast("Couldn't load your saved progress — starting fresh");
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, showToast, applyRun, initialRun]);

  const runActive =
    hydrated &&
    !excluding &&
    graph.nodes.length > 0 &&
    screen !== "welcome" &&
    screen !== "building" &&
    screen !== "diagnostic";
  const runSubject = form.topic.trim() || "Untitled";

  /** Every saved map, for the dashboard's "Your maps" grid. Refreshed each
   *  time the dashboard is entered, so a newly built or excluded map is never
   *  more than one nav away from correct. */
  const [maps, setMaps] = useState<RunSummary[]>([]);
  const refreshMaps = useCallback(() => {
    listRuns(supabase)
      .then(setMaps)
      .catch((err: Error) => console.warn(err.message));
  }, [supabase]);

  /** Open a map from the dashboard grid — a no-op switch for the one already
   *  live, otherwise loads it as the new live run. */
  const switchMap = useCallback(
    (subject: string) => {
      if (subject === runSubject) {
        setScreen("map");
        return;
      }
      loadRunBySubject(supabase, subject)
        .then((row) => {
          if (row) applyRun(row);
        })
        .catch((err: Error) => showToast(err.message, "Couldn't open that map"));
    },
    [runSubject, supabase, applyRun, showToast],
  );

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
  }, [socratic]);

  // Same mirror for the teach-back. A pass mid-judgement is skipped — what's
  // saved stays the last complete state — and a finished one drops out in
  // `advanceFromFeynman`, once its gaps have actually reached the map.
  useEffect(() => {
    if (!feynman || feynman.pending) return;
    const { nodeId } = feynman;
    setFeynmanProgress((prev) => ({ ...prev, [nodeId]: feynman }));
  }, [feynman]);

  // Write-through, debounced, in two halves (see lib/persistence.ts).
  //
  // The core: small and touched constantly — a node drag alone rewrites
  // `positions` — so it saves on a short debounce.
  useEffect(() => {
    if (!runActive) return;
    const snapshot: RunSnapshot = {
      v: 8,
      form,
      graph,
      spawnedIds: [...spawnedIds],
      states,
      positions,
      adherence,
      calibSamples,
      litToday,
      shakyReasons,
      reviewedNodes,
      cards,
      consumeProgress,
      modalityTally,
      socraticProgress,
      feynmanProgress,
      connectProgress,
      misconceptions,
    };
    const timer = setTimeout(() => {
      saveRun(supabase, runSubject, snapshot).catch((err: Error) =>
        console.warn(err.message),
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    runActive,
    runSubject,
    supabase,
    form,
    graph,
    spawnedIds,
    states,
    positions,
    adherence,
    calibSamples,
    litToday,
    shakyReasons,
    reviewedNodes,
    cards,
    consumeProgress,
    modalityTally,
    socraticProgress,
    feynmanProgress,
    connectProgress,
    misconceptions,
  ]);

  // The content: large, but only ever changes when a generation lands. Its own
  // effect on a long debounce, so dragging a node no longer re-uploads every
  // chunk the run has ever generated.
  useEffect(() => {
    if (!runActive) return;
    const caches: RunCaches = {
      consume: consumeCache,
      models: modelCache,
      socratic: socraticCache,
      feynman: feynmanCache,
      connect: connectCache,
      crucible: crucibleCache,
      retain: retainContent,
    };
    const timer = setTimeout(() => {
      saveRunCaches(supabase, runSubject, caches).catch((err: Error) =>
        console.warn(err.message),
      );
    }, 4000);
    return () => clearTimeout(timer);
  }, [
    runActive,
    runSubject,
    supabase,
    consumeCache,
    modelCache,
    socraticCache,
    feynmanCache,
    connectCache,
    crucibleCache,
    retainContent,
  ]);

  const signOut = useCallback(() => {
    supabase.auth.signOut().then(() => {
      window.location.href = "/login";
    });
  }, [supabase]);

  /** Delete account + all data (#33). Confirm, then the server wipes the rows. */
  const deleteAccount = useCallback(() => {
    if (
      !window.confirm(
        "Delete your account and all data — map, cards, streak? This cannot be undone.",
      )
    )
      return;
    fetch("/api/account/delete", { method: "POST" })
      .then((r) => {
        if (!r.ok) throw new Error("delete failed");
        window.location.href = "/login";
      })
      .catch(() => showToast("Couldn't delete right now — try again in a moment."));
  }, [showToast]);

  // ---- Home (dashboard) + profile navigation ---------------------------

  const enterDashboard = useCallback(() => {
    setScreen("dashboard");
    refreshMaps();
  }, [refreshMaps]);
  const enterProfile = useCallback(() => setScreen("profile"), []);
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
  const excludeTopic = useCallback(
    (subject: string) => {
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
          setLiveModel(null);
          setSocratic(null);
          setLiveSocratic(null);
          setFeynman(null);
          setLiveFeynman(null);
          setConnect(null);
          setCrucible(null);
          setRetain(null);
          setConsumeCache({});
          setModelCache({});
          setSocraticCache({});
          setFeynmanCache({});
          setConnectCache({});
          setCrucibleCache({});
          setRetainContent(null);
          setConsumeProgress({});
          setModalityTally({});
          setSocraticProgress({});
          setConnectProgress({});
          setMisconceptions([]);
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
        .catch((err: Error) => showToast(err.message, "Couldn't exclude"))
        .finally(() => setExcluding(false));
    },
    [supabase, warm, showToast, runSubject, maps],
  );
  const enterSettings = useCallback(() => setScreen("settings"), []);
  const exitSettings = useCallback(() => setScreen("map"), []);

  // ---- data export (#32) ------------------------------------------------

  const download = useCallback((name: string, text: string, mime: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const slugTopic = () =>
    (formRef.current.topic.trim() || "atlas").toLowerCase().replace(/\W+/g, "-");

  const exportMap = useCallback(() => {
    download(
      `${slugTopic()}-map.json`,
      JSON.stringify(
        {
          topic: formRef.current.topic,
          nodes: graphRef.current.nodes,
          edges: graphRef.current.edges,
          states: statesRef.current,
        },
        null,
        2,
      ),
      "application/json",
    );
  }, [download]);

  const exportCardsJson = useCallback(() => {
    download(
      `${slugTopic()}-cards.json`,
      JSON.stringify(cardsRef.current, null, 2),
      "application/json",
    );
  }, [download]);

  const exportCardsCsv = useCallback(() => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = cardsRef.current.map((c) => {
      const front = c.front ?? (c.cloze ? `${c.cloze[0]}____${c.cloze[1]}` : "");
      return `${esc(front)},${esc(c.back)}`;
    });
    download(`${slugTopic()}-cards.csv`, rows.join("\n"), "text/csv");
  }, [download]);

  const centerOn = useCallback((id: string) => {
    const pos = positionsRef.current[id];
    if (!pos) return;
    const scale = 0.85;
    setView({
      x: window.innerWidth / 2 - pos.x * scale,
      y: window.innerHeight / 2 - pos.y * scale,
      scale,
    });
  }, []);

  /** Merge a felt/real reading into the live calibration set (running average). */
  const recordCalib = useCallback((nodeId: string, felt: number, real: number) => {
    setCalibSamples((prev) => {
      const existing = prev.find((s) => s.id === nodeId);
      if (!existing) return [...prev, { id: nodeId, felt, real }];
      return prev.map((s) =>
        s.id === nodeId
          ? {
              id: nodeId,
              felt: Math.round((s.felt + felt) / 2),
              real: Math.round((s.real + real) / 2),
            }
          : s,
      );
    });
  }, []);

  /**
   * The re-plan restructure: hang a generated gap sub-node under its parent —
   * new red node, dashed edge, assemble animation. Idempotent per spec id.
   */
  const attachGap = useCallback((parentId: string, spec: GapSpec): boolean => {
    const parent = graphRef.current.nodes.find((n) => n.id === parentId);
    const base = positionsRef.current[parentId];
    if (!parent || !base) return false;
    if (graphRef.current.nodes.some((n) => n.id === spec.id)) return false;
    setGraph((g) => spawnGap(g, parentId, spec));
    setStates((prev) => ({ ...prev, [spec.id]: "gap" }));
    setPositions((prev) => ({
      ...prev,
      [spec.id]: { x: base.x + spec.dx, y: base.y + spec.dy },
    }));
    setSpawnedIds((prev) => new Set(prev).add(spec.id));
    return true;
  }, []);

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
    setConsumeCache({});
    setModelCache({});
    setSocraticCache({});
    setFeynmanCache({});
    setConnectCache({});
    setCrucibleCache({});
    setRetainContent(null);
    setConsumeProgress({});
    setModalityTally({});
    setSocraticProgress({});
    setConnectProgress({});
    setMisconceptions([]);
    setCalibSamples([]);
    setShakyReasons({});
    setReviewedNodes([]);
    setCards([]);
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
          index: 0,
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
            showToast(err.message, "Placement skipped");
            later(() => setScreen("map"), openAt());
          });
      })
      .catch((err: Error) => {
        if (!current()) return;
        setScreen("welcome");
        showToast(err.message, "Generation failed");
      });
  }, [later, outline, showToast, warm]);

  /** A picked scope becomes the topic and builds immediately (#30). */
  const pickScope = useCallback(
    (label: string) => {
      setForm((prev) => ({ ...prev, topic: label }));
      setScopes(null);
      // formRef updates on render; build reads the ref, so defer one tick.
      later(() => build(), 30);
    },
    [build, later],
  );

  /** Upload a syllabus/outline: extract server-side, ground the map (#30). */
  const onOutlineFile = useCallback(
    (file: File) => {
      // Drop the previous outline up front: a re-upload must not ground the
      // map in the old source while the new one is still being read.
      setOutline(null);
      setUploadNote(`Reading ${file.name}…`);
      const data = new FormData();
      data.append("file", file);
      fetch("/api/extract", { method: "POST", body: data })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as
            | { text?: string; error?: string }
            | null;
          if (!res.ok || !json?.text)
            throw new Error(json?.error ?? "Couldn't read that file");
          setOutline(json.text);
          setUploadNote(`Grounded in ${file.name} ✓ — the map will follow its outline`);
        })
        .catch((err: Error) => {
          setOutline(null);
          setUploadNote(null);
          showToast(err.message, "Upload");
        });
    },
    [showToast],
  );

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
  const answerDiagnostic = useCallback((optionIndex: number) => {
    // All effects run here in the event handler, never inside a state
    // updater — React may invoke updaters more than once (#16).
    const idx = answeredRef.current;
    const q = diagnosticRef.current[idx];
    if (!q) return;
    const correct = optionIndex === q.correctIndex;
    const effect = diagnosticEffect(q.difficulty, correct, maxCorrectDifficultyRef.current);
    if (correct) {
      const rank = (d: DiagnosticDifficulty) => ["easy", "medium", "hard"].indexOf(d);
      if (
        maxCorrectDifficultyRef.current === null ||
        rank(q.difficulty) > rank(maxCorrectDifficultyRef.current)
      )
        maxCorrectDifficultyRef.current = q.difficulty;
    }
    if (effect !== "none") {
      const chain = ancestorsOf(q.nodeId, graphRef.current.edges);
      setStates((s) => {
        const next = { ...s };
        for (const id of chain) next[id] = "mastered";
        if (effect === "shaky") next[q.nodeId] = "shaky";
        return next;
      });
      if (effect === "shaky") setShakyReason(q.nodeId, "diagnostic-hesitation");
      if (effect === "shaky" && q.gap)
        pendingGapsRef.current.push({ parentId: q.nodeId, spec: q.gap });
    }
    askedNodeIdsRef.current.push(q.nodeId);
    const nextDifficulty = stepDifficulty(q.difficulty, correct);
    nextDifficultyRef.current = nextDifficulty;

    const next = idx + 1;
    const maxG = Math.max(1, ...graphRef.current.nodes.map((n) => n.g));
    setReveal(Math.ceil((Math.min(next, DIAGNOSTIC_COUNT) / DIAGNOSTIC_COUNT) * maxG));
    setAnswered(next);
    if (next >= DIAGNOSTIC_COUNT) return;

    const pool = graphRef.current.nodes
      .filter((n) => !askedNodeIdsRef.current.includes(n.id))
      .map((n) => ({ id: n.id, label: n.label }));

    fetchDiagnosticQuestion({
      topic: formRef.current.topic,
      goal: formRef.current.goal,
      interests: formRef.current.interests,
      language: languageRef.current,
      pool,
      difficulty: nextDifficulty,
      index: next,
    })
      .then((question) => {
        setDiagnostic((prev) => [...prev, question]);
      })
      .catch(() => {
        // The writer stumbled mid-placement: stop asking and let what's
        // already known stand rather than leaving the panel waiting forever.
        setAnswered(DIAGNOSTIC_COUNT);
      });
  }, [setShakyReason]);

  /**
   * The node the "Start here →" / "Jump to frontier" affordances target:
   * the top of the goal-ordered plan, not merely the leftmost lit node.
   */
  const frontierTargetId = useCallback(() => {
    const plan = orderedFrontier(displayRef.current, graphRef.current, form.goal);
    return plan[0]?.node.id ?? null;
  }, [form.goal]);

  const startMap = useCallback(() => {
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
      later(() => {
        const parent = graphRef.current.nodes.find((n) => n.id === parentId);
        if (parent && attachGap(parentId, spec))
          showToast(
            `Added ${spec.label} under ${parent.label} — ${spec.reason}`,
            "Map updated",
          );
      }, BUILD_MS + i * 1100);
    });
  }, [attachGap, centerOn, frontierTargetId, later, showToast]);

  // ---- canvas interactions ---------------------------------------------

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.926;
    const current = viewRef.current;
    const nextScale = Math.min(1.7, Math.max(0.4, current.scale * factor));
    const mx = e.clientX;
    const my = e.clientY;
    setView({
      x: mx - (mx - current.x) * (nextScale / current.scale),
      y: my - (my - current.y) * (nextScale / current.scale),
      scale: nextScale,
    });
  }, []);

  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    setSelectedId(null);
  }, []);

  const onNodeDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const pos = positionsRef.current[id];
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const scale = viewRef.current.scale;
        const dx = (e.clientX - drag.startX) / scale;
        const dy = (e.clientY - drag.startY) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        setPositions((prev) => ({
          ...prev,
          [drag.id]: { x: drag.originX + dx, y: drag.originY + dy },
        }));
        return;
      }
      const pan = panRef.current;
      if (pan) {
        setView((prev) => ({
          ...prev,
          x: pan.originX + (e.clientX - pan.startX),
          y: pan.originY + (e.clientY - pan.startY),
        }));
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag && !drag.moved) {
        setSelectedId(drag.id);
        if (displayRef.current[drag.id] === "unknown")
          showToast("Locked — learn the highlighted path first");
      }
      dragRef.current = null;
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [showToast]);

  // ---- generation plumbing ---------------------------------------------

  /**
   * Run one content generation behind the overlay. `phase`/`message` voice the
   * wait; a failure toasts and leaves the learner where they were.
   */
  const generate = useCallback(
    <T,>(
      key: string,
      phase: string,
      message: string,
      fetcher: () => Promise<T>,
      onReady: (content: T) => void,
    ) => {
      if (loadingRef.current) return;
      setLoading({ phase, message });
      // Through the warm queue: if this content is already being fetched in
      // the background, the click joins that request instead of paying for a
      // second one — the overlay only covers what's left of it.
      warm
        .run(key, fetcher, true)
        .catch((err: unknown) => {
          // The background attempt came back empty (a silent warm failure);
          // a real click can't inherit that, so ask again in the foreground.
          if (!(err instanceof WarmDeclined)) throw err;
          warm.drop(key);
          return warm.run(key, fetcher, true);
        })
        .then((content) => {
          onReady(content);
        })
        .catch((err: Error) => {
          showToast(err.message, "Generation failed");
        })
        .finally(() => setLoading(null));
    },
    [showToast, warm],
  );

  /** Direct (solid-edge) prerequisite nodes of a node. */
  const prereqNodesOf = useCallback((nodeId: string): ConceptNode[] => {
    const g = graphRef.current;
    return g.edges
      .filter(([, to, dashed]) => to === nodeId && !dashed)
      .map(([from]) => g.nodes.find((n) => n.id === from))
      .filter((n): n is ConceptNode => !!n);
  }, []);

  /** Direct (solid-edge) prerequisite labels of a node — grounds the prompts. */
  const prereqLabelsOf = useCallback(
    (nodeId: string): string[] => prereqNodesOf(nodeId).map((n) => n.label),
    [prereqNodesOf],
  );

  /** Labels the learner has actually learned — context for transfer problems. */
  const learnedLabels = useCallback((): string[] => {
    const g = graphRef.current;
    return g.nodes
      .filter((n) => !n.gap && statesRef.current[n.id] === "mastered")
      .map((n) => n.label);
  }, []);

  // ---- one source of truth per generation -------------------------------
  // Each surface's inputs are built in exactly one place, so a background warm
  // and the click that follows it hash to the same `content_cache` row. Every
  // loader writes the in-memory cache itself; callers only decide whether to
  // wait for it.

  const consumeParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      prereqLabels: prereqLabelsOf(node.id),
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [prereqLabelsOf],
  );

  /**
   * One lens over one section, as it sits on screen.
   *
   * The section's own prose is an input, not just context: the cache key
   * hashes it, so every learner reading the same cached section shares the
   * row — and a walkthrough can never be grafted onto a differently-worded
   * generation of "the same" section (the reading runs at temperature 0.6).
   */
  const modelParams = useCallback(
    (node: ConceptNode, chunk: ConsumeChunk, lens: AltKey) => ({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      lens,
      kicker: chunk.kicker,
      sectionBody: chunk.body,
      takeaway: chunk.takeaway,
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [],
  );

  const socraticParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeLabel: node.label,
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [],
  );

  const feynmanParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [],
  );

  /**
   * Connect's prior-node pool: touched (learning/shaky/mastered) non-gap nodes
   * first; a fresh map falls back to the node's neighbourhood so the web is
   * never empty. It is part of the cache key, which is why it must be derived
   * the same way for a warm and for the real entry.
   */
  const connectParams = useCallback((node: ConceptNode) => {
    const g = graphRef.current;
    const touched = g.nodes.filter(
      (n) =>
        !n.gap &&
        n.id !== node.id &&
        ["learning", "shaky", "mastered"].includes(statesRef.current[n.id] ?? ""),
    );
    const pool = (
      touched.length >= 2
        ? touched
        : g.nodes.filter((n) => !n.gap && n.id !== node.id)
    )
      .slice(0, 8)
      .map((n) => ({ id: n.id, label: n.label }));
    return {
      topic: formRef.current.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      pool,
      interests: formRef.current.interests,
      language: languageRef.current,
    };
  }, []);

  const crucibleParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      masteredLabels: learnedLabels(),
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [learnedLabels],
  );

  /** Warm-queue / in-memory cache address for one node's surface. */
  const warmKey = (kind: WarmKind, nodeId: string) => `${kind}:${nodeId}`;

  const opts = (prefetch: boolean) => (prefetch ? { prefetch: true } : undefined);

  const loadConsume = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const chunks = await fetchConsume(consumeParams(node), opts(prefetch));
      setConsumeCache((prev) =>
        prev[node.id] ? prev : { ...prev, [node.id]: chunks },
      );
      return chunks;
    },
    [consumeParams],
  );

  /** A model view's address, in the warm queue and in `modelCache` alike. */
  const modelKey = (nodeId: string, chunkId: string, lens: AltKey) =>
    `model:${nodeId}:${chunkId}:${lens}`;

  const loadModel = useCallback(
    async (
      node: ConceptNode,
      chunk: ConsumeChunk,
      lens: AltKey,
      prefetch = false,
    ) => {
      const beats = await fetchConsumeModel(
        modelParams(node, chunk, lens),
        opts(prefetch),
      );
      const key = modelKey(node.id, chunk.id, lens);
      setModelCache((prev) => (prev[key] ? prev : { ...prev, [key]: beats }));
      return beats;
    },
    [modelParams],
  );

  const loadSocratic = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const steps = await fetchSocratic(socraticParams(node), opts(prefetch));
      setSocraticCache((prev) =>
        prev[node.id] ? prev : { ...prev, [node.id]: steps },
      );
      return steps;
    },
    [socraticParams],
  );

  const loadFeynman = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const beats = await fetchFeynman(feynmanParams(node), opts(prefetch));
      setFeynmanCache((prev) =>
        prev[node.id] ? prev : { ...prev, [node.id]: beats },
      );
      return beats;
    },
    [feynmanParams],
  );

  const loadConnect = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const content = await fetchConnect(connectParams(node), opts(prefetch));
      setConnectCache((prev) =>
        prev[node.id] ? prev : { ...prev, [node.id]: content },
      );
      return content;
    },
    [connectParams],
  );

  const loadCrucible = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const content = await fetchCrucible(crucibleParams(node), opts(prefetch));
      setCrucibleCache((prev) =>
        prev[node.id] ? prev : { ...prev, [node.id]: content },
      );
      return content;
    },
    [crucibleParams],
  );

  /** Already in memory? Then the screen opens with no request at all. */
  const isCached = useCallback((kind: WarmKind, nodeId: string): boolean => {
    switch (kind) {
      case "consume":
        return !!consumeCacheRef.current[nodeId];
      case "socratic":
        return !!socraticCacheRef.current[nodeId];
      case "feynman":
        return !!feynmanCacheRef.current[nodeId];
      case "connect":
        return !!connectCacheRef.current[nodeId];
      case "crucible":
        return !!crucibleCacheRef.current[nodeId];
    }
  }, []);

  /** The request body `/api/content` batches to answer "is this already
   *  generated?" — the same body the real call posts. */
  const requestFor = useCallback(
    (kind: WarmKind, node: ConceptNode): Record<string, unknown> | null => {
      switch (kind) {
        case "consume":
          return consumeRequest(consumeParams(node));
        case "socratic":
          return socraticRequest(socraticParams(node));
        case "feynman":
          return feynmanRequest(feynmanParams(node));
        case "connect": {
          const params = connectParams(node);
          // A one-node map has nobody to wire into yet.
          return params.pool.length ? connectRequest(params) : null;
        }
        case "crucible":
          return crucibleRequest(crucibleParams(node));
      }
    },
    [consumeParams, socraticParams, feynmanParams, connectParams, crucibleParams],
  );

  /** Take a batch-cache hit straight into memory — no model, no waiting. */
  const applyWarmHit = useCallback(
    (kind: WarmKind, nodeId: string, payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const put = <T,>(
        set: React.Dispatch<React.SetStateAction<Record<string, T>>>,
        value: T | undefined,
      ) => {
        if (value === undefined) return;
        set((prev) => (prev[nodeId] ? prev : { ...prev, [nodeId]: value }));
      };
      switch (kind) {
        case "consume":
          return put(setConsumeCache, p.chunks as ConsumeChunk[] | undefined);
        case "socratic":
          return put(setSocraticCache, p.steps as SocraticStep[] | undefined);
        case "feynman":
          return put(setFeynmanCache, p.beats as FeynmanBeat[] | undefined);
        case "connect":
          return put(setConnectCache, p.content as ElaborationContent | undefined);
        case "crucible":
          return put(setCrucibleCache, p.content as CrucibleContent | undefined);
      }
    },
    [],
  );

  /** Queue one surface for background generation. Silent either way. */
  const warmOne = useCallback(
    (kind: WarmKind, node: ConceptNode) => {
      if (isCached(kind, node.id)) return;
      if (!requestFor(kind, node)) return;
      const key = warmKey(kind, node.id);
      switch (kind) {
        case "consume":
          return warm.warm(key, () => loadConsume(node, true));
        case "socratic":
          return warm.warm(key, () => loadSocratic(node, true));
        case "feynman":
          return warm.warm(key, () => loadFeynman(node, true));
        case "connect":
          return warm.warm(key, () => loadConnect(node, true));
        case "crucible":
          return warm.warm(key, () => loadCrucible(node, true));
      }
    },
    [
      isCached,
      requestFor,
      warm,
      loadConsume,
      loadSocratic,
      loadFeynman,
      loadConnect,
      loadCrucible,
    ],
  );

  /**
   * Hovering a node is 150-400 ms of lead time on the click that usually
   * follows, and the pass in `warmTargets` deliberately settles for 600 ms
   * before it fires. Starting the node's first surface on hover spends nothing
   * extra — `warm.warm` dedupes by key, so the click joins this request
   * instead of making a second one — and buys back that settle.
   */
  const hoverNode = useCallback(
    (id: string | null) => {
      setHoverId(id);
      if (!id) return;
      const node = graphRef.current.nodes.find((n) => n.id === id);
      const kind = warmKindsFor(displayRef.current[id])[0];
      if (node && kind) warmOne(kind, node);
    },
    [warmOne],
  );

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
          "Session · Consume",
          `Writing your reading pass on ${node.label}…`,
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
          setConsumeCache((prev) => (prev[node.id] ? prev : { ...prev, [node.id]: chunks }));
          setLiveConsume((prev) => (prev?.nodeId === node.id ? null : prev));
        })
        .catch((err: Error) => {
          // Once a section has rendered, sections already read stay put;
          // reopening the node retries since it never got cached.
          showToast(
            receivedAny
              ? "Couldn't finish the rest of this reading pass — reopen the node to retry."
              : err.message,
            receivedAny ? "Generation incomplete" : "Generation failed",
          );
        });
    },
    [consumeParams, generate, loadConsume, showToast, warm, warmOne],
  );

  // ---- Consume (Learn view) --------------------------------------------

  /** The end-of-section comprehension check — a wrong pick is kept (so the
   *  miss can be named) and simply replaced by the next attempt. */
  const consumeCheck = useCallback(
    (chunkId: string, oi: number, correct: boolean) => {
      setConsume((prev) =>
        prev
          ? { ...prev, checks: { ...prev.checks, [chunkId]: { oi, correct } } }
          : prev,
      );
    },
    [],
  );

  const consumeContinue = useCallback((chunkIndex: number) => {
    setConsume((prev) =>
      prev ? { ...prev, idx: Math.max(prev.idx, chunkIndex + 1) } : prev,
    );
  }, []);

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
  const consumeOpenModel = useCallback(
    (chunk: ConsumeChunk, lens: AltKey) => {
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
        if (beats)
          setModelCache((prev) => (prev[key] ? prev : { ...prev, [key]: beats }));
        setLiveModel((prev) => (prev?.key === key ? { ...prev, done: true } : prev));
      };
      const failed = (err: Error) => {
        settle();
        showToast(err.message, "Generation failed");
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
      stream();
    },
    [loadModel, modelParams, showToast, warm],
  );

  /** Close the open view. The lens stays recorded on the section — that is the
   *  adaptive-modality signal, and what the missing-prerequisite flag counts. */
  const consumeCloseModel = useCallback(() => {
    setConsume((prev) => (prev ? { ...prev, model: null } : prev));
  }, []);

  const consumeToggleTerm = useCallback((key: string) => {
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
  }, []);

  // ---- ask about this (the passage aside) --------------------------------

  /** Open the ask panel on a section. `selection` is the highlighted text, or
   *  "" when asked from the keyboard path (the question is the whole section). */
  const consumeOpenPassage = useCallback((chunkId: string, selection: string) => {
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
  }, []);

  const consumeClosePassage = useCallback(() => {
    setConsume((prev) => (prev ? { ...prev, passage: null } : prev));
  }, []);

  /**
   * Ask it — the learner's own question about the passage they highlighted,
   * answered against the section they're reading and streamed back a paragraph
   * at a time.
   *
   * The section prose stands in for the selection on the keyboard path: the
   * generator needs something to be *about*, and "this whole section" is the
   * truthful answer there rather than an arbitrary sentence from it.
   */
  const consumeAskPassage = useCallback(
    (question: string) => {
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
    },
    [],
  );

  /** "Skip — I know this" on one section — collapses it to its takeaway,
   *  short of bailing on the whole node the way header's "I know this" does. */
  const consumeToggleCollapse = useCallback((chunkId: string) => {
    setConsume((prev) =>
      prev
        ? {
            ...prev,
            collapsed: { ...prev.collapsed, [chunkId]: !prev.collapsed[chunkId] },
          }
        : prev,
    );
  }, []);

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
      (liveConsumeRef.current?.nodeId === s.nodeId
        ? liveConsumeRef.current.chunks
        : []);
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
  const exitConsume = useCallback(() => {
    const s = consumeRef.current;
    if (s && (s.idx >= 1 || s.finished)) {
      setStates((prev) =>
        prev[s.nodeId] === "unknown" || prev[s.nodeId] === undefined
          ? { ...prev, [s.nodeId]: "learning" }
          : prev,
      );
    }
    setScreen("map");
  }, []);

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
          "Session · Socratic",
          `Preparing the questions that build ${node.label}…`,
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
              ? socraticReducer(prev, { type: "hydrate", total: socraticPlan(steps) }, steps)
              : prev,
          );
        })
        .catch((err: Error) => {
          if (receivedAny) {
            showToast(
              "Couldn't finish the rest of this questioning pass — the steps already written still work.",
              "Generation incomplete",
            );
            return;
          }
          setScreen("map");
          setSocratic(null);
          setLiveSocratic(null);
          showToast(err.message, "Generation failed");
        });
    },
    [generate, loadSocratic, socraticParams, showToast, warm, warmOne],
  );

  /** Steps for the node on screen — the cached array once it lands, or the
   *  live one still streaming in behind it. Without this fallback every
   *  Socratic control (send, "I'm stuck", "Just tell me") is a silent no-op
   *  for as long as the pass is still generating. */
  const socraticStepsFor = useCallback((nodeId: string): SocraticStep[] | undefined => {
    const cached = socraticCacheRef.current[nodeId];
    if (cached?.length) return cached;
    const live = liveSocraticRef.current;
    return live?.nodeId === nodeId ? live.steps : undefined;
  }, []);

  const dispatchSocratic = useCallback(
    (action: SocraticAction) => {
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
    },
    [socraticStepsFor],
  );

  /** File a misconception the judge named into the run-wide roll-up. Once per
   *  judgement: the verdict frame files it, and the full judgement only fills
   *  in if the verdict never arrived on its own. */
  const fileMisconception = useCallback((label: string, nodeLabel: string) => {
    setMisconceptions((list) => recordMisconception(list, label, nodeLabel));
  }, []);

  /**
   * The live judging loop (#25): the learner's own typed answer goes to the
   * server judge; the classified verdict drives the same contingent rules the
   * scripted replies used — correct advances, near hints, wrong gets caught.
   */
  const socraticAnswer = useCallback(
    (text: string) => {
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
      let applied = false;
      fetchJudgeSocratic(
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
          if (draft.response) apply({ type: "stream", text: draft.response, pending: true });
        },
      )
        .then((j) => {
          if (!applied && j.misconception) fileMisconception(j.misconception, node.label);
          apply(
            applied
              ? { type: "stream", text: j.response }
              : { type: "judged", answer: text, quality: j.quality, response: j.response },
          );
        })
        .catch((err: Error) => {
          // Don't strand the open bubble on its dots — the failure lands in it.
          apply({ type: "stream", text: err.message });
          showToast(err.message, "Judge unavailable — try again");
        })
        .finally(() => setJudging(false));
    },
    [fileMisconception, showToast, socraticStepsFor],
  );

  const exitSocratic = useCallback(() => {
    setScreen("map");
    const nodeId = socratic?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setSocratic(null);
  }, [centerOn, later, socratic]);

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
          "Session · Feynman",
          `Waking the naive student for ${node.label}…`,
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
            showToast(
              "Couldn't finish the rest of this teach-back — the sub-points already written still grade it.",
              "Generation incomplete",
            );
            return;
          }
          setScreen("map");
          setFeynman(null);
          setLiveFeynman(null);
          showToast(err.message, "Generation failed");
        });
    },
    [feynmanParams, generate, loadFeynman, showToast, warm, warmOne],
  );

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
    [],
  );

  const dispatchFeynman = useCallback(
    (action: FeynmanAction) => {
      setFeynman((prev) => {
        if (!prev) return prev;
        const beats = feynmanBeatsFor(prev.nodeId);
        if (!beats?.length) return prev;
        return feynmanReducer(prev, action, beats);
      });
    },
    [feynmanBeatsFor],
  );

  /**
   * Real teach-back diffing (#26): the learner's whole explanation is diffed
   * server-side against a rubric they never saw — every verdict is detected
   * from their words, and a sub-point they never mentioned is a finding, not
   * an unanswered prompt.
   */
  const feynmanTeach = useCallback(
    (text: string) => {
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
          if (draft.response) apply({ type: "stream", text: draft.response, pending: true });
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
        .catch((err: Error) => showToast(err.message, "Judge unavailable — try again"))
        .finally(() => setJudging(false));
    },
    [feynmanBeatsFor, fileMisconception, showToast],
  );

  const exitFeynman = useCallback(() => {
    setScreen("map");
    const nodeId = feynman?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setFeynman(null);
  }, [centerOn, later, feynman]);

  // ---- Connect (Phase 4 · Elaboration) ---------------------------------

  /**
   * Open the Connect surface on a node, generating its elaboration content
   * first if needed. Candidates are drawn from nodes the learner has actually
   * touched — the links are personal and true, never generic trivia.
   */
  const enterConnect = useCallback(
    (node: ConceptNode) => {
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
        "Session · Connect",
        `Finding what ${node.label} wires into…`,
        () => loadConnect(node),
        open,
      );
    },
    [generate, loadConnect, warmOne],
  );

  const dispatchConnect = useCallback((action: ConnectAction) => {
    setConnect((prev) => {
      if (!prev) return prev;
      const content = connectCacheRef.current[prev.nodeId];
      if (!content) return prev;
      return connectReducer(prev, action, content);
    });
  }, []);

  const exitConnect = useCallback(() => {
    setScreen("map");
    const nodeId = connect?.nodeId;
    if (nodeId) {
      // Park the pass, don't discard it: ← Map is "come back to this later".
      if (connect) setConnectProgress((prev) => ({ ...prev, [nodeId]: connect }));
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setConnect(null);
  }, [centerOn, later, connect]);

  /**
   * The write-back — Feynman's connective tissue. Every unresolved gap becomes
   * a red Gap sub-node hung under the parent (via `attachGap`, idempotent),
   * then the phase hands straight off to Connect. The node stays Learning —
   * mastery waits for the Crucible.
   */
  const advanceFromFeynman = useCallback(() => {
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
        showToast(
          `Attached ${specs.length} gap${specs.length === 1 ? "" : "s"} under ${node.label} — now wire it into what you already know.`,
          "Map updated",
        );
    } else {
      setScreen("map");
    }
  }, [attachGap, enterConnect, feynman, feynmanBeatsFor, showToast]);

  /**
   * Understood and connected: the learner made real links (each drafted a card
   * for Retain), so Connect (Phase 4) is complete. The node moves Learning →
   * Shaky — its next phase is the Crucible, where transfer is proven.
   */
  const advanceFromConnect = useCallback(() => {
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
      showToast(
        `${drafted.length} card${drafted.length === 1 ? "" : "s"} drafted for Review · now prove it transfers — the Crucible.`,
      );
    }
  }, [centerOn, connect, later, setShakyReason, showToast]);

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
        "Session · Crucible",
        `Forging a problem ${node.label} was never taught in…`,
        () => loadCrucible(node),
        open,
      );
    },
    [generate, loadCrucible],
  );

  const dispatchCrucible = useCallback((action: CrucibleAction) => {
    setCrucible((prev) => {
      if (!prev) return prev;
      const content = crucibleCacheRef.current[prev.nodeId];
      if (!content) return prev;
      return crucibleReducer(prev, action, content);
    });
  }, []);

  /**
   * Submitting an attempt. An empty workspace isn't diagnostic — nudge instead.
   * A first-rung failure is precise: it spawns its named sub-concept as a red
   * Gap node under the parent and flips the parent Shaky. The stated
   * confidence, held against the outcome, becomes a live calibration reading.
   */
  const crucibleSubmit = useCallback(() => {
    const cur = crucibleRef.current;
    if (!cur || cur.submitted || judgingRef.current) return;
    if (!cur.attempt.trim()) {
      showToast(
        "Put something in the workspace — even a wrong attempt is diagnostic",
      );
      return;
    }
    const content = crucibleCacheRef.current[cur.nodeId];
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!content || !node) return;
    const problem =
      content.problems[Math.min(cur.rung, content.problems.length - 1)];
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
          showToast(
            `Transfer broke on “${gap.label}” — written back as a red gap under ${node.label}`,
            "Map updated",
          );
      })
      .catch((err: Error) => showToast(err.message, "Judge unavailable — try again"))
      .finally(() => setJudging(false));
  }, [attachGap, recordCalib, setShakyReason, showToast]);

  /**
   * Transfer confirmed: the re-attempt carried the concept into a framing it
   * was never taught in, so the first-attempt gap resolves — it leaves the
   * map — and the node lifts Shaky → Mastered, the only path to green.
   */
  const advanceFromCrucible = useCallback(() => {
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
      setLitToday((prev) =>
        prev.includes(node.label) ? prev : [...prev, node.label],
      );
      setAdherence((prev) => markTodayMet(prev));
      showToast(
        `Transfer confirmed · ${node.label} is Mastered — it now feeds Review`,
      );
    }
  }, [centerOn, later, showToast]);

  const exitCrucible = useCallback(() => {
    setScreen("map");
    const nodeId = crucibleRef.current?.nodeId;
    if (nodeId) {
      setSelectedId(nodeId);
      later(() => centerOn(nodeId), 30);
    }
    setCrucible(null);
  }, [centerOn, later]);

  // ---- Retain (Phase 6 · Review queue / FSRS) --------------------------

  /**
   * What the Review queue would generate right now: the card factory only runs
   * for touched nodes that have no cards yet. Derived in one place so a warm
   * and the real entry address the same cache row.
   */
  const retainPlan = useCallback(() => {
    const budgetMin = Math.min(
      15,
      Math.max(5, Math.round(formRef.current.target / 2)),
    );
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
  }, []);

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
        showToast("Queue clear — nothing due right now. Cards resurface as memories fade.");
        return;
      }
      setRetainContent(retainContentFromStore(store, budgetMin));
      setRetain(retainStart());
      setScreen("review");
    };
    if (touched.length === 0) {
      showToast("Nothing to review yet — learn your first concept and cards draft themselves");
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
      "Retain · Review",
      "Drafting cards from what you've learned…",
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
  }, [generate, retainPlan, showToast]);

  const retainConfidence = useCallback((level: ReviewConfidence) => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "confidence", level }, retainContentRef.current);
    });
  }, []);

  const retainToggleAside = useCallback(() => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "toggleAside" }, retainContentRef.current);
    });
  }, []);

  const retainContinue = useCallback(() => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "continue" }, retainContentRef.current);
    });
  }, []);

  /**
   * Grade a card — feeds FSRS and advances. "Again" is the alive-loop: the
   * fail stage opens and the card's node is flagged Shaky, so retention
   * failure re-enters Phase 1. The pre-flip confidence tap, held against the
   * grade, becomes a live calibration reading.
   */
  const retainGrade = useCallback(
    (grade: ReviewGrade) => {
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
          prev[card.node] === "shaky"
            ? prev
            : { ...prev, [card.node]: "shaky" },
        );
        setShakyReason(card.node, "review-miss");
        showToast(
          `“${graphRef.current.nodes.find((n) => n.id === card.node)?.label ?? "This node"}” flagged Shaky — retention failure re-enters the loop`,
          "Map updated",
        );
      }
    },
    [recordCalib, setShakyReason, showToast],
  );

  const retainReteach = useCallback(() => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    const node = graphRef.current.nodes.find((n) => n.id === card.node);
    setRetain(null);
    if (node) {
      enterSession(node);
      later(
        () =>
          showToast(
            `Re-entering the loop · ${node.label} — retention failure routes back to Consume`,
          ),
        420,
      );
    } else {
      setScreen("map");
    }
  }, [enterSession, later, showToast]);

  const exitReview = useCallback(() => {
    setScreen("map");
    setRetain(null);
  }, []);

  // ---- Calibration (§12 · Metacognition) -------------------------------

  /** Open the Calibration surface — an Analytics-layer screen, reached from the
   *  left rail. It reads the live confidence-vs-performance readings. */
  const enterCalib = useCallback(() => setScreen("calibration"), []);

  const exitCalib = useCallback(() => setScreen("map"), []);

  /**
   * The calibration payoff: tapping an overconfident node drops straight into
   * its Crucible to close the real gap.
   */
  const closeCalibGap = useCallback(
    (nodeId: string) => {
      const node = graphRef.current.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setSelectedId(nodeId);
      enterCrucible(node);
    },
    [enterCrucible],
  );

  /** Remove a resolved gap node and every trace of it from the run state. */
  const removeGapNode = useCallback((gapId: string) => {
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
    setStates((prev) => {
      if (!(gapId in prev)) return prev;
      const nextStates = { ...prev };
      delete nextStates[gapId];
      return nextStates;
    });
  }, []);

  /**
   * The pass is done — but "done" isn't automatically "understood" (#C). A
   * gap node closes only when every step was reconstructed, not told; a
   * regular node hands off to Feynman when it was, with a softer note if it
   * took a hint or two, and — leaning on "Just tell me" (or the judge calling
   * "lost") twice or more — the node stays in Learning and a real gap gets
   * attached under it instead of a promise the old toast never kept.
   */
  const advanceFromSocratic = useCallback(() => {
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
        showToast(`Gap closed · ${node.label} resolved and off the map`, "Map updated");
      } else {
        setScreen("map");
        setSelectedId(node.id);
        showToast(
          `Still leaning on being told — ${node.label} stays flagged until it's reconstructed unaided.`,
          "Gap not closed",
        );
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
        label: `${node.label} — foundations`,
        reason: "Leaned on being told outright more than once in the Socratic pass",
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
        consumeProgressRef.current = { ...consumeProgressRef.current, [node.id]: reread };
        setConsumeProgress((prev) => (prev[node.id] ? { ...prev, [node.id]: reread } : prev));
      }
      showToast(
        `Leaning on "Just tell me" — back through the reading on ${node.label} before the questions come again.`,
        "Re-read this first",
      );
      enterSession(node);
      return;
    }
    enterFeynman(node);
  }, [attachGap, enterFeynman, enterSession, removeGapNode, showToast, socratic]);

  // ---- Consume → Socratic hand-off -------------------------------------

  /**
   * Finishing the last chunk.
   *
   * This used to fire the learner straight into Socratic mid-scroll. Eight to
   * fifteen minutes of reading earns a beat that says what it added before the
   * next phase starts taking it back: the takeaways collected, the terms met,
   * the opening guess and how it landed. The hand-off is the recap's CTA.
   */
  const finishConsume = useCallback(() => {
    setConsume((prev) => (prev ? { ...prev, finished: true, recap: true } : prev));
  }, []);

  /** The recap's CTA — the actual hand-off into Socratic (Phase 3a). */
  const beginSocraticFromConsume = useCallback(() => {
    const nodeId = consumeRef.current?.nodeId;
    setConsume(null);
    if (!nodeId) return;
    const node = graphRef.current.nodes.find((n) => n.id === nodeId);
    if (node) enterSocratic(node);
  }, [enterSocratic]);

  const consumeSkipCrucible = useCallback(() => {
    const node = graphRef.current.nodes.find((n) => n.id === consume?.nodeId);
    setConsume(null);
    if (node) enterCrucible(node);
    else setScreen("map");
  }, [consume, enterCrucible]);

  /** "Review prerequisite" — routes to the weakest direct prereq (shaky over
   *  merely learning) via the same session each state opens from the map. */
  const consumeRoutePrereq = useCallback(() => {
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
  }, [consume, enterCrucible, enterFeynman, prereqNodesOf]);

  const onNodeDoubleClick = useCallback(
    (id: string) => {
      const node = graphRef.current.nodes.find((n) => n.id === id);
      if (!node) return;
      const state = displayRef.current[id];
      if (state === "frontier") enterSession(node);
      else if (state === "unknown") {
        setSelectedId(id);
        showToast("Locked — learn the highlighted path first");
      } else setSelectedId(id);
    },
    [enterSession, showToast],
  );

  const onPrimaryAction = useCallback(
    (node: ConceptNode, displayState: NodeState) => {
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
          showToast("Clear its prerequisites first");
      }
    },
    [enterCrucible, enterFeynman, enterReview, enterSession, enterSocratic, showToast],
  );

  /**
   * The aggressive faster lever: prune a frontier node the learner already
   * owns. Mastery is written back, so the frontier re-derives past it and
   * the pace math immediately eases.
   */
  const skipKnown = useCallback(
    (node: ConceptNode) => {
      setStates((prev) => ({ ...prev, [node.id]: "mastered" }));
      showToast(
        `${node.label} pruned — diagnosed known. The frontier moved past it.`,
        "Map updated",
      );
    },
    [showToast],
  );

  const onPhaseAction = useCallback(
    (node: ConceptNode, displayState: NodeState, idx: number) => {
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
        else showToast(`Re-doing ${phase} · ${node.label} — the spiral stays open`);
      } else {
        // The learner jumped the recommended step — allowed, already nudged.
        setStates((prev) =>
          prev[node.id] === "unknown"
            ? { ...prev, [node.id]: "learning" }
            : prev,
        );
        showToast(`Jumping ahead · ${node.label} → ${phase}`);
      }
    },
    [
      enterConnect,
      enterCrucible,
      enterFeynman,
      enterReview,
      enterSession,
      enterSocratic,
      onPrimaryAction,
      reviewedNodes,
      showToast,
    ],
  );

  const onSurface = useCallback(
    (surface: Surface) => {
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
      else showToast("Session · double-click a glowing frontier node to begin");
    },
    [
      enterCrucible,
      enterFeynman,
      enterReview,
      enterSession,
      selectedId,
      showToast,
    ],
  );

  const jumpFrontier = useCallback(() => {
    const target = frontierTargetId();
    if (!target) return;
    setSelectedId(target);
    centerOn(target);
  }, [centerOn, frontierTargetId]);

  const toggleMomentum = useCallback(() => {
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
          timersRef.current.push(
            setTimeout(() => setMomentumPlaying(false), 1000),
          );
        }
        return next;
      });
    }, 1000);
  }, [momentumPlaying]);

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  // The canvas backs onboarding + the map, but Consume is a full surface.
  const showCanvas =
    screen === "building" || screen === "diagnostic" || screen === "map";
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
  const display = useMemo(
    () => displayStates(visibleStates, graph),
    [visibleStates, graph],
  );
  displayRef.current = display;

  const masteredCount = graph.nodes.filter(
    (n) => states[n.id] === "mastered",
  ).length;
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
      if (state === "learning" || state === "shaky" || state === "gap")
        ids.push(n.id);
    }
    const seen = new Set<string>();
    const targets: Array<{ node: ConceptNode; kinds: WarmKind[] }> = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = graph.nodes.find((n) => n.id === id);
      const kinds = warmKindsFor(display[id]);
      if (node && kinds.length) targets.push({ node, kinds });
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
      form.goal === "exam" && form.examDate
        ? paceStatus(states, graph, form.target, daysUntil(form.examDate))
        : null,
    [form.goal, form.examDate, form.target, states, graph],
  );

  // The live calibration readings, resolved against the node labels — read by
  // the Calibration surface and the left-rail "N over" alert.
  const calib = useMemo(
    () =>
      calibItems(
        calibSamples,
        (id) => graph.nodes.find((n) => n.id === id)?.label ?? id,
      ),
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
    nameParts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || "there";
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
  const frontierTotal = graph.nodes.filter(
    (n) => display[n.id] === "frontier",
  ).length;
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
          frontierTotal: m.graph.nodes.filter(
            (n) => otherDisplay[n.id] === "frontier",
          ).length,
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
            The living concept map needs room to breathe. Open Atlas on a
            laptop or desktop — your progress is saved to your account and will
            be right where you left it.
          </div>
        </div>
      </div>
    );
  }
  const narrow = vw < 1280;

  return (
    <div
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
          positions={usingFakeMap ? FAKE_MAP_POSITIONS : positions}
          view={view}
          selectedId={selectedId}
          hoverId={hoverId}
          query={query}
          onWheel={onWheel}
          onCanvasDown={onCanvasDown}
          onNodeDown={onNodeDown}
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
          {(!narrow || detailOpen) && selectedNode && selectedDisplayState && (
            <NodeDetail
              node={selectedNode}
              displayState={selectedDisplayState}
              nodes={graph.nodes}
              edges={graph.edges}
              display={display}
              reviewed={reviewedNodes.includes(selectedNode.id)}
              shakyReason={shakyReasons[selectedNode.id]}
              consumeProgress={consumeProgress[selectedNode.id]}
              onSelect={setSelectedId}
              onPrimaryAction={onPrimaryAction}
              onPhaseAction={onPhaseAction}
              onSkipKnown={skipKnown}
            />
          )}
          {narrow && (
            // Collapsed-rail toggles for laptop-narrow widths (#8).
            <>
              <button
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
            scroll to zoom · drag canvas to pan · drag a node to move ·
            double-click a lit node to begin
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
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          form={form}
          adherence={adherence}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onToggleReminder={onToggleReminder}
          onExportMap={exportMap}
          onExportCardsJson={exportCardsJson}
          onExportCardsCsv={exportCardsCsv}
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

      {screen === "consume" && consume && consumeChunks && (
        <ConsumeView
          topic={form.topic}
          title={
            graph.nodes.find((n) => n.id === consume.nodeId)?.label ?? "Concept"
          }
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
        />
      )}

      {screen === "socratic" && socratic && socraticSteps && (
        <SocraticView
          title={
            graph.nodes.find((n) => n.id === socratic.nodeId)?.label ??
            "Concept"
          }
          session={socratic}
          judging={judging}
          gapMode={
            graph.nodes.find((n) => n.id === socratic.nodeId)?.gap ?? false
          }
          onExit={exitSocratic}
          onAnswer={socraticAnswer}
          onStuck={() => dispatchSocratic({ type: "stuck" })}
          onTell={() => dispatchSocratic({ type: "tell" })}
          onHelpChange={(level) => dispatchSocratic({ type: "setHelp", level })}
          onAdvance={advanceFromSocratic}
        />
      )}

      {screen === "feynman" && feynman && feynmanBeats && (
        <FeynmanView
          topic={form.topic}
          title={
            graph.nodes.find((n) => n.id === feynman.nodeId)?.label ?? "Concept"
          }
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
        />
      )}

      {screen === "connect" && connect && connectContent && (
        <ConnectView
          content={connectContent}
          session={connect}
          onExit={exitConnect}
          onSelect={(id) => dispatchConnect({ type: "select", id })}
          onDraft={(id, value) => dispatchConnect({ type: "draft", id, value })}
          onConfirm={(id) => dispatchConnect({ type: "confirm", id })}
          onPickMnemonic={(index) =>
            dispatchConnect({ type: "pickMnemonic", index })
          }
          onDraftMnemonic={(value) =>
            dispatchConnect({ type: "draftMnemonic", value })
          }
          onAcceptMnemonic={() => dispatchConnect({ type: "acceptMnemonic" })}
          onFinish={advanceFromConnect}
        />
      )}

      {screen === "crucible" && crucible && crucibleContent && (
        <CrucibleView
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
        />
      )}

      {screen === "review" && retain && retainContent && (
        <RetainView
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
        />
      )}

      {screen === "calibration" && (
        <CalibrationView
          items={calib}
          onExit={exitCalib}
          onCloseGap={closeCalibGap}
        />
      )}

      {loading && <GeneratingOverlay phase={loading.phase} message={loading.message} />}

      {toast && <Toast toast={toast} />}
    </div>
  );
}
