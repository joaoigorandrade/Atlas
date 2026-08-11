"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  STATE_COLOR,
  ancestorsOf,
  type ConceptEdge,
  type ConceptNode,
  type NodeState,
} from "@/lib/curriculum";
import { color, font, transition } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: { gap: "gap" },
  "pt-BR": { gap: "lacuna" },
} as const;

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

/** Amber used for the "learn these first" path (the frontier glow color). */
const PATH_COLOR = "#c99a2e";

interface MapCanvasProps {
  screen: "map" | "building" | "diagnostic";
  /** The live graph — re-planning spawns nodes into it mid-session. */
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  /** Nodes the re-planner just spawned — they assemble into place. */
  spawnedIds: Set<string>;
  /** Stagger the assembly animation by index, rather than letting arrival be
   *  the stagger. True only for the placeholder territory: the real map streams
   *  in a concept at a time, and a node that has *already arrived* must not sit
   *  invisible waiting for its turn. */
  staggered?: boolean;
  /** Display state per node id — frontier/locking already derived. */
  display: Record<string, NodeState>;
  /** Unlearned prerequisite chain of a selected locked node ("learn these first"). */
  lockedPath: Set<string> | null;
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
  nodes,
  edges,
  spawnedIds,
  staggered = false,
  display,
  lockedPath,
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
  const t = useT(STRINGS);
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
    () => (hoverId ? ancestorsOf(hoverId, edges) : null),
    [hoverId, edges],
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
          {edges.map(([a, b, dashed], i) => {
            const pa = positions[a];
            const pb = positions[b];
            if (!pa || !pb) return null;
            const hoverLit = highlighted?.has(a) && highlighted?.has(b);
            const pathLit = lockedPath?.has(a) && lockedPath?.has(b);
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
                          : "rgba(44,40,35,0.16)"
                  }
                  strokeWidth={hoverLit || pathLit ? 2 : 1.2}
                  strokeDasharray={dashed ? "5 6" : "0"}
                  strokeLinecap="round"
                  style={{ transition: transition(["stroke", "stroke-width"], "fast") }}
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

        {nodes.map((node, i) => {
          const pos = positions[node.id];
          const displayState = display[node.id] ?? "unknown";
          const dotColor = STATE_COLOR[displayState];
          const isFrontier = displayState === "frontier";
          const isSelected = selectedId === node.id;
          const onPath = Boolean(lockedPath?.has(node.id)) && !isSelected;
          const matches = !q || node.label.toLowerCase().includes(q);
          // A node left unknown after derivation is locked by definition;
          // keep the assemble moment uniform while the map is building.
          const dimmedLock = displayState === "unknown" && screen !== "building";
          // Split across the two layers on purpose. `assemble` animates
          // `transform`, so it has to sit on the positioner — the layer whose
          // `translate(-50%,-50%)` it bakes in. If it ran on the chip its
          // `both` fill would pin `transform: scale(1)` forever and the
          // `.at-lift` hover could never take effect. `pulseGlow` animates
          // box-shadow only, so it is safe on the chip.
          const arrival =
            screen === "building"
              ? `assemble 0.5s ${staggered ? (0.04 * i).toFixed(2) : "0"}s both`
              : spawnedIds.has(node.id)
                ? "assemble 0.45s both"
                : "none";

          return (
            // Positioner. Owns `left`/`top` and the centring transform, so the
            // chip inside is free to use `transform` for hover — the two must
            // not share a property or the class and the inline style collide.
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%,-50%)",
                zIndex: isSelected ? 6 : isFrontier ? 4 : 2,
                // While building, `left`/`top` are transitioned: streamed
                // concepts are placed with a provisional vertical offset (a
                // column can't be centred until its height is known), and the
                // settling pass at the end of the stream moves them. Only while
                // building — dragging a node on the real map must track the
                // cursor exactly.
                transition:
                  screen === "building"
                    ? transition(["left", "top"], "slow", "enter")
                    : undefined,
                animation: arrival,
              }}
            >
              <div
                className="at-lift"
                onMouseDown={(e) => onNodeDown(e, node.id)}
                onDoubleClick={() => onNodeDoubleClick(node.id)}
                onMouseEnter={() => onNodeHover(node.id)}
                onMouseLeave={() => onNodeHover(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 15px",
                  background: color.card,
                  // One shorthand, not `border` plus a `borderStyle` override:
                  // mixing them makes React rewrite the style during render and
                  // warn on every node, every render.
                  border: `1px ${dimmedLock ? "dashed" : "solid"} ${
                    isSelected
                      ? color.accent
                      : onPath
                        ? "rgba(201,154,46,0.75)"
                        : isFrontier
                          ? "rgba(201,154,46,0.5)"
                          : color.hairlineStrong
                  }`,
                  borderRadius: 12,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  userSelect: "none",
                  fontFamily: font.serif,
                  fontSize: 15,
                  color: color.ink,
                  opacity:
                    dimmedLock && !onPath && !isSelected ? 0.5 : matches ? 1 : 0.26,
                  boxShadow: isFrontier
                    ? "0 0 0 1px rgba(201,154,46,0.5), 0 6px 22px rgba(201,154,46,0.26)"
                    : isSelected
                      ? "0 10px 26px rgba(47,107,79,0.2)"
                      : onPath
                        ? "0 0 0 1px rgba(201,154,46,0.45), 0 4px 14px rgba(201,154,46,0.18)"
                        : "0 2px 7px rgba(44,40,35,0.06)",
                  animation: isFrontier
                    ? "pulseGlow 2.8s ease-in-out infinite"
                    : "none",
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
                    // A node changing state is the point of the whole product;
                    // let the colour arrive rather than snap.
                    transition: transition(["background", "box-shadow"], "slow"),
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
                    {t.gap}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
