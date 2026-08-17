"use client";

// Pan, zoom and node drag for the map canvas — the view transform, the node
// positions it moves, and the window listeners that drive both. Split out of
// AtlasApp (Phase 2.1); everything it needs from the run arrives as arguments.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewTransform } from "@/components/map/MapCanvas";
import type { NodeState } from "@/lib/curriculum";

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  /** Set once the pointer has travelled far enough to be a drag rather than a
   *  click — a click selects, a drag never does. */
  moved: boolean;
}

interface PanState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function useCanvas(opts: {
  /** Selecting is the map's business, not the canvas's — a click lands here. */
  setSelectedId: (id: string | null) => void;
  /** Displayed (not stored) node states, for the locked-node nudge. */
  displayRef: React.RefObject<Record<string, NodeState>>;
  showToast: (message: string, kicker?: string) => void;
  /** Node positions live on the run — they are persisted, and a drag is an
   *  edit to the saved map, not to a view-local copy. The canvas moves them;
   *  it does not own them. */
  positionsRef: React.RefObject<Record<string, { x: number; y: number }>>;
  setPositions: React.Dispatch<
    React.SetStateAction<Record<string, { x: number; y: number }>>
  >;
}) {
  const { setSelectedId, displayRef, showToast, positionsRef, setPositions } = opts;

  const [view, setView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

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

  const onCanvasDown = useCallback(
    (e: React.MouseEvent) => {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: viewRef.current.x,
        originY: viewRef.current.y,
      };
      setSelectedId(null);
    },
    [setSelectedId],
  );

  const onNodeDown = useCallback(
    (e: React.MouseEvent, id: string) => {
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
    },
    [positionsRef],
  );

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
  }, [showToast, setSelectedId, displayRef, setPositions]);

  /** Put a node in the middle of the screen at a readable zoom. */
  const centerOn = useCallback(
    (id: string) => {
      const pos = positionsRef.current[id];
      if (!pos) return;
      const scale = 0.85;
      setView({
        x: window.innerWidth / 2 - pos.x * scale,
        y: window.innerHeight / 2 - pos.y * scale,
        scale,
      });
    },
    [positionsRef],
  );

  return {
    view,
    setView,
    viewRef,
    onWheel,
    onCanvasDown,
    onNodeDown,
    centerOn,
  };
}
