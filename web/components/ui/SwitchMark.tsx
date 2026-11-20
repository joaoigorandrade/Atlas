"use client";

import { color, transition } from "@/lib/theme";

/**
 * The drawn part of an on/off switch — an engraved slot with a brass-paper
 * slider. The control around it (a button with `role="switch"`, or a row that
 * toggles) stays at the call site; there were three hand copies of this mark.
 * The slider moves on `transform`, never `left`.
 */
export default function SwitchMark({ on, width = 34 }: { on: boolean; width?: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        flex: "0 0 auto",
        width,
        height: 20,
        borderRadius: 2,
        background: on ? color.accent : "rgba(43,33,24,0.14)",
        boxShadow: "inset 0 1px 2px rgba(43,33,24,0.25)",
        transition: transition("background"),
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: 1.5,
          background: color.card,
          boxShadow: "0 1px 2px rgba(43,33,24,0.35)",
          transform: `translateX(${on ? width - 20 : 0}px)`,
          transition: transition("transform", "base", "enter"),
        }}
      />
    </span>
  );
}
