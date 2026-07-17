"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FORM,
  NODES,
  PHASES,
  displayStates,
  initialStates,
  nextGapFor,
  orderedFrontier,
  paceStatus,
  phaseIndex,
  seedGraph,
  spawnGap,
  unmetPathOf,
  type ConceptGraph,
  type ConceptNode,
  type GapSpec,
  type NodeState,
  type OnboardingForm,
  type StateMap,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas, { type ViewTransform } from "@/components/map/MapCanvas";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar, { type Surface } from "@/components/map/TopBar";
import Toast, { type ToastData } from "@/components/Toast";

type Screen = "welcome" | "building" | "diagnostic" | "map";

/** How long the map-assembly moment plays before the diagnostic opens. */
const BUILD_MS = 2600;
/** The momentum replay spans onboarding (week 0) plus three weeks of work. */
const MOMENTUM_WEEKS = 3;
/** A simulated Crucible re-attempt "runs" this long before writing back. */
const CRUCIBLE_MS = 1200;

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
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
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
      showToast(
        `Session · ${node.label} → Consume — marked Learning (the session spiral is the next milestone)`,
      );
    },
    [showToast],
  );

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
          showToast(`Resuming · ${node.label} → Feynman teach-back`);
          break;
        case "shaky":
          // The Crucible's write-back drives the re-plan: while the node
          // still has undiagnosed sub-concepts the attempt fails and splits
          // one out; once the well is dry, transfer succeeds and it lifts
          // to Mastered.
          showToast(`Re-attempting the Crucible for ${node.label}`);
          later(() => {
            const spec = spawnFailureGap(node.id);
            if (spec)
              showToast(
                `Crucible failed · added ${spec.label} under ${node.label} — ${spec.reason}`,
                "Map updated",
              );
            else {
              setStates((prev) => ({ ...prev, [node.id]: "mastered" }));
              showToast(
                `Transfer confirmed · ${node.label} is Mastered — it now feeds Review`,
              );
            }
          }, CRUCIBLE_MS);
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
    [enterSession, later, showToast, spawnFailureGap],
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
      const node = graphRef.current.nodes.find((n) => n.id === selectedId);
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
          <TopBar query={query} onQuery={setQuery} onSurface={onSurface} />
          <LeftRail
            subject={form.topic.trim() || "Linear Algebra"}
            goal={form.goal}
            pace={pace}
            nextUp={nextUp}
            masteryPct={masteryPct}
            momentumPlaying={momentumPlaying}
            momentumWeek={momentumWeek}
            onJumpFrontier={jumpFrontier}
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

      {toast && <Toast toast={toast} />}
    </div>
  );
}
