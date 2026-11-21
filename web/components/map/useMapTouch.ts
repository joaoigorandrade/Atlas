"use client";

// The map under a finger: one finger pans, two pinch-zoom around their
// midpoint, a tap selects (or clears) and a second tap on the same place opens.
// The mouse path in `useCanvas` stays as it is — these listeners call
// `preventDefault`, so a touch never turns into the emulated mouse events that
// path would read as a node drag, and the page itself never zooms instead.

import { useEffect, useRef } from "react";
import { zoomAt, type Pt, type ViewTransform } from "@/components/map/mapGeometry";

interface TouchOpts {
  view: ViewTransform;
  onView: (view: ViewTransform) => void;
  /** The canvas's latest handlers: `onTap` gets the concept under a tap (null
   *  for open ground), `onNodeDoubleClick` a double tap on a concept. */
  handlers: React.RefObject<{
    onTap: (id: string | null) => void;
    onNodeDoubleClick: (id: string) => void;
  }>;
  /** The territory under a screen point (`useTerritory`'s `at`). */
  at: (p: { clientX: number; clientY: number }) => string | undefined;
}

type Gesture =
  | {
      kind: "pan";
      start: Pt;
      v0: ViewTransform;
      moved: boolean;
      target: EventTarget | null;
    }
  | { kind: "pinch"; d0: number; m0: Pt; v0: ViewTransform };

/** How far a finger may wander and still be a tap. */
const SLOP = 8;
const DOUBLE_TAP_MS = 320;

const mid = (a: Touch, b: Touch): Pt => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});
const dist = (a: Touch, b: Touch) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;

/** The concept a touch landed on: its seal, else its territory. */
function idAt(target: EventTarget | null, p: Pt, at: TouchOpts["at"]) {
  const seal =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-testid^='node-']")
      : null;
  return (
    seal?.dataset.testid?.slice("node-".length) ?? at({ clientX: p.x, clientY: p.y })
  );
}

export function useMapTouch(el: React.RefObject<HTMLElement | null>, opts: TouchOpts) {
  const on = useRef(opts);
  on.current = opts;

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let g: Gesture | null = null;
    let lastTap = { id: "", at: 0 };

    const begin = (e: TouchEvent, moved: boolean) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      const v0 = on.current.view;
      g = b
        ? { kind: "pinch", d0: dist(a, b), m0: mid(a, b), v0 }
        : {
            kind: "pan",
            start: { x: a.clientX, y: a.clientY },
            v0,
            moved,
            target: e.target,
          };
    };
    const start = (e: TouchEvent) => {
      e.preventDefault();
      // A second finger turns a pan into a pinch; it is never a tap after that.
      begin(e, false);
    };
    const move = (e: TouchEvent) => {
      e.preventDefault();
      if (!g) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      if (g.kind === "pan" && a) {
        const dx = a.clientX - g.start.x;
        const dy = a.clientY - g.start.y;
        if (!g.moved && Math.abs(dx) + Math.abs(dy) <= SLOP) return;
        g.moved = true;
        on.current.onView({ ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy });
      } else if (g.kind === "pinch" && a && b) {
        const m = mid(a, b);
        const z = zoomAt(g.v0, dist(a, b) / g.d0, g.m0.x, g.m0.y);
        on.current.onView({ ...z, x: z.x + m.x - g.m0.x, y: z.y + m.y - g.m0.y });
      }
    };
    const end = (e: TouchEvent) => {
      e.preventDefault();
      const done = g;
      // Lifting one finger of a pinch leaves a pan, picked up where it is.
      if (e.touches.length) return begin(e, true);
      g = null;
      if (done?.kind !== "pan" || done.moved) return;
      const id = idAt(done.target, done.start, on.current.at) ?? null;
      const now = performance.now();
      if (id && lastTap.id === id && now - lastTap.at < DOUBLE_TAP_MS) {
        lastTap = { id: "", at: 0 };
        return on.current.handlers.current.onNodeDoubleClick(id);
      }
      lastTap = { id: id ?? "", at: now };
      on.current.handlers.current.onTap(id);
    };
    const cancel = () => {
      g = null;
    };

    node.addEventListener("touchstart", start, { passive: false });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end, { passive: false });
    node.addEventListener("touchcancel", cancel);
    return () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", cancel);
    };
  }, [el]);
}
