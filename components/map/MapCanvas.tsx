"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import NodeHoverCard, { useDwell, usePeek } from "@/components/map/NodeHoverCard";
import MapNode from "@/components/map/MapNode";
import MapEdges from "@/components/map/MapEdges";
import MapControls from "@/components/map/MapControls";
import { regionsOf, seedOf } from "@/components/map/atlasTerrain";
import { Fog, Land, StageLabels, Terrain } from "@/components/map/MapTerrain";
import { useBox, useTerritory } from "@/components/map/useMapPointer";
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
      "Concept map — scroll to zoom, drag to pan, click a territory to select it, double-click a lit one to begin",
  },
  "pt-BR": {
    gap: "lacuna",
    canvas:
      "Mapa de conceitos — role para dar zoom, arraste para mover, clique num território para selecioná-lo, dê dois cliques num aceso para começar",
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
  /** A press on the canvas: a pan, and a select if it lands on a territory
   *  and never moves. */
  onCanvasDown: (e: React.MouseEvent, id?: string) => void;
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
  insetLeft: number;
  insetRight: number;
  /** A sheet is over the map: nothing here is visible, so nothing paints. */
  covered?: boolean;
}

export default memo(MapCanvas, (a, b) =>
  // Every callback is read through `on` (the latest one, always), so a parent
  // re-creating its handlers each render — which AtlasApp does, ~15 times a
  // second while a reading streams — is not a reason to redraw the map.
  (Object.keys(b) as (keyof MapCanvasProps)[]).every(
    (k) => typeof b[k] === "function" || Object.is(a[k], b[k]),
  ),
);

function MapCanvas({
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
  insetLeft,
  insetRight,
  covered,
}: MapCanvasProps) {
  const t = useT(STRINGS);
  const elRef = useRef<HTMLDivElement | null>(null);
  const handlers = {
    onWheel,
    onCanvasDown,
    onNodeDown,
    onNodeSelect,
    onNodeDoubleClick,
    onNodeHover,
  };
  const on = useRef(handlers);
  on.current = handlers;
  const hover = useCallback((id: string | null) => on.current.onNodeHover(id), []);
  const land = useTerritory(elRef, view, screen === "map");

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => on.current.onWheel(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const highlighted = useMemo(
    () => (hoverId ? ancestorsOf(hoverId, edges) : null),
    [hoverId, edges],
  );

  const box = useBox(elRef);

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
  const peek = usePeek(peekId, view, box, {
    nodes,
    positions,
    display,
    edges,
    reviewedNodes,
    shakyReasons,
    phasesDone,
    consumeProgress,
  });

  const q = query.trim().toLowerCase();
  const ids = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const regions = useMemo(() => regionsOf(nodes, edges), [nodes, edges]);
  const seed = useMemo(() => seedOf(ids), [ids]);
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
    const insets = { left: insetLeft, right: insetRight, top: layout.topBar, bottom: 0 };
    onView(fitView(bounds, box, insets));
  }, [screen, bounds, box, insetLeft, insetRight, onView]);
  const clear = useCallback(
    (id: string) =>
      (display[id] ?? "unknown") !== "unknown" ||
      id === selectedId ||
      Boolean(lockedPath?.has(id) || highlighted?.has(id)) ||
      Boolean(
        q &&
        nodes
          .find((n) => n.id === id)
          ?.label.toLowerCase()
          .includes(q),
      ),
    [display, selectedId, lockedPath, highlighted, q, nodes],
  );

  // Everything inside the transformed layer, built once per change to the map
  // itself — not per pan frame. A pan re-renders only the transform, the
  // instruments and the peek; it used to re-render every node and road and
  // re-run the bakes' change checks (JSON over the whole map) each frame.
  const chart = useMemo(
    () => (
      <>
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
                region={regions.of}
                names={regions.name}
                seed={seed}
                bounds={bounds}
                frozen={dragging}
                territory={land.territory}
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
                onHover={hover}
              />
            </svg>
            {screen === "map" && (
              <Fog
                ids={ids}
                positions={positions}
                clear={clear}
                bounds={bounds}
                frozen={dragging}
              />
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
            capital={node.id in regions.name}
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
            onSelect={() => on.current.onNodeSelect(node.id)}
            onDown={(e) => {
              // A node's press stops propagating (it starts a drag, not a
              // pan), so the card is closed from here too.
              setDragging(true);
              on.current.onNodeDown(e, node.id);
            }}
            onOpen={() => on.current.onNodeDoubleClick(node.id)}
            onHover={(v) => hover(v ? node.id : null)}
          />
        ))}
      </>
    ),
    // prettier-ignore
    [bounds, stages, building, ids, edges, positions, display, regions, seed, dragging, highlighted, lockedPath, hover, screen, clear, nodes, staggered, spawnedIds, selectedId, q, won, t.gap, land.territory],
  );

  return (
    <div
      ref={elRef}
      data-testid="map-canvas"
      role="application"
      aria-label={t.canvas}
      data-dragging={dragging || undefined}
      data-covered={covered || undefined}
      onMouseDown={(e) => {
        setDragging(true);
        on.current.onCanvasDown(e, land.at(e));
      }}
      onDoubleClick={(e) => {
        const id = land.at(e); // a city's own double-click already opened it
        if (id && !(e.target as Element).closest("[data-testid^='node-']"))
          on.current.onNodeDoubleClick(id);
      }}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "grab",
        background: color.paper,
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
        {chart}
      </div>

      {/* Outside the transformed layer on purpose: the card and the
          instruments are chrome, so they keep their own type size and shadow
          at every zoom level. */}
      {/* The sheet's grain, foxing and darkened edges, laid over the chart and
          fixed to the window like the paper it is printed on: a static layer
          that no pan repaints, with no blend mode for Safari to re-run. */}
      <div
        aria-hidden
        className="at-paper"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundColor: "transparent",
        }}
      />
      <NodeHoverCard shown={peek} />
      {screen === "map" && box.w > 0 && (
        <MapControls
          ids={ids}
          edges={edges}
          positions={positions}
          display={display}
          view={view}
          box={box}
          insets={{ left: insetLeft, right: insetRight, top: layout.topBar, bottom: 0 }}
          onView={onView}
        />
      )}
    </div>
  );
}
