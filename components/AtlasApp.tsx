"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADHERENCE,
  DEFAULT_FORM,
  NODES,
  PHASES,
  calibItems,
  calibOverCount,
  connectCards,
  connectReducer,
  connectStart,
  crucibleFor,
  crucibleReducer,
  crucibleStart,
  dailyQueue,
  displayStates,
  elaborationFor,
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  initialStates,
  markTodayMet,
  nextGapFor,
  orderedFrontier,
  paceStatus,
  phaseIndex,
  removeNode,
  retainReducer,
  retainStart,
  reviewCard,
  seedGraph,
  socraticReducer,
  socraticStart,
  spawnGap,
  toggleReminder,
  unmetPathOf,
  type AdherenceState,
  type AltKey,
  type ConceptGraph,
  type ConceptNode,
  type ConnectAction,
  type ConnectSession,
  type CrucibleAction,
  type CrucibleSession,
  type FeynmanAction,
  type FeynmanSession,
  type GapSpec,
  type NodeState,
  type OnboardingForm,
  type RetainSession,
  type ReviewConfidence,
  type ReviewGrade,
  type SocraticAction,
  type SocraticSession,
  type StateMap,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import ConsumeView, {
  type ConsumeSession,
} from "@/components/session/ConsumeView";
import SocraticView from "@/components/session/SocraticView";
import FeynmanView from "@/components/session/FeynmanView";
import ConnectView from "@/components/session/ConnectView";
import CrucibleView from "@/components/session/CrucibleView";
import RetainView from "@/components/session/RetainView";
import CalibrationView from "@/components/analytics/CalibrationView";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas, { type ViewTransform } from "@/components/map/MapCanvas";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar, { type Surface } from "@/components/map/TopBar";
import Toast, { type ToastData } from "@/components/Toast";

type Screen =
  | "welcome"
  | "building"
  | "diagnostic"
  | "map"
  | "consume"
  | "socratic"
  | "feynman"
  | "connect"
  | "crucible"
  | "review"
  | "calibration";

/** How long the map-assembly moment plays before the diagnostic opens. */
const BUILD_MS = 2600;
/** The momentum replay spans onboarding (week 0) plus three weeks of work. */
const MOMENTUM_WEEKS = 3;

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

export default function AtlasApp() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  const [answered, setAnswered] = useState(0);
  const [reveal, setReveal] = useState(0);
  // The graph itself is state: Phase 1 (Plan) restructures it live, spawning
  // gap sub-nodes from failures. Everything derives from it, never from NODES.
  const [graph, setGraph] = useState<ConceptGraph>(seedGraph);
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(() => new Set());
  const [states, setStates] = useState<StateMap>(initialStates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The active Consume (Learn) session, or null when not in one. Phase 2 is a
  // full surface, not a rail — entering a frontier node opens it here.
  const [consume, setConsume] = useState<ConsumeSession | null>(null);
  // The active Socratic (Phase 3a) session, or null. Like Consume it's a full
  // surface; the contingent-tutor logic lives in `socraticReducer`.
  const [socratic, setSocratic] = useState<SocraticSession | null>(null);
  // The active Feynman (Phase 3b) teach-back session, or null. The naive-student
  // engine lives in `feynmanReducer`; unresolved gaps write back to the map.
  const [feynman, setFeynman] = useState<FeynmanSession | null>(null);
  // The active Connect (Phase 4 · Elaboration) session, or null. The learner
  // wires the node into prior mastered nodes; confirmed links (and an accepted
  // mnemonic, when the content is list-like) draft cards for Retain.
  const [connect, setConnect] = useState<ConnectSession | null>(null);
  // The active Crucible (Phase 5 · application/transfer) session, or null. The
  // learner states confidence, attempts a novel-framing problem, and submits;
  // a first-attempt failure writes a precise gap back to the map, a
  // recalibrated re-attempt transfers, and only that lifts the node to Mastered.
  const [crucible, setCrucible] = useState<CrucibleSession | null>(null);
  // The active Retain (Phase 6 · Review queue / FSRS) session, or null. Unlike
  // the node-scoped phases this is a global daily surface reached from the top
  // bar; a missed card writes its node back to Shaky, re-entering the loop.
  const [retain, setRetain] = useState<RetainSession | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
  // §13 Adherence — the wrapper: a forgiving streak (a banked freeze absorbs one
  // missed day), the honest queue, and a right-moment reminder. The flame reads
  // it everywhere; clearing the queue or mastering a node marks today met.
  const [adherence, setAdherence] = useState<AdherenceState>(ADHERENCE);
  // Labels of nodes that reached Mastered this session run — the "what lit up"
  // the done-for-today surface shows, so the day ends on visible progress.
  const [litToday, setLitToday] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => Object.fromEntries(NODES.map((n) => [n.id, { x: n.x, y: n.y }])));
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  const viewRef = useRef(view);
  viewRef.current = view;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  // The live Crucible session, read by its side-effecting submit/finish handlers
  // (they write gap nodes and mastery back to the map outside the reducer).
  const crucibleRef = useRef(crucible);
  crucibleRef.current = crucible;
  // The live Retain session, read by its grade handler (which flags a missed
  // card's node Shaky on the map, outside the reducer).
  const retainRef = useRef(retain);
  retainRef.current = retain;
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

  /**
   * The re-plan restructure: split the next sub-concept out of a failing
   * node — new red gap node, dashed edge, assemble animation. Returns the
   * spec so the caller can voice the "Map updated" toast, or null when the
   * node has nothing left to split (the failure well has run dry).
   */
  const spawnFailureGap = useCallback((parentId: string): GapSpec | null => {
    const spec = nextGapFor(graphRef.current, parentId);
    const base = positionsRef.current[parentId];
    if (!spec || !base) return null;
    setGraph((g) => spawnGap(g, parentId, spec));
    setStates((prev) => ({ ...prev, [spec.id]: "gap" }));
    setPositions((prev) => ({
      ...prev,
      [spec.id]: { x: base.x + spec.dx, y: base.y + spec.dy },
    }));
    setSpawnedIds((prev) => new Set(prev).add(spec.id));
    return spec;
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

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

  // ---- onboarding flow -------------------------------------------------

  const build = useCallback(() => {
    setScreen("building");
    setReveal(0);
    later(() => {
      setScreen("diagnostic");
      setAnswered(0);
    }, BUILD_MS);
  }, [later]);

  const answerDiagnostic = useCallback(() => {
    setAnswered((prev) => {
      const next = prev + 1;
      setReveal(Math.min(3, next));
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
    // The first live re-plan: the diagnostic caught a hesitation inside
    // Gaussian Elimination, so the planner splits that sub-concept out.
    later(() => {
      const parent = graphRef.current.nodes.find((n) => n.id === "gauss");
      if (!parent) return;
      const spec = spawnFailureGap(parent.id);
      if (spec)
        showToast(
          `Added ${spec.label} under ${parent.label} — ${spec.reason}`,
          "Map updated",
        );
    }, BUILD_MS);
  }, [centerOn, frontierTargetId, later, showToast, spawnFailureGap]);

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

  // ---- map actions ------------------------------------------------------

  const enterSession = useCallback((node: ConceptNode) => {
    // Entering a frontier node opens Phase 2 · Consume. The write-back to
    // Learning happens on exit (finishing the last chunk), per the spec —
    // reading isn't learning until the retrieval passes have run.
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
  }, []);

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
   * Open the Socratic surface on a node. The node moves Unknown/Frontier →
   * Learning (understanding is forming), and the contingent-questioning
   * session begins on its first probe.
   */
  const enterSocratic = useCallback((node: ConceptNode) => {
    setStates((prev) =>
      prev[node.id] === "unknown" || prev[node.id] === undefined
        ? { ...prev, [node.id]: "learning" }
        : prev,
    );
    setSocratic(socraticStart(node.id));
    setSelectedId(node.id);
    setScreen("socratic");
  }, []);

  const dispatchSocratic = useCallback(
    (action: SocraticAction) => {
      setSocratic((prev) => {
        if (!prev) return prev;
        const next = socraticReducer(prev, action);
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
   * Open the Feynman teach-back on a node. Like Socratic it's a full surface;
   * the node moves Unknown/Frontier → Learning (understanding is forming) and
   * the naive-student session begins on its opening prompt.
   */
  const enterFeynman = useCallback((node: ConceptNode) => {
    setStates((prev) =>
      prev[node.id] === "unknown" || prev[node.id] === undefined
        ? { ...prev, [node.id]: "learning" }
        : prev,
    );
    setFeynman(feynmanStart(node.id));
    setSelectedId(node.id);
    setScreen("feynman");
  }, []);

  const dispatchFeynman = useCallback((action: FeynmanAction) => {
    setFeynman((prev) => (prev ? feynmanReducer(prev, action) : prev));
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
   * Open the Connect surface on a node. Like the other phases it's a full
   * surface; the node moves Unknown/Frontier → Learning (understanding is
   * forming), and the elaboration session begins idle, waiting for the learner
   * to pick a prior node to link.
   */
  const enterConnect = useCallback((node: ConceptNode) => {
    setStates((prev) =>
      prev[node.id] === "unknown" || prev[node.id] === undefined
        ? { ...prev, [node.id]: "learning" }
        : prev,
    );
    setConnect(connectStart(node.id));
    setSelectedId(node.id);
    setScreen("connect");
  }, []);

  const dispatchConnect = useCallback((action: ConnectAction) => {
    setConnect((prev) =>
      prev ? connectReducer(prev, action, elaborationFor(prev.nodeId)) : prev,
    );
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
   * a red Gap sub-node hung under the parent by a dashed edge (via `spawnGap`,
   * idempotent so re-teaching never duplicates), then the phase hands straight
   * off to Connect. The node stays Learning — mastery waits for the Crucible.
   */
  const advanceFromFeynman = useCallback(() => {
    if (!feynman) return;
    const node = graphRef.current.nodes.find((n) => n.id === feynman.nodeId);
    const specs = feynmanGaps(feynman);
    const base = node ? positionsRef.current[node.id] : undefined;
    if (node && base) {
      specs.forEach((spec) => {
        setGraph((g) => spawnGap(g, node.id, spec));
        setStates((prev) =>
          prev[spec.id] ? prev : { ...prev, [spec.id]: "gap" },
        );
        setPositions((prev) =>
          prev[spec.id]
            ? prev
            : { ...prev, [spec.id]: { x: base.x + spec.dx, y: base.y + spec.dy } },
        );
        setSpawnedIds((prev) => new Set(prev).add(spec.id));
      });
    }
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
  }, [enterConnect, feynman, showToast]);

  /**
   * Understood and connected: the learner made real links (each drafted a card
   * for Retain), so Connect (Phase 4) is complete. The node moves Learning →
   * Shaky — its next phase is the Crucible, where transfer is proven. Mastery
   * is still withheld until that passes.
   */
  const advanceFromConnect = useCallback(() => {
    if (!connect) return;
    const node = graphRef.current.nodes.find((n) => n.id === connect.nodeId);
    const cardCount = connectCards(connect, elaborationFor(connect.nodeId)).length;
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
   * Open the Crucible surface on a node. Unlike the earlier phases it doesn't
   * pre-move mastery — the node is already Shaky (Connect left it there) and the
   * Crucible is where transfer is proven. The session opens on the confidence
   * gate, the calibration hook that precedes the problem.
   */
  const enterCrucible = useCallback((node: ConceptNode) => {
    setCrucible(crucibleStart(node.id));
    setSelectedId(node.id);
    setScreen("crucible");
  }, []);

  const dispatchCrucible = useCallback((action: CrucibleAction) => {
    setCrucible((prev) =>
      prev ? crucibleReducer(prev, action, crucibleFor(prev.nodeId)) : prev,
    );
  }, []);

  /**
   * Submitting an attempt. An empty workspace isn't diagnostic — nudge instead.
   * A first-rung failure is precise: it spawns its named sub-concept as a red
   * Gap node under the parent (via `spawnGap`, idempotent) and flips the parent
   * Shaky — the diagnostically-rich write-back the spec calls for. The reducer
   * owns only the session; the map write lives here.
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
    const content = crucibleFor(cur.nodeId);
    const next = crucibleReducer(cur, { type: "submit" }, content);
    setCrucible(next);
    if (next.outcome !== "partial") return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const base = positionsRef.current[cur.nodeId];
    if (!node || !base) return;
    const gap = content.gap;
    if (graphRef.current.nodes.some((n) => n.id === gap.id)) return;
    setGraph((g) => spawnGap(g, node.id, gap));
    setStates((prev) => ({ ...prev, [gap.id]: "gap", [node.id]: "shaky" }));
    setPositions((prev) => ({
      ...prev,
      [gap.id]: { x: base.x + gap.dx, y: base.y + gap.dy },
    }));
    setSpawnedIds((prev) => new Set(prev).add(gap.id));
    showToast(
      `Transfer broke on “${gap.label}” — written back as a red gap under ${node.label}`,
      "Map updated",
    );
  }, [showToast]);

  /**
   * Transfer confirmed: the recalibrated re-attempt carried the concept into a
   * framing it was never taught in, so the first-attempt gap is resolved — it
   * leaves the map — and the node lifts Shaky → Mastered, the only path to
   * green (Crucible success). It now feeds Review.
   */
  const advanceFromCrucible = useCallback(() => {
    const cur = crucibleRef.current;
    if (!cur) return;
    const node = graphRef.current.nodes.find((n) => n.id === cur.nodeId);
    const gapId = crucibleFor(cur.nodeId).gap.id;
    setGraph((g) => removeNode(g, gapId));
    setStates((prev) => {
      const nextStates = { ...prev };
      delete nextStates[gapId];
      if (node) nextStates[node.id] = "mastered";
      return nextStates;
    });
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
    setScreen("map");
    setCrucible(null);
    if (node) {
      setSelectedId(node.id);
      later(() => centerOn(node.id), 30);
      // Adherence: a node just went green — the day's winnable end. Record what
      // lit up and mark today met so the flame reads lit and the streak ticks.
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
   * Open the daily Review queue — a global surface, not scoped to a node. The
   * session starts on the first card's confidence tap (the calibration hook
   * that precedes every flip).
   */
  const enterReview = useCallback(() => {
    setRetain(retainStart());
    setScreen("review");
  }, []);

  const retainConfidence = useCallback((level: ReviewConfidence) => {
    setRetain((prev) =>
      prev ? retainReducer(prev, { type: "confidence", level }) : prev,
    );
  }, []);

  const retainToggleAside = useCallback(() => {
    setRetain((prev) =>
      prev ? retainReducer(prev, { type: "toggleAside" }) : prev,
    );
  }, []);

  const retainContinue = useCallback(() => {
    setRetain((prev) =>
      prev ? retainReducer(prev, { type: "continue" }) : prev,
    );
  }, []);

  /**
   * Grade a card — feeds FSRS and advances. "Again" is the alive-loop: the
   * reducer opens the fail stage, and here we do the map write-back the spec
   * calls for, flagging the card's node Shaky so retention failure re-enters
   * Phase 1. The reducer owns the session; the map write lives here (as with the
   * Crucible's gap write-back).
   */
  const retainGrade = useCallback(
    (grade: ReviewGrade) => {
      const cur = retainRef.current;
      if (!cur) return;
      const card = reviewCard(cur);
      setRetain(retainReducer(cur, { type: "grade", grade }));
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
    [showToast],
  );

  const retainReteach = useCallback(() => {
    const cur = retainRef.current;
    if (!cur) return;
    const card = reviewCard(cur);
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
   *  left rail. It reads the confidence-vs-performance history, nothing else. */
  const enterCalib = useCallback(() => setScreen("calibration"), []);

  const exitCalib = useCallback(() => setScreen("map"), []);

  /**
   * The calibration payoff: tapping an overconfident node drops straight into
   * its Crucible to close the real gap — the surface turns a felt/real mismatch
   * into the one action that resolves it.
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
   * so Socratic (Phase 3a) is complete. Hand straight off to Feynman — the
   * node stays Learning; mastery isn't granted until the Crucible + retention.
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
          // The Crucible is a real surface: state confidence, attempt a
          // novel-framing problem, submit. Its write-back (a precise gap on
          // failure, mastery on a transferred re-attempt) drives the re-plan.
          enterCrucible(node);
          break;
        case "mastered":
          // Mastered feeds Review — "Review now" opens the daily FSRS queue.
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
      // Socratic (Phase 3a) is a real surface — open it whether the learner is
      // starting it, re-doing it, or jumping ahead to it.
      if (phase === "Socratic") {
        enterSocratic(node);
        return;
      }
      // Feynman (Phase 3b) is a real surface too — open it whether starting,
      // re-doing, or jumping ahead to the teach-back.
      if (phase === "Feynman") {
        enterFeynman(node);
        return;
      }
      // Connect (Phase 4 · Elaboration) is a real surface as well — open it to
      // start it, re-do it, or jump ahead to wiring the node into prior nodes.
      if (phase === "Connect") {
        enterConnect(node);
        return;
      }
      // Crucible (Phase 5 · application/transfer) is a real surface too — open
      // it to start it, re-do it, or jump ahead to proving transfer.
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
  // Frontier/locking are derived from the masked states, so the glowing
  // frontier advances live through both the diagnostic and the replay.
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
  const masteryPct = Math.round((masteredCount / graph.nodes.length) * 100);

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

  // The plan, continuously re-derived: the frontier ordered to the goal
  // (what the left rail lists and "jump to frontier" targets)…
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

  // The calibration readings, resolved against the live node labels — read by
  // the Calibration surface and the left-rail "N over" alert.
  const calib = useMemo(
    () => calibItems((id) => graph.nodes.find((n) => n.id === id)?.label ?? id),
    [graph],
  );

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

      {screen === "diagnostic" && (
        <DiagnosticPanel
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
            queue={dailyQueue()}
            onToggleReminder={onToggleReminder}
          />
          <LeftRail
            subject={form.topic.trim() || "Linear Algebra"}
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

      {screen === "consume" && consume && (
        <ConsumeView
          title={
            graph.nodes.find((n) => n.id === consume.nodeId)?.label ?? "Concept"
          }
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

      {screen === "socratic" && socratic && (
        <SocraticView
          title={
            graph.nodes.find((n) => n.id === socratic.nodeId)?.label ??
            "Concept"
          }
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

      {screen === "feynman" && feynman && (
        <FeynmanView
          title={
            graph.nodes.find((n) => n.id === feynman.nodeId)?.label ?? "Concept"
          }
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

      {screen === "connect" && connect && (
        <ConnectView
          content={elaborationFor(connect.nodeId)}
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

      {screen === "crucible" && crucible && (
        <CrucibleView
          content={crucibleFor(crucible.nodeId)}
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

      {screen === "review" && retain && (
        <RetainView
          session={retain}
          nodeLabel={
            graph.nodes.find((n) => n.id === reviewCard(retain).node)?.label ??
            "This node"
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

      {toast && <Toast toast={toast} />}
    </div>
  );
}
