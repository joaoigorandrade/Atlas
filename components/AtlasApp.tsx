"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_FORM,
  NODES,
  type ConceptNode,
  type NodeState,
  type OnboardingForm,
} from "@/lib/curriculum";
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
const FRONTIER_START = "basis";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => Object.fromEntries(NODES.map((n) => [n.id, { x: n.x, y: n.y }])));
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  const viewRef = useRef(view);
  viewRef.current = view;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

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

  const startMap = useCallback(() => {
    setScreen("map");
    setSelectedId(FRONTIER_START);
    later(() => centerOn(FRONTIER_START), 30);
    later(
      () =>
        showToast(
          "Map updated · added 2 sub-concepts under Linear Independence — you keep missing base cases",
        ),
      BUILD_MS,
    );
  }, [centerOn, later, showToast]);

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
      if (drag && !drag.moved) setSelectedId(drag.id);
      dragRef.current = null;
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ---- map actions ------------------------------------------------------

  const enterSession = useCallback(
    (node: ConceptNode) => {
      showToast(
        `Session · ${node.label} → Consume — the session spiral is the next milestone`,
      );
    },
    [showToast],
  );

  const onNodeDoubleClick = useCallback(
    (id: string) => {
      const node = NODES.find((n) => n.id === id);
      if (!node) return;
      if (node.state === "frontier") enterSession(node);
      else if (node.locked) showToast("Locked — clear its prerequisites first");
      else setSelectedId(id);
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

  const onSurface = useCallback(
    (surface: Surface) => {
      if (surface === "map") return;
      if (surface === "review") {
        showToast("Review · opening today's queue — ~8 min, 14 cards due");
        return;
      }
      const node = NODES.find((n) => n.id === selectedId);
      if (node && node.state === "frontier") enterSession(node);
      else if (node && node.state === "learning")
        showToast(`Session · resuming ${node.label} → Feynman`);
      else showToast("Session · double-click a glowing frontier node to begin");
    },
    [enterSession, selectedId, showToast],
  );

  const jumpFrontier = useCallback(() => {
    setSelectedId(FRONTIER_START);
    centerOn(FRONTIER_START);
  }, [centerOn]);

  const toggleMomentum = useCallback(() => {
    if (momentumPlaying) {
      if (momentumRef.current) clearInterval(momentumRef.current);
      setMomentumPlaying(false);
      setReveal(3);
      return;
    }
    setMomentumPlaying(true);
    setReveal(0);
    setMomentumWeek(1);
    momentumRef.current = setInterval(() => {
      setReveal((prev) => {
        const next = Math.min(3, prev + 1);
        if (next >= 3 && momentumRef.current) clearInterval(momentumRef.current);
        return next;
      });
      setMomentumWeek((prev) => Math.min(3, prev + 1));
    }, 1000);
  }, [momentumPlaying]);

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  const showCanvas = screen !== "welcome";
  // Reveal depth: the map always shows true state unless the momentum
  // replay is running; onboarding stages reveal as the diagnostic answers.
  const eff = isMap && !momentumPlaying ? 3 : reveal;

  const masteredCount = NODES.filter((n) => n.state === "mastered").length;
  const masteryPct = Math.round((masteredCount / NODES.length) * 100);

  const selectedNode = NODES.find((n) => n.id === selectedId) ?? null;
  const selectedDisplayState: NodeState | null = selectedNode
    ? selectedNode.g <= 3
      ? selectedNode.state
      : "unknown"
    : null;

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
          eff={eff}
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
            momentumPlaying={momentumPlaying}
            momentumWeek={momentumWeek}
            onJumpFrontier={jumpFrontier}
            onToggleMomentum={toggleMomentum}
          />
          {selectedNode && selectedDisplayState && (
            <NodeDetail
              node={selectedNode}
              displayState={selectedDisplayState}
              onSelect={setSelectedId}
              onPrimaryAction={onPrimaryAction}
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
