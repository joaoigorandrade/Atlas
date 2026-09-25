"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ancestorsOf,
  type ConceptEdge,
  type ConceptNode,
  type ConsumeProgress,
  type NodeState,
  type PhasesDoneMap,
  type ShakyReason,
} from "@/lib/curriculum";
import { color, layout } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import NodeHoverCard, { useDwell } from "@/components/map/NodeHoverCard";
import MapNode, { SEAL } from "@/components/map/MapNode";
import MapEdges from "@/components/map/MapEdges";
import MapControls from "@/components/map/MapControls";
import { Fog, Land, StageLabels, Terrain } from "@/components/map/MapTerrain";
import {
  fitView,
  mapBounds,
  stageBands,
  type ViewTransform,
} from "@/components/map/mapGeometry";

export type { ViewTransform } from "@/components/map/mapGeometry";
export { CELEBRATE_MS } from "@/components/map/MapNode";

const STRINGS = {
  en: {
    gap: "gap",
    canvas:
      "Concept map — scroll to zoom, drag to pan, double-click a lit concept to begin",
  },
  "pt-BR": {
    gap: "lacuna",
    canvas:
      "Mapa de conceitos — role para dar zoom, arraste para mover, dê dois cliques num conceito aceso para começar",
  },
} as const;

const layer = {
  position: "absolute",
  left: 0,
  top: 0,
  overflow: "visible",
  pointerEvents: "none",
  willChange: "transform",
} as const;

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
  /** Nodes whose mastery state the learner just earned, marked for as long as
   *  `CELEBRATE_MS`. Owned by AtlasApp: this component unmounts for the whole
   *  session, so it cannot be the thing that remembers what changed. */
  earned?: Record<string, NodeState>;
  positions: Record<string, { x: number; y: number }>;
  view: ViewTransform;
  selectedId: string | null;
  hoverId: string | null;
  /** Read by the hover peek — how far into each node's reading pass the
   *  learner got, which review history exists, and how a node went shaky.
   *  All three are what the detail rail says about a *selected* node; the
   *  peek says them about a hovered one. */
  consumeProgress?: Record<string, ConsumeProgress>;
  reviewedNodes?: string[];
  shakyReasons?: Record<string, ShakyReason>;
  /** Which phases each node has finished — the peek's "next" line derives
   *  from it, same as the rail's. */
  phasesDone?: PhasesDoneMap;
  query: string;
  onWheel: (e: WheelEvent) => void;
  onCanvasDown: (e: React.MouseEvent) => void;
  onNodeDown: (e: React.MouseEvent, id: string) => void;
  /** Keyboard select — the pointer path goes through `onNodeDown`, which also
   *  starts a drag and so needs a real mouse event. */
  onNodeSelect: (id: string) => void;
  onNodeDoubleClick: (id: string) => void;
  onNodeHover: (id: string | null) => void;
  /** The instruments move the view directly — zoom, frame, overview. */
  onView: (view: ViewTransform) => void;
  /** The rails over each side of the canvas right now; the instruments sit
   *  clear of them, and framing centres in what is left. */
  insets: { left: number; right: number };
}

export default function MapCanvas({
  screen,
  nodes,
  edges,
  spawnedIds,
  staggered = false,
  display,
  lockedPath,
  earned: won = {},
  positions,
  view,
  selectedId,
  hoverId,
  consumeProgress,
  reviewedNodes,
  shakyReasons,
  phasesDone,
  query,
  onWheel,
  onCanvasDown,
  onNodeDown,
  onNodeSelect,
  onNodeDoubleClick,
  onNodeHover,
  onView,
  insets,
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

  // The peek needs the canvas box to know whether a card fits below the node
  // it describes, or has to open upward.
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dragging a node and panning the canvas both start with a press. A card
  // parked next to the cursor through either is in the way, so the press
  // closes it and the release re-arms the dwell.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragging]);

  // Only on the map: while the map is building, nodes are still arriving and
  // a card over one would be describing a state nobody has acted on yet.
  const peekId = useDwell(
    screen === "map" && !dragging && hoverId !== selectedId ? hoverId : null,
  );
  const peek = useMemo(() => {
    const node = peekId ? nodes.find((n) => n.id === peekId) : null;
    const pos = node ? positions[node.id] : null;
    if (!node || !pos || !box.h) return null;
    const x = view.x + pos.x * view.scale;
    const y = view.y + pos.y * view.scale;
    // The seal and the name under it, scaled — the card clears both.
    const reach = (SEAL / 2 + 26) * view.scale;
    return {
      node,
      displayState: display[node.id] ?? "unknown",
      display,
      edges,
      reviewed: reviewedNodes?.includes(node.id) ?? false,
      phasesDone: phasesDone?.[node.id],
      shakyReason: shakyReasons?.[node.id],
      consumeProgress: consumeProgress?.[node.id],
      // Kept inside the canvas so a node near an edge doesn't push its card
      // off-screen.
      x: Math.min(
        Math.max(x, CARD_HALF + 8),
        Math.max(box.w - CARD_HALF - 8, CARD_HALF + 8),
      ),
      y,
      reach,
      above: y + reach + CARD_CLEARANCE > box.h,
    };
  }, [
    peekId,
    nodes,
    positions,
    view,
    display,
    edges,
    reviewedNodes,
    shakyReasons,
    phasesDone,
    consumeProgress,
    box,
  ]);

  const q = query.trim().toLowerCase();
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const bounds = useMemo(() => mapBounds(positions, ids), [positions, ids]);
  const stages = useMemo(() => stageBands(nodes, positions), [nodes, positions]);
  const building = screen === "building";

  // Frame the whole map the first time it is on screen — a reload used to open
  // on a fixed corner of it, half under the plan rail. Opening a fresh map
  // still lands on its lit node: onboarding's `centerOn` runs after this.
  const framed = useRef(false);
  useEffect(() => {
    if (screen !== "map" || !bounds || !box.w || framed.current) return;
    framed.current = true;
    onView(fitView(bounds, box, { ...insets, top: layout.topBar, bottom: 0 }));
  }, [screen, bounds, box, insets, onView]);
  const clear = (id: string) =>
    (display[id] ?? "unknown") !== "unknown" ||
    id === selectedId ||
    Boolean(lockedPath?.has(id) || highlighted?.has(id)) ||
    Boolean(
      q &&
      nodes
        .find((n) => n.id === id)
        ?.label.toLowerCase()
        .includes(q),
    );

  return (
    <div
      ref={elRef}
      data-testid="map-canvas"
      role="application"
      aria-label={t.canvas}
      onMouseDown={(e) => {
        setDragging(true);
        onCanvasDown(e);
      }}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "grab",
        background: color.paper,
        // A vignette, fixed to the window rather than the map: the paper
        // darkens toward its edges the way an old sheet does.
        backgroundImage:
          "radial-gradient(ellipse at 55% 45%, transparent 55%, rgba(44,40,35,0.07) 100%)",
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
        {/* The land and the fog are baked into bitmaps (see `Baked`); only
            the strokes and the labels are live SVG. */}
        {bounds && (
          <>
            <svg style={layer} width={1} height={1}>
              <Terrain bounds={bounds} stages={stages} />
            </svg>
            {!building && (
              <Land
                ids={ids}
                edges={edges}
                positions={positions}
                display={display}
                bounds={bounds}
              />
            )}
            <svg style={layer} width={1} height={1}>
              <MapEdges
                edges={edges}
                positions={positions}
                display={display}
                highlighted={highlighted}
                lockedPath={lockedPath}
                building={building}
                onHover={onNodeHover}
              />
            </svg>
            {screen === "map" && (
              <Fog ids={ids} positions={positions} clear={clear} bounds={bounds} />
            )}
            <svg style={layer} width={1} height={1}>
              <StageLabels bounds={bounds} stages={stages} />
            </svg>
          </>
        )}

        {nodes.map((node, i) => (
          <MapNode
            key={node.id}
            node={node}
            pos={positions[node.id]}
            state={display[node.id] ?? "unknown"}
            done={phasesDone?.[node.id]}
            arrival={
              building
                ? `assemble 0.5s ${staggered ? (0.04 * i).toFixed(2) : "0"}s both`
                : spawnedIds.has(node.id)
                  ? "assemble 0.45s both"
                  : "none"
            }
            building={building}
            selected={selectedId === node.id}
            onPath={Boolean(lockedPath?.has(node.id)) && selectedId !== node.id}
            matches={!q || node.label.toLowerCase().includes(q)}
            earned={won[node.id]}
            gapLabel={t.gap}
            onSelect={() => onNodeSelect(node.id)}
            onDown={(e) => {
              // A node's press stops propagating (it starts a drag, not a
              // pan), so the card is closed from here too.
              setDragging(true);
              onNodeDown(e, node.id);
            }}
            onOpen={() => onNodeDoubleClick(node.id)}
            onHover={(on) => onNodeHover(on ? node.id : null)}
          />
        ))}
      </div>

      {/* Outside the transformed layer on purpose: the card and the
          instruments are chrome, so they keep their own type size and shadow
          at every zoom level. */}
      <NodeHoverCard shown={peek} />
      {screen === "map" && box.w > 0 && (
        <MapControls
          ids={ids}
          edges={edges}
          positions={positions}
          display={display}
          view={view}
          box={box}
          insets={{ ...insets, top: layout.topBar, bottom: 0 }}
          onView={onView}
        />
      )}
    </div>
  );
}

/** Half the peek card's width, and how much room it needs below a node. */
const CARD_HALF = 136;
const CARD_CLEARANCE = 190;
