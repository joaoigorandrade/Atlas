"use client";

// A state, not an event — so it sits there until it isn't true any more, rather
// than sliding past as a toast the learner may be looking away from.
//
// Deliberately quiet: losing the network mid-session is not the learner's
// mistake, and nothing is lost when it happens. The banner says both.

import { color, font, motion } from "@/lib/theme";
import { usePresence } from "@/lib/motion";

const EXIT_MS = motion.duration.base;

export default function OfflineBanner({
  offline,
  message,
}: {
  offline: boolean;
  message: string;
}) {
  const { mounted, state } = usePresence(offline, EXIT_MS);
  if (!mounted) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        padding: "9px 18px",
        background: color.amberBg,
        borderBottom: "1px solid rgba(160,106,48,0.22)",
        color: color.amberInk,
        fontFamily: font.sans,
        fontSize: 13,
        textAlign: "center",
        animation:
          state === "in"
            ? `softIn ${motion.duration.slow}ms ${motion.ease.enter} both`
            : `softIn ${EXIT_MS}ms ${motion.ease.exit} both reverse`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color.amberInk,
          flexShrink: 0,
        }}
      />
      {message}
    </div>
  );
}
