"use client";

import type { CSSProperties, ReactNode } from "react";
import { color, font, motion } from "@/lib/theme";
import type { PresenceState } from "@/lib/motion";

export const SHEET_EXIT_MS = motion.duration.base;

/**
 * A full-screen surface over the map: every session phase, the review queue,
 * the calibration read-out, settings.
 *
 * All eight of them had this exact root copy-pasted, down to the byte, each
 * fading in on `softIn` and disappearing the instant its screen changed. They
 * share one now, and it rises off the map rather than cross-fading with it —
 * `presence` going `"out"` plays the leave, and AtlasApp holds the screen
 * mounted for exactly that long.
 */
export default function Sheet({
  presence,
  style,
  children,
  ...rest
}: {
  presence: PresenceState;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "children">) {
  return (
    <div
      // Every surface this shell renders sits over the map and takes the whole
      // screen, so the modal semantics belong here rather than being restated
      // (or forgotten) at each of the eight call sites. The name comes from the
      // call site — only it knows which phase this is.
      role="dialog"
      aria-modal="true"
      {...rest}
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.sans,
        fontSize: 15,
        zIndex: 30,
        animation:
          presence === "in"
            ? `sheetIn ${motion.duration.slow}ms ${motion.ease.enter} both`
            : `sheetOut ${SHEET_EXIT_MS}ms ${motion.ease.exit} both`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
