"use client";

// Pan, zoom and node drag for the map canvas — the view transform, the node
// positions it moves, and the window listeners that drive both. Split out of
// AtlasApp (Phase 2.1); everything it needs from the run arrives as arguments.

import { useCallback, useEffect, useRef, useState } from "react";
import { layout } from "@/lib/theme";
import { zoomAt, type ViewTransform } from "@/components/map/mapGeometry";
import type { NodeState } from "@/lib/curriculum";
import { useLanguage } from "@/lib/i18n";
import { TOAST_STRINGS } from "@/lib/toastCopy";

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
  const { language } = useLanguage();

  const [view, commitView] = useState<ViewTransform>({ x: 40, y: 30, scale: 0.72 });

  // The view moves on every pointer event of a pan or a wheel, and a mouse can
  // fire several of those a frame; each used to be a full render of the app.
  // The ref takes every step at once (so wheel deltas compound correctly) and
  // React sees at most one commit per frame.
  const viewRef = useRef(view);
  const frame = useRef(0);
  const setView = useCallback((next: React.SetStateAction<ViewTransform>) => {
    viewRef.current = typeof next === "function" ? next(viewRef.current) : next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      commitView(viewRef.current);
    });
  }, []);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      setView(zoomAt(viewRef.current, e.deltaY < 0 ? 1.08 : 0.926, e.clientX, e.clientY));
    },
    [setView],
  );

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
          showToast(TOAST_STRINGS[language].locked);
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
  }, [showToast, setSelectedId, displayRef, setPositions, language, setView]);

  /** Put a node in the middle of the screen at a readable zoom. */
  /**
   * Bring a node into view — into the *free* band, not the middle of the
   * window. The plan rail (262) and the node detail (356) are opaque and
   * always up above 1280, so centring on `innerWidth / 2` parked the node the
   * learner had just selected underneath one of them; the lit node of a fresh
   * map opened behind the rail every time.
   */
  const centerOn = useCallback(
    (id: string) => {
      const pos = positionsRef.current[id];
      if (!pos) return;
      const scale = 0.85;
      const { innerWidth: w, innerHeight: h } = window;
      const rails = w >= layout.railsMin;
      const free = w - layout.leftRail - layout.nodePanel;
      const cx = rails ? layout.leftRail + free / 2 : w / 2;
      setView({
        x: cx - pos.x * scale,
        y: layout.topBar + (h - layout.topBar) / 2 - pos.y * scale,
        scale,
      });
    },
    [positionsRef, setView],
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
