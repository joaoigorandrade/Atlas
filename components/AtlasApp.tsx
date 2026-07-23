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
  dailyQueue,
  displayStates,
  emptyGraph,
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  freshAdherence,
  GOALS,
  initialStates,
  markTodayMet,
  orderedFrontier,
  paceStatus,
  phaseIndex,
  removeNode,
  retainReducer,
  retainStart,
  reviewCard,
  socraticReducer,
  socraticStart,
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
  type CrucibleAction,
  type CrucibleContent,
  type CrucibleSession,
  type DiagnosticQuestion,
  type ElaborationContent,
  type FeynmanAction,
  type FeynmanBeat,
  type FeynmanSession,
  type GapSpec,
  type NodeState,
  type OnboardingForm,
  type RetainContent,
  type RetainSession,
  type ReviewConfidence,
  type ReviewGrade,
  type SocraticAction,
  type SocraticSession,
  type SocraticStep,
  type StateMap,
} from "@/lib/curriculum";
import {
  fetchConnect,
  fetchConsume,
  fetchCrucible,
  fetchCurriculum,
  fetchFeynman,
  fetchRetain,
  fetchSocratic,
} from "@/lib/api";
import { color, font } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { loadLatestRun, saveRun, type RunSnapshot } from "@/lib/persistence";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import DashboardScreen from "@/components/DashboardScreen";
import ProfileScreen, { type ProfileStat } from "@/components/ProfileScreen";
import ConsumeView, {
  type ConsumeSession,
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

export default function AtlasApp({ userEmail }: { userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  // False until the saved run (if any) has been fetched — nothing renders
  // before then, so a resumed run never flashes the welcome screen.
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
  // The active Socratic (Phase 3a) session, or null.
  const [socratic, setSocratic] = useState<SocraticSession | null>(null);
  // The active Feynman (Phase 3b) teach-back session, or null.
  const [feynman, setFeynman] = useState<FeynmanSession | null>(null);
  // The active Connect (Phase 4 · Elaboration) session, or null.
  const [connect, setConnect] = useState<ConnectSession | null>(null);
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
  const diagnosticRef = useRef(diagnostic);
  diagnosticRef.current = diagnostic;
  const statesRef = useRef(states);
  statesRef.current = states;
  const crucibleRef = useRef(crucible);
  crucibleRef.current = crucible;
  const retainRef = useRef(retain);
  retainRef.current = retain;
  const consumeCacheRef = useRef(consumeCache);
  consumeCacheRef.current = consumeCache;
  const socraticCacheRef = useRef(socraticCache);
  socraticCacheRef.current = socraticCache;
  const feynmanCacheRef = useRef(feynmanCache);
  feynmanCacheRef.current = feynmanCache;
  const connectCacheRef = useRef(connectCache);
  connectCacheRef.current = connectCache;
  const crucibleCacheRef = useRef(crucibleCache);
  crucibleCacheRef.current = crucibleCache;
  const retainContentRef = useRef(retainContent);
  retainContentRef.current = retainContent;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
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

  useEffect(() => {
    let cancelled = false;
    loadLatestRun(supabase)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          const s = row.snapshot;
          setForm(s.form);
          setGraph(s.graph);
          setStates(s.states);
          setPositions(s.positions);
          setSpawnedIds(new Set(s.spawnedIds));
          setAdherence(s.adherence);
          setCalibSamples(s.calibSamples);
          setLitToday(s.litToday);
          setConsumeCache(s.caches.consume);
          setSocraticCache(s.caches.socratic);
          setFeynmanCache(s.caches.feynman);
          setConnectCache(s.caches.connect);
          setCrucibleCache(s.caches.crucible);
          setRetainContent(s.caches.retain);
          setScreen("map");
        }
        setHydrated(true);
      })
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
  }, [supabase, showToast]);

  // Write-through, debounced: any change to the run once the map exists
  // (post-onboarding) upserts the whole snapshot. Coarse by design — see
  // lib/persistence.ts.
  useEffect(() => {
    const runActive =
      hydrated &&
      graph.nodes.length > 0 &&
      screen !== "welcome" &&
      screen !== "building" &&
      screen !== "diagnostic";
    if (!runActive) return;
    const snapshot: RunSnapshot = {
      v: 1,
      form,
      graph,
      spawnedIds: [...spawnedIds],
      states,
      positions,
      adherence,
      calibSamples,
      litToday,
      caches: {
        consume: consumeCache,
        socratic: socraticCache,
        feynman: feynmanCache,
        connect: connectCache,
        crucible: crucibleCache,
        retain: retainContent,
      },
    };
    const timer = setTimeout(() => {
      saveRun(supabase, form.topic.trim() || "Untitled", snapshot).catch(
        (err: Error) => console.warn(err.message),
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    hydrated,
    screen,
    supabase,
    form,
    graph,
    spawnedIds,
    states,
    positions,
    adherence,
    calibSamples,
    litToday,
    consumeCache,
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

  // ---- Home (dashboard) + profile navigation ---------------------------

  const enterDashboard = useCallback(() => setScreen("dashboard"), []);
  const enterProfile = useCallback(() => setScreen("profile"), []);
  const openMap = useCallback(() => setScreen("map"), []);
  /** "+ New map" — the single-run app rebuilds from onboarding. */
  const newMap = useCallback(() => setScreen("welcome"), []);
  /** Preferences has no surface yet — the live controls live on the map. */
  const enterSettings = useCallback(
    () =>
      showToast(
        "Preferences live on the map for now — tune your reminder from the streak flame and pace from the left rail.",
      ),
    [showToast],
  );

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
   * "Build my map": the AI generates the concept graph + placement diagnostic
   * for the typed topic. The assembling moment plays while it thinks; the
   * diagnostic opens once both the content and the animation are done.
   */
  const build = useCallback(() => {
    const topic = form.topic.trim();
    if (!topic) {
      showToast("Name a topic first — the map is generated from it");
      return;
    }
    setScreen("building");
    setReveal(0);
    const started = Date.now();
    fetchCurriculum({ topic, goal: form.goal, interests: form.interests })
      .then((payload) => {
        setGraph(payload.graph);
        setStates(initialStates(payload.graph));
        setPositions(
          Object.fromEntries(
            payload.graph.nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
          ),
        );
        setDiagnostic(payload.diagnostic);
        setSpawnedIds(new Set());
        pendingGapsRef.current = [];
        setConsumeCache({});
        setSocraticCache({});
        setFeynmanCache({});
        setConnectCache({});
        setCrucibleCache({});
        setRetainContent(null);
        setCalibSamples([]);
        const wait = Math.max(0, BUILD_MS - (Date.now() - started));
        later(() => {
          setScreen("diagnostic");
          setAnswered(0);
        }, wait);
      })
      .catch((err: Error) => {
        setScreen("welcome");
        showToast(err.message, "Generation failed");
      });
  }, [form, later, showToast]);

  /**
   * A diagnostic answer writes real mastery back: a confident answer prunes
   * the concept and its whole prerequisite chain (diagnosed known); a hesitant
   * one marks it learned-but-shaky and queues its gap sub-node for the first
   * live re-plan; "no idea" leaves the territory unknown.
   */
  const answerDiagnostic = useCallback((optionIndex: number) => {
    setAnswered((prev) => {
      const q = diagnosticRef.current[prev];
      const effect = q?.opts[optionIndex]?.effect ?? "none";
      if (q && effect !== "none") {
        const chain = ancestorsOf(q.nodeId, graphRef.current.edges);
        setStates((s) => {
          const next = { ...s };
          for (const id of chain) next[id] = "mastered";
          if (effect === "shaky") next[q.nodeId] = "shaky";
          return next;
        });
        if (effect === "shaky" && q.gap)
          pendingGapsRef.current.push({ parentId: q.nodeId, spec: q.gap });
      }
      const next = prev + 1;
      const total = diagnosticRef.current.length || 1;
      const maxG = Math.max(1, ...graphRef.current.nodes.map((n) => n.g));
      setReveal(Math.ceil((Math.min(next, total) / total) * maxG));
      return next;
    });
  }, []);

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
      phase: string,
      message: string,
      fetcher: () => Promise<T>,
      onReady: (content: T) => void,
    ) => {
      if (loadingRef.current) return;
      setLoading({ phase, message });
      fetcher()
        .then((content) => {
          onReady(content);
        })
        .catch((err: Error) => {
          showToast(err.message, "Generation failed");
        })
        .finally(() => setLoading(null));
    },
    [showToast],
  );

  /** Direct (solid-edge) prerequisite labels of a node — grounds the prompts. */
  const prereqLabelsOf = useCallback((nodeId: string): string[] => {
    const g = graphRef.current;
    return g.edges
      .filter(([, to, dashed]) => to === nodeId && !dashed)
      .map(([from]) => g.nodes.find((n) => n.id === from)?.label)
      .filter((l): l is string => !!l);
  }, []);

  /** Labels the learner has actually learned — context for transfer problems. */
  const learnedLabels = useCallback((): string[] => {
    const g = graphRef.current;
    return g.nodes
      .filter((n) => !n.gap && statesRef.current[n.id] === "mastered")
      .map((n) => n.label);
  }, []);

  // ---- map actions ------------------------------------------------------

  /**
   * Entering a frontier node opens Phase 2 · Consume, generating the node's
   * reading pass first if this run hasn't yet. The write-back to Learning
   * happens on exit (finishing the last chunk), per the spec.
   */
  const enterSession = useCallback(
    (node: ConceptNode) => {
      const open = () => {
        setConsume({
          nodeId: node.id,
          idx: 0,
          answered: {},
          variant: {},
          term: null,
          aside: null,
        });
        setSelectedId(node.id);
        setScreen("consume");
      };
      if (consumeCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        "Session · Consume",
        `Writing your reading pass on ${node.label}…`,
        () =>
          fetchConsume({
            topic: formRef.current.topic,
            nodeLabel: node.label,
            prereqLabels: prereqLabelsOf(node.id),
            interests: formRef.current.interests,
          }),
        (chunks) => {
          setConsumeCache((prev) => ({ ...prev, [node.id]: chunks }));
          open();
        },
      );
    },
    [generate, prereqLabelsOf],
  );

  // ---- Consume (Learn view) --------------------------------------------

  const consumeAnswer = useCallback(
    (chunkId: string, oi: number, correct: boolean) => {
      setConsume((prev) =>
        prev
          ? {
              ...prev,
              answered: { ...prev.answered, [chunkId]: { oi, correct } },
            }
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

  const consumeSetVariant = useCallback((chunkId: string, key: AltKey) => {
    setConsume((prev) => {
      if (!prev) return prev;
      const cur = prev.variant[chunkId];
      return {
        ...prev,
        variant: { ...prev.variant, [chunkId]: cur === key ? null : key },
      };
    });
  }, []);

  const consumeToggleTerm = useCallback((key: string) => {
    setConsume((prev) =>
      prev ? { ...prev, term: prev.term === key ? null : key } : prev,
    );
  }, []);

  const consumeToggleAside = useCallback((chunkId: string) => {
    setConsume((prev) =>
      prev ? { ...prev, aside: prev.aside === chunkId ? null : chunkId } : prev,
    );
  }, []);

  const exitConsume = useCallback(() => setScreen("map"), []);

  // ---- Socratic (Phase 3a) ---------------------------------------------

  /**
   * Open the Socratic surface on a node, generating its questioning script
   * first if needed. The node moves Unknown/Frontier → Learning and the
   * contingent-questioning session begins on its first probe.
   */
  const enterSocratic = useCallback(
    (node: ConceptNode) => {
      const open = (steps: SocraticStep[]) => {
        setStates((prev) =>
          prev[node.id] === "unknown" || prev[node.id] === undefined
            ? { ...prev, [node.id]: "learning" }
            : prev,
        );
        setSocratic(socraticStart(node.id, steps));
        setSelectedId(node.id);
        setScreen("socratic");
      };
      const cached = socraticCacheRef.current[node.id];
      if (cached) {
        open(cached);
        return;
      }
      generate(
        "Session · Socratic",
        `Preparing the questions that build ${node.label}…`,
        () =>
          fetchSocratic({
            topic: formRef.current.topic,
            nodeLabel: node.label,
            interests: formRef.current.interests,
          }),
        (steps) => {
          setSocraticCache((prev) => ({ ...prev, [node.id]: steps }));
          open(steps);
        },
      );
    },
    [generate],
  );

  const dispatchSocratic = useCallback(
    (action: SocraticAction) => {
      setSocratic((prev) => {
        if (!prev) return prev;
        const steps = socraticCacheRef.current[prev.nodeId];
        if (!steps?.length) return prev;
        const next = socraticReducer(prev, action, steps);
        // Repeated "Just tell me" flags a likely prerequisite gap (the spec's
        // logged-drop-to-instruction signal).
        if (action.type === "tell" && next.tells >= 2)
          showToast(
            "Leaning on “Just tell me” — an earlier concept may be shaky. I'll flag it on the map.",
            "Prerequisite gap",
          );
        return next;
      });
    },
    [showToast],
  );

  const clearSocraticPad = useCallback(() => {
    setSocratic((prev) => (prev ? { ...prev, padReaction: null } : prev));
  }, []);

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
        setFeynman(feynmanStart(node.id));
        setSelectedId(node.id);
        setScreen("feynman");
      };
      if (feynmanCacheRef.current[node.id]) {
        open();
        return;
      }
      generate(
        "Session · Feynman",
        `Waking the naive student for ${node.label}…`,
        () =>
          fetchFeynman({
            topic: formRef.current.topic,
            nodeId: node.id,
            nodeLabel: node.label,
            interests: formRef.current.interests,
          }),
        (beats) => {
          setFeynmanCache((prev) => ({ ...prev, [node.id]: beats }));
          open();
        },
      );
    },
    [generate],
  );

  const dispatchFeynman = useCallback((action: FeynmanAction) => {
    setFeynman((prev) => {
      if (!prev) return prev;
      const beats = feynmanCacheRef.current[prev.nodeId];
      if (!beats?.length) return prev;
      return feynmanReducer(prev, action, beats);
    });
  }, []);

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
        setConnect(connectStart(node.id));
        setSelectedId(node.id);
        setScreen("connect");
      };
      if (connectCacheRef.current[node.id]) {
        open();
        return;
      }
      // Prior-node pool: touched (learned/shaky/mastered) non-gap nodes first;
      // a fresh map falls back to the node's neighborhood so the web is never
      // empty.
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
      generate(
        "Session · Connect",
        `Finding what ${node.label} wires into…`,
        () =>
          fetchConnect({
            topic: formRef.current.topic,
            nodeId: node.id,
            nodeLabel: node.label,
            pool,
            interests: formRef.current.interests,
          }),
        (content) => {
          setConnectCache((prev) => ({ ...prev, [node.id]: content }));
          open();
        },
      );
    },
    [generate],
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
    const beats = feynmanCacheRef.current[feynman.nodeId] ?? [];
    const specs = feynmanGaps(feynman, beats);
    if (node) specs.forEach((spec) => attachGap(node.id, spec));
    setFeynman(null);
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
  }, [attachGap, enterConnect, feynman, showToast]);

  /**
   * Understood and connected: the learner made real links (each drafted a card
   * for Retain), so Connect (Phase 4) is complete. The node moves Learning →
   * Shaky — its next phase is the Crucible, where transfer is proven.
   */
  const advanceFromConnect = useCallback(() => {
    if (!connect) return;
    const node = graphRef.current.nodes.find((n) => n.id === connect.nodeId);
    const content = connectCacheRef.current[connect.nodeId];
    const cardCount = content ? connectCards(connect, content).length : 0;
    if (node)
      setStates((prev) =>
        prev[node.id] === "learning" || prev[node.id] === "unknown"
          ? { ...prev, [node.id]: "shaky" }
          : prev,
      );
    setScreen("map");
    setConnect(null);
    if (node) {
      setSelectedId(node.id);
      later(() => centerOn(node.id), 30);
      showToast(
        `${cardCount} card${cardCount === 1 ? "" : "s"} drafted for Review · now prove it transfers — the Crucible.`,
      );
    }
  }, [centerOn, connect, later, showToast]);

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
        "Session · Crucible",
        `Forging a problem ${node.label} was never taught in…`,
        () =>
          fetchCrucible({
            topic: formRef.current.topic,
            nodeId: node.id,
            nodeLabel: node.label,
            masteredLabels: learnedLabels(),
            interests: formRef.current.interests,
          }),
        (content) => {
          setCrucibleCache((prev) => ({ ...prev, [node.id]: content }));
          open();
        },
      );
    },
    [generate, learnedLabels],
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
    if (!cur || cur.submitted) return;
    if (!cur.attempt.trim()) {
      showToast(
        "Put something in the workspace — even a wrong attempt is diagnostic",
      );
      return;
    }
    const content = crucibleCacheRef.current[cur.nodeId];
    if (!content) return;
    const next = crucibleReducer(cur, { type: "submit" }, content);
    setCrucible(next);
    // The calibration hook made real: felt (the confidence tap) vs. what
    // actually happened on this attempt.
    if (cur.conf !== null)
      recordCalib(
        cur.nodeId,
        CRUCIBLE_FELT[cur.conf],
        next.outcome === "partial" ? 45 : 88,
      );
    if (next.outcome !== "partial") return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    if (!node) return;
    if (attachGap(node.id, content.gap)) {
      setStates((prev) => ({ ...prev, [node.id]: "shaky" }));
      showToast(
        `Transfer broke on “${content.gap.label}” — written back as a red gap under ${node.label}`,
        "Map updated",
      );
    }
  }, [attachGap, recordCalib, showToast]);

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
   * Open the daily Review queue — a global surface. The day's cards are
   * generated once from the nodes the learner has actually touched; there is
   * nothing to review until at least one concept has been learned.
   */
  const enterReview = useCallback(() => {
    const open = () => {
      setRetain(retainStart());
      setScreen("review");
    };
    if (retainContentRef.current) {
      open();
      return;
    }
    const g = graphRef.current;
    const nodes = g.nodes
      .filter(
        (n) =>
          !n.gap &&
          ["learning", "shaky", "mastered"].includes(statesRef.current[n.id] ?? ""),
      )
      .map((n) => ({ id: n.id, label: n.label, state: statesRef.current[n.id]! }));
    if (nodes.length === 0) {
      showToast("Nothing to review yet — learn your first concept and cards draft themselves");
      return;
    }
    const budgetMin = Math.min(15, Math.max(5, Math.round(formRef.current.target / 2)));
    generate(
      "Retain · Review",
      "Drafting today's queue from what you've learned…",
      () =>
        fetchRetain({
          topic: formRef.current.topic,
          budgetMin,
          nodes,
          interests: formRef.current.interests,
        }),
      (content) => {
        setRetainContent(content);
        open();
      },
    );
  }, [generate, showToast]);

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
      if (cur.conf !== null)
        recordCalib(card.node, REVIEW_FELT[cur.conf], GRADE_REAL[grade]);
      if (grade === "again" && card.fails) {
        setStates((prev) =>
          prev[card.node] === "shaky"
            ? prev
            : { ...prev, [card.node]: "shaky" },
        );
        showToast(
          `“${graphRef.current.nodes.find((n) => n.id === card.node)?.label ?? "This node"}” flagged Shaky — retention failure re-enters the loop`,
          "Map updated",
        );
      }
    },
    [recordCalib, showToast],
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

  /**
   * Understanding established: the learner answered the core probes unaided,
   * so Socratic (Phase 3a) is complete. Hand straight off to Feynman.
   */
  const advanceFromSocratic = useCallback(() => {
    const node = graphRef.current.nodes.find((n) => n.id === socratic?.nodeId);
    setSocratic(null);
    if (node) enterFeynman(node);
    else setScreen("map");
  }, [enterFeynman, socratic]);

  // ---- Consume → Socratic hand-off -------------------------------------

  /**
   * Finishing the last chunk: the node moves Unknown/Frontier → Learning and
   * auto-advances into Socratic (Phase 3a), per the spec's Consume exit.
   */
  const finishConsume = useCallback(() => {
    const nodeId = consume?.nodeId;
    setConsume(null);
    if (!nodeId) return;
    const node = graphRef.current.nodes.find((n) => n.id === nodeId);
    if (node) enterSocratic(node);
  }, [consume, enterSocratic]);

  const consumeSkipCrucible = useCallback(() => {
    const node = graphRef.current.nodes.find((n) => n.id === consume?.nodeId);
    setScreen("map");
    setConsume(null);
    showToast(
      `Diagnostic overshoot — skipping ahead to the Crucible for ${node?.label ?? "this node"}`,
      "Fast-forward",
    );
  }, [consume, showToast]);

  const consumeRoutePrereq = useCallback(() => {
    setScreen("map");
    setConsume(null);
    showToast(
      "Routing to a prerequisite — an earlier concept looks shaky",
      "Map updated",
    );
  }, [showToast]);

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
        case "learning":
          enterFeynman(node);
          break;
        case "shaky":
          enterCrucible(node);
          break;
        case "mastered":
          enterReview();
          break;
        case "gap":
          showToast(`Targeted Socratic pass on ${node.label}`);
          break;
        default:
          showToast("Clear its prerequisites first");
      }
    },
    [enterCrucible, enterFeynman, enterReview, enterSession, showToast],
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
      const current = phaseIndex(displayState);
      if (current < 0) return;
      const phase = PHASES[idx];
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
      enterSocratic,
      onPrimaryAction,
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
        if (next >= MOMENTUM_WEEKS && momentumRef.current)
          clearInterval(momentumRef.current);
        return next;
      });
    }, 1000);
  }, [momentumPlaying]);

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  // The canvas backs onboarding + the map, but Consume is a full surface.
  const showCanvas =
    screen === "building" || screen === "diagnostic" || screen === "map";

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
  const nextUp = useMemo(
    () => orderedFrontier(display, graph, form.goal).slice(0, 3),
    [display, graph, form.goal],
  );
  // …and the pace check against the deadline, when the goal has one.
  const pace = useMemo(
    () =>
      form.goal === "exam" ? paceStatus(states, graph, form.target) : null,
    [form.goal, form.target, states, graph],
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

  const consumeChunks = consume ? consumeCache[consume.nodeId] : undefined;
  const socraticSteps = socratic ? socraticCache[socratic.nodeId] : undefined;
  const feynmanBeats = feynman ? feynmanCache[feynman.nodeId] : undefined;
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

  const queue = dailyQueue(retainContent, form.target);
  const frontierTotal = graph.nodes.filter(
    (n) => display[n.id] === "frontier",
  ).length;
  const frontierConcept = nextUp[0]?.node.label ?? null;
  const subject = form.topic.trim() || "Your map";
  const goalLabel = GOALS.find(([g]) => g === form.goal)?.[1] ?? "General mastery";
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
  // must open on the map, never flash the welcome screen first.
  if (!hydrated) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: color.paper,
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: color.paper,
        color: color.ink,
        fontFamily: font.sans,
        fontSize: 15,
      }}
    >
      {showCanvas && (
        <MapCanvas
          screen={screen as "map" | "building" | "diagnostic"}
          nodes={graph.nodes}
          edges={graph.edges}
          spawnedIds={spawnedIds}
          display={display}
          lockedPath={lockedPath}
          positions={positions}
          view={view}
          selectedId={selectedId}
          hoverId={hoverId}
          query={query}
          onWheel={onWheel}
          onCanvasDown={onCanvasDown}
          onNodeDown={onNodeDown}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeHover={setHoverId}
        />
      )}

      {screen === "building" && <BuildingOverlay />}

      {screen === "diagnostic" && diagnostic.length > 0 && (
        <DiagnosticPanel
          questions={diagnostic}
          answered={answered}
          onAnswer={answerDiagnostic}
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
            queue={dailyQueue(retainContent, form.target)}
            onToggleReminder={onToggleReminder}
            userEmail={userEmail}
            onHome={enterDashboard}
            onProfile={enterProfile}
          />
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
          {selectedNode && selectedDisplayState && (
            <NodeDetail
              node={selectedNode}
              displayState={selectedDisplayState}
              nodes={graph.nodes}
              edges={graph.edges}
              display={display}
              onSelect={setSelectedId}
              onPrimaryAction={onPrimaryAction}
              onPhaseAction={onPhaseAction}
              onSkipKnown={skipKnown}
            />
          )}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 280,
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
          goalLabel={goalLabel}
          frontierConcept={frontierConcept}
          frontierTotal={frontierTotal}
          masteryPct={masteryPct}
          onOpenMap={openMap}
          onReview={enterReview}
          onProfile={enterProfile}
          onNewMap={newMap}
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
          title={
            graph.nodes.find((n) => n.id === consume.nodeId)?.label ?? "Concept"
          }
          chunks={consumeChunks}
          session={consume}
          onExit={exitConsume}
          onAnswer={consumeAnswer}
          onContinue={consumeContinue}
          onFinish={finishConsume}
          onSetVariant={consumeSetVariant}
          onToggleTerm={consumeToggleTerm}
          onToggleAside={consumeToggleAside}
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
          steps={socraticSteps}
          session={socratic}
          onExit={exitSocratic}
          onReply={(index) => dispatchSocratic({ type: "reply", index })}
          onSubmitScratch={() => dispatchSocratic({ type: "scratch" })}
          onStuck={() => dispatchSocratic({ type: "stuck" })}
          onTell={() => dispatchSocratic({ type: "tell" })}
          onClearPad={clearSocraticPad}
          onAdvance={advanceFromSocratic}
        />
      )}

      {screen === "feynman" && feynman && feynmanBeats && (
        <FeynmanView
          title={
            graph.nodes.find((n) => n.id === feynman.nodeId)?.label ?? "Concept"
          }
          beats={feynmanBeats}
          session={feynman}
          onExit={exitFeynman}
          onBegin={() => dispatchFeynman({ type: "begin" })}
          onSpeak={() => dispatchFeynman({ type: "speak" })}
          onReply={(index) => dispatchFeynman({ type: "reply", index })}
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
