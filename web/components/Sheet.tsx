"use client";

import type { CSSProperties, ReactNode } from "react";
import { color, font } from "@/lib/theme";

/**
 * A full-screen surface over the map: every session phase, the review queue,
 * the calibration read-out, settings — a leaf of the atlas laid over the
 * chart. It has no motion of its own: arriving and leaving is the screen crossfade
 * (`usePageTurn`), which animates snapshots of both pages on the compositor.
 */
export default function Sheet({
  style,
  children,
  ...rest
}: {
  style?: CSSProperties;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "children">) {
  return (
    <div
      // Every surface this shell renders sits over the map and takes the whole
      // screen, so the modal semantics belong here rather than being restated
      // (or forgotten) at each call site. The name comes from the call site —
      // only it knows which phase this is.
      role="dialog"
      aria-modal="true"
      className="at-paper"
      {...rest}
      style={{
        position: "absolute",
        inset: 0,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.serif,
        fontSize: 16,
        zIndex: 30,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
