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
        borderBottom: "1px solid rgba(var(--amber-ink),.22)",
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

/** A write that has exhausted its retries — the same quiet, standing state as
 *  the banner, pinned top-centre instead of full width. */
export function SaveFailedPill({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 38,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 999,
        background: color.dangerBg,
        border: "1px solid rgba(var(--danger-ink),.22)",
        color: color.dangerInk,
        fontFamily: font.mono,
        fontSize: 10.5,
        letterSpacing: "0.06em",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color.dangerInk,
          animation: "breathe 1.8s ease-in-out infinite",
        }}
      />
      {message}
    </div>
  );
}
