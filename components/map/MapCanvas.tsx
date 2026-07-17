"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  EDGES,
  NODES,
  STATE_COLOR,
  ancestorsOf,
  type NodeState,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

/** Amber used for the "learn these first" path (the frontier glow color). */
const PATH_COLOR = "#c99a2e";
/** Green used for the goal-conditioned critical path (Phase 1 — Plan). */
const GOAL_COLOR = "#2f6b4f";

interface MapCanvasProps {
  screen: "map" | "building" | "diagnostic";
  /** Display state per node id — frontier/locking already derived. */
  display: Record<string, NodeState>;
  /** Unlearned prerequisite chain of a selected locked node ("learn these first"). */
  lockedPath: Set<string> | null;
  /** Critical path to the goal when Plan's prioritize toggle is on. */
  goalPath: Set<string> | null;
  positions: Record<string, { x: number; y: number }>;
  view: ViewTransform;
  selectedId: string | null;
  hoverId: string | null;
  query: string;
  onWheel: (e: WheelEvent) => void;
  onCanvasDown: (e: React.MouseEvent) => void;
  onNodeDown: (e: React.MouseEvent, id: string) => void;
  onNodeDoubleClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
}

export default function MapCanvas({
  screen,
  display,
  lockedPath,
  goalPath,
  positions,
  view,
  selectedId,
  hoverId,
  query,
  onWheel,
  onCanvasDown,
  onNodeDown,
  onNodeDoubleClick,
  onNodeHover,
}: MapCanvasProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const highlighted = useMemo(
    () => (hoverId ? ancestorsOf(hoverId, EDGES) : null),
    [hoverId],
  );

  const q = query.trim().toLowerCase();

  return (
    <div
      ref={elRef}
      onMouseDown={onCanvasDown}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "grab",
        background: color.paper,
        backgroundImage: "radial-gradient(rgba(44,40,35,0.05) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
          willChange: "transform",
        }}
      >
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            overflow: "visible",
            pointerEvents: "none",
          }}
          width={2000}
          height={860}
        >
          {EDGES.map(([a, b, dashed], i) => {
            const pa = positions[a];
            const pb = positions[b];
            if (!pa || !pb) return null;
            const hoverLit = highlighted?.has(a) && highlighted?.has(b);
            const pathLit = lockedPath?.has(a) && lockedPath?.has(b);
            const goalLit = goalPath?.has(a) && goalPath?.has(b);
            return (
              <g key={i}>
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={
                    dashed
                      ? "rgba(193,87,74,0.5)"
                      : hoverLit
                        ? color.accent
                        : pathLit
                          ? PATH_COLOR
                          : goalLit
                            ? GOAL_COLOR
                            : "rgba(44,40,35,0.16)"
                  }
                  strokeWidth={hoverLit || pathLit || goalLit ? 2 : 1.2}
                  strokeDasharray={dashed ? "5 6" : "0"}
                  strokeLinecap="round"
                />
                {/* Invisible hit area: hovering an edge highlights the
                    prerequisite chain of its dependent end. */}
                <line
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onMouseEnter={() => onNodeHover(b)}
                  onMouseLeave={() => onNodeHover(null)}
                />
              </g>
            );
          })}
        </svg>

        {NODES.map((node, i) => {
          const pos = positions[node.id];
          const displayState = display[node.id] ?? "unknown";
          const dotColor = STATE_COLOR[displayState];
          const isFrontier = displayState === "frontier";
          const isSelected = selectedId === node.id;
          const onPath = Boolean(lockedPath?.has(node.id)) && !isSelected;
          const onGoalPath = Boolean(goalPath?.has(node.id)) && !isSelected;
          // With Plan's prioritize on, concepts off the goal's critical path
          // recede so the route to the goal reads at a glance.
          const offGoal =
            Boolean(goalPath) && !goalPath!.has(node.id) && !isSelected;
          const matches = !q || node.label.toLowerCase().includes(q);
          // A node left unknown after derivation is locked by definition;
          // keep the assemble moment uniform while the map is building.
          const dimmedLock = displayState === "unknown" && screen !== "building";
          const baseOpacity =
            dimmedLock && !onPath && !onGoalPath && !isSelected
              ? 0.5
              : matches
                ? 1
                : 0.26;
          const nodeOpacity = offGoal ? Math.min(baseOpacity, 0.32) : baseOpacity;
          const animation =
            screen === "building"
              ? `assemble 0.5s ${(0.04 * i).toFixed(2)}s both`
              : isFrontier
                ? "pulseGlow 2.8s ease-in-out infinite"
                : "none";

          return (
            <div
              key={node.id}
              onMouseDown={(e) => onNodeDown(e, node.id)}
              onDoubleClick={() => onNodeDoubleClick(node.id)}
              onMouseEnter={() => onNodeHover(node.id)}
              onMouseLeave={() => onNodeHover(null)}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%,-50%)",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 15px",
                background: color.card,
                border: `1px solid ${
                  isSelected
                    ? color.accent
                    : onPath
                      ? "rgba(201,154,46,0.75)"
                      : onGoalPath && !isFrontier
                        ? "rgba(47,107,79,0.65)"
                        : isFrontier
                          ? "rgba(201,154,46,0.5)"
                          : color.hairlineStrong
                }`,
                borderStyle: dimmedLock ? "dashed" : "solid",
                borderRadius: 12,
                whiteSpace: "nowrap",
                cursor: "pointer",
                userSelect: "none",
                fontFamily: font.serif,
                fontSize: 15,
                color: color.ink,
                opacity: nodeOpacity,
                boxShadow: isFrontier
                  ? "0 0 0 1px rgba(201,154,46,0.5), 0 6px 22px rgba(201,154,46,0.26)"
                  : isSelected
                    ? "0 10px 26px rgba(47,107,79,0.2)"
                    : onPath
                      ? "0 0 0 1px rgba(201,154,46,0.45), 0 4px 14px rgba(201,154,46,0.18)"
                      : onGoalPath
                        ? "0 0 0 1px rgba(47,107,79,0.4), 0 4px 14px rgba(47,107,79,0.16)"
                        : "0 2px 7px rgba(44,40,35,0.06)",
                animation,
                transition: "border-color .2s, opacity .25s, box-shadow .2s",
                zIndex: isSelected ? 6 : isFrontier ? 4 : onGoalPath ? 3 : 2,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: dotColor,
                  flex: "0 0 auto",
                  boxShadow: isFrontier ? `0 0 8px ${dotColor}` : "none",
                }}
              />
              <span>{node.label}</span>
              {displayState === "gap" && (
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 9.5,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#c1574a",
                    border: "1px solid rgba(193,87,74,0.4)",
                    borderRadius: 5,
                    padding: "1px 5px",
                    marginLeft: 2,
                  }}
                >
                  gap
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
