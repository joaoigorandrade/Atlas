"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FORM,
  NODES,
  PHASES,
  displayStates,
  frontierIds,
  initialStates,
  phaseIndex,
  unmetPathOf,
  type ConceptNode,
  type NodeState,
  type OnboardingForm,
  type StateMap,
} from "@/lib/curriculum";
import {
  criticalPathTo,
  goalNode,
  pace as computePace,
  planSummary,
} from "@/lib/planner";
import { color, font } from "@/lib/theme";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas, { type ViewTransform } from "@/components/map/MapCanvas";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar, { type Surface } from "@/components/map/TopBar";
import Toast from "@/components/Toast";

type Screen = "welcome" | "building" | "diagnostic" | "map";

/** How long the map-assembly moment plays before the diagnostic opens. */
const BUILD_MS = 2600;
/** The diagnostic narrative pins the frontier here ("basis is your edge"). */
const FRONTIER_START = "basis";
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
  const [states, setStates] = useState<StateMap>(initialStates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  // Phase 1 — Plan: goal-conditioned ordering made visible. When on, the map
  // highlights the critical path to the goal (SPEC §5).
  const [prioritize, setPrioritize] = useState(false);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => Object.fromEntries(NODES.map((n) => [n.id, { x: n.x, y: n.y }])));
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  // The map's summit — what goal-conditioned ordering steers toward (SPEC §5).
  const goal = useMemo(() => goalNode(), []);

  const viewRef = useRef(view);
  viewRef.current = view;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
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

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2400);
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

  /** The node the "Start here →" / "Jump to frontier" affordances target. */
  const frontierTargetId = useCallback(() => {
    const ids = frontierIds(displayRef.current);
    return ids.includes(FRONTIER_START) ? FRONTIER_START : (ids[0] ?? null);
  }, []);

  const startMap = useCallback(() => {
    const target = frontierTargetId() ?? FRONTIER_START;
    setScreen("map");
    setSelectedId(target);
    later(() => centerOn(target), 30);
    // The diagnostic just re-planned the map: raise the "Map updated" toast
    // (SPEC §5) built from what it actually pruned, where the frontier landed,
    // and the pace verdict — not a canned string.
    const frontierLabel = NODES.find((n) => n.id === target)?.label ?? null;
    later(
      () =>
        showToast(
          planSummary(
            goal.id,
            goal.label,
            states,
            form.goal,
            frontierLabel,
            form.target,
          ),
        ),
      BUILD_MS,
    );
  }, [centerOn, frontierTargetId, form.goal, form.target, goal, later, showToast, states]);

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

  const enterSession = useCallback(
    (node: ConceptNode) => {
      // Entering a session is the map's first write-back: the frontier node
      // flips to Learning, and dependents whose prerequisites are now all
      // touched light up as the new frontier.
      setStates((prev) =>
        prev[node.id] === "unknown"
          ? { ...prev, [node.id]: "learning" }
          : prev,
      );
      const onGoalPath = criticalPathTo(goal.id, states).has(node.id);
      showToast(
        onGoalPath
          ? `Session · ${node.label} → Consume — marked Learning · on the critical path to ${goal.label}`
          : `Session · ${node.label} → Consume — marked Learning (the session spiral is the next milestone)`,
      );
    },
    [goal, showToast, states],
  );

  const onNodeDoubleClick = useCallback(
    (id: string) => {
      const node = NODES.find((n) => n.id === id);
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
          showToast(`Resuming · ${node.label} → Feynman teach-back`);
          break;
        case "shaky":
          showToast(`Re-attempting the Crucible for ${node.label}`);
          break;
        case "mastered":
          showToast(`Queuing review cards for ${node.label}`);
          break;
        case "gap":
          showToast(`Targeted Socratic pass on ${node.label}`);
          break;
        default:
          showToast("Clear its prerequisites first");
      }
    },
    [enterSession, showToast],
  );

  const onPhaseAction = useCallback(
    (node: ConceptNode, displayState: NodeState, idx: number) => {
      const current = phaseIndex(displayState);
      if (current < 0) return;
      const phase = PHASES[idx];
      if (idx === current) {
        onPrimaryAction(node, displayState);
      } else if (idx < current) {
        // Secondary action: any completed phase stays open for a re-do.
        if (phase === "Retained")
          showToast(`Queuing review cards for ${node.label}`);
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
    [onPrimaryAction, showToast],
  );

  const onSurface = useCallback(
    (surface: Surface) => {
      if (surface === "map") return;
      if (surface === "review") {
        showToast("Review · opening today's queue — ~8 min, 14 cards due");
        return;
      }
      const node = NODES.find((n) => n.id === selectedId);
      const state = node ? displayRef.current[node.id] : undefined;
      if (node && state === "frontier") enterSession(node);
      else if (node && state === "learning")
        showToast(`Session · resuming ${node.label} → Feynman`);
      else showToast("Session · double-click a glowing frontier node to begin");
    },
    [enterSession, selectedId, showToast],
  );

  const jumpFrontier = useCallback(() => {
    const target = frontierTargetId();
    if (!target) return;
    setSelectedId(target);
    centerOn(target);
  }, [centerOn, frontierTargetId]);

  // Goal-conditioned ordering: light the critical path to the goal and raise a
  // "Map updated" re-plan toast naming how many concepts got reordered ahead.
  const togglePrioritize = useCallback(() => {
    setPrioritize((prev) => {
      const next = !prev;
      if (next) {
        const count = criticalPathTo(goal.id, states).size;
        showToast(
          `Map updated · ordered ${count} concepts toward ${goal.label} — its critical path is lit`,
        );
      }
      return next;
    });
  }, [goal, showToast, states]);

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
  const showCanvas = screen !== "welcome";

  // What the canvas shows: the live state map, masked during onboarding
  // (generations beyond the diagnostic reveal stay hidden) and during the
  // momentum replay (states that lit after the replay week stay hidden).
  // Frontier/locking are derived from the masked states, so the glowing
  // frontier advances live through both the diagnostic and the replay.
  const visibleStates = useMemo<StateMap>(
    () =>
      Object.fromEntries(
        NODES.map((n) => [
          n.id,
          (!isMap && n.g > reveal) || (momentumPlaying && n.week > momentumWeek)
            ? "unknown"
            : states[n.id],
        ]),
      ),
    [isMap, reveal, momentumPlaying, momentumWeek, states],
  );
  const display = useMemo(() => displayStates(visibleStates), [visibleStates]);
  displayRef.current = display;

  const masteredCount = NODES.filter(
    (n) => states[n.id] === "mastered",
  ).length;
  const masteryPct = Math.round((masteredCount / NODES.length) * 100);

  // Phase 1 — Plan derived surfaces: the goal's pace against the deadline, and
  // (when prioritizing) the critical path the map lights up.
  const paceReading = useMemo(
    () => computePace(goal.id, goal.label, states, form.target),
    [goal, states, form.target],
  );
  const goalPath = useMemo(
    () => (isMap && prioritize ? criticalPathTo(goal.id, states) : null),
    [isMap, prioritize, goal, states],
  );

  const selectedNode = NODES.find((n) => n.id === selectedId) ?? null;
  const selectedDisplayState: NodeState | null = selectedNode
    ? display[selectedNode.id]
    : null;

  // "Learn these first": a selected locked node highlights its unlearned
  // prerequisite chain on the canvas.
  const lockedPath = useMemo(
    () =>
      isMap && selectedId && display[selectedId] === "unknown"
        ? unmetPathOf(selectedId, states)
        : null,
    [isMap, selectedId, display, states],
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
          display={display}
          lockedPath={lockedPath}
          goalPath={goalPath}
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
          <TopBar query={query} onQuery={setQuery} onSurface={onSurface} />
          <LeftRail
            subject={form.topic.trim() || "Linear Algebra"}
            showDeadline={form.goal === "exam"}
            masteryPct={masteryPct}
            goalLabel={goal.label}
            pace={paceReading}
            prioritize={prioritize}
            momentumPlaying={momentumPlaying}
            momentumWeek={momentumWeek}
            onJumpFrontier={jumpFrontier}
            onTogglePrioritize={togglePrioritize}
            onToggleMomentum={toggleMomentum}
          />
          {selectedNode && selectedDisplayState && (
            <NodeDetail
              node={selectedNode}
              displayState={selectedDisplayState}
              display={display}
              onSelect={setSelectedId}
              onPrimaryAction={onPrimaryAction}
              onPhaseAction={onPhaseAction}
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

      {toast && <Toast message={toast} />}
    </div>
  );
}
