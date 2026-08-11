"use client";

import { color, font, motion, transition } from "@/lib/theme";
import { useEffect, useRef } from "react";
import { usePresence, type PresenceState } from "@/lib/motion";

export interface ToastData {
  /** Small mono label above the message — "Map updated" for re-plans. */
  kicker?: string;
  message: string;
  /** Bumped per call so a replacement toast replays its entrance. */
  seq: number;
}

const EXIT_MS = motion.duration.base;

/**
 * Mount this permanently and hand it the current toast, or null. It owns its own
 * exit: `toast` going null starts the leave animation rather than deleting the
 * element mid-air.
 */
export default function Toast({ toast }: { toast: ToastData | null }) {
  const { mounted, state } = usePresence(Boolean(toast), EXIT_MS);
  // The exit renders after `toast` has already gone null, so the last real one
  // is held back for it.
  const last = useRef<ToastData | null>(toast);
  useEffect(() => {
    if (toast) last.current = toast;
  }, [toast]);

  const shown = toast ?? last.current;
  if (!mounted || !shown) return null;
  // Keyed on `seq` so a second toast replaces the first with a fresh entrance
  // rather than silently swapping its text.
  return <ToastBody key={shown.seq} toast={shown} state={state} />;
}

function ToastBody({
  toast,
  state,
}: {
  toast: ToastData;
  state: PresenceState;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        bottom: 26,
        left: "50%",
        // The centring transform lives on this wrapper so the keyframes below
        // are free to use `transform` themselves.
        transform: "translateX(-50%)",
        zIndex: 40,
        maxWidth: 520,
      }}
    >
      <div
        style={{
          background: color.ink,
          color: color.accentInk,
          padding: "13px 20px",
          borderRadius: 11,
          fontSize: 14,
          boxShadow: "0 12px 32px rgba(44,40,35,0.3)",
          animation:
            state === "in"
              ? `fadeUp ${motion.duration.slow}ms ${motion.ease.enter} both`
              : `fadeDown ${EXIT_MS}ms ${motion.ease.exit} both`,
          transition: transition("box-shadow"),
        }}
      >
        {toast.kicker && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 9.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#c99a2e",
              marginBottom: 5,
            }}
          >
            {toast.kicker}
          </div>
        )}
        {toast.message}
      </div>
    </div>
  );
}
