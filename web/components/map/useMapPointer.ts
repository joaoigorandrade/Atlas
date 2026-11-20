"use client";

// The map canvas as an element under the pointer: how big it is, and which
// concept's territory a press on it lands in.

import { useEffect, useRef, useState } from "react";
import type { Pt, ViewTransform } from "@/components/map/mapGeometry";

/** Which concept's territory lies under a map point, if any. */
export type Territory = (p: Pt) => string | undefined;

/** The element's size, kept current. The peek needs it to know whether a card
 *  fits below the node it describes, or has to open upward. */
export function useBox(el: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [el]);
  return box;
}

/**
 * The territory under a pointer on the canvas `el`, whose layer is moved by
 * `view` — resolved against the last bake `Land` wrote into `territory`.
 */
export function useTerritory(
  el: React.RefObject<HTMLElement | null>,
  view: ViewTransform,
  live: boolean,
) {
  const territory = useRef<Territory | null>(null);
  const now = useRef(view);
  now.current = view;
  const at = (e: React.MouseEvent) => {
    const rect = el.current?.getBoundingClientRect();
    const v = now.current;
    if (!rect || !live) return undefined;
    return territory.current?.({
      x: (e.clientX - rect.left - v.x) / v.scale,
      y: (e.clientY - rect.top - v.y) / v.scale,
    });
  };
  return { territory, at };
}
