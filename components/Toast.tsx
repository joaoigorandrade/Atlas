"use client";

import { color, font, motion, transition } from "@/lib/theme";
import { useEffect, useRef } from "react";
import { usePresence, type PresenceState } from "@/lib/motion";

/** How loud a toast is. `info` is the default and the old behaviour; `error`
 *  changes the colour, the ARIA politeness and the dwell — a failure the
 *  learner has to act on must not evaporate while they're reading it. */
export type ToastTone = "info" | "success" | "error";

export interface ToastData {
  /** Small mono label above the message — "Map updated" for re-plans, or what
   *  failed for an error. */
  kicker?: string;
  message: string;
  /** Bumped per call so a replacement toast replays its entrance. */
  seq: number;
  tone?: ToastTone;
  /** The one-tap recovery. Rendered as a button beside the message. */
  action?: { label: string; onClick: () => void };
  /** Stay until dismissed. Defaults true for `error`, false otherwise. */
  sticky?: boolean;
  dismissLabel?: string;
}

const EXIT_MS = motion.duration.base;

/** Sticky by default exactly when the learner may need to act on it. */
export const isSticky = (toast: ToastData): boolean =>
  toast.sticky ?? toast.tone === "error";

/**
 * Mount this permanently and hand it the current toast, or null. It owns its own
 * exit: `toast` going null starts the leave animation rather than deleting the
 * element mid-air.
 */
export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData | null;
  onDismiss?: () => void;
}) {
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
  return (
    <ToastBody
      key={shown.seq}
      toast={shown}
      state={state}
      onDismiss={onDismiss}
    />
  );
}

function ToastBody({
  toast,
  state,
  onDismiss,
}: {
  toast: ToastData;
  state: PresenceState;
  onDismiss?: () => void;
}) {
  const error = toast.tone === "error";
  const showDismiss = Boolean(onDismiss) && isSticky(toast);
  return (
    <div
      // An error interrupts; anything else waits its turn in the queue a screen
      // reader is already working through.
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
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
          background: error ? color.dangerBg : color.ink,
          color: error ? color.dangerInk : color.accentInk,
          border: error ? `1px solid rgba(154,64,52,0.24)` : "none",
          padding: "13px 20px",
          borderRadius: 11,
          fontSize: 14,
          boxShadow: error
            ? "0 12px 32px rgba(154,64,52,0.16)"
            : "0 12px 32px rgba(44,40,35,0.3)",
          animation:
            state === "in"
              ? `fadeUp ${motion.duration.slow}ms ${motion.ease.enter} both`
              : `fadeDown ${EXIT_MS}ms ${motion.ease.exit} both`,
          transition: transition("box-shadow"),
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {toast.kicker && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 9.5,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                // On ink the kicker is the warm gold the design uses; on the
                // danger ground it is the same ink at reading weight.
                color: error ? color.dangerInk : "#c99a2e",
                opacity: error ? 0.72 : 1,
                marginBottom: 5,
              }}
            >
              {toast.kicker}
            </div>
          )}
          {toast.message}
        </div>

        {toast.action && (
          <button
            className="at-press"
            onClick={toast.action.onClick}
            style={{
              flexShrink: 0,
              padding: "8px 13px",
              borderRadius: 9,
              border: error
                ? `1px solid rgba(154,64,52,0.3)`
                : `1px solid rgba(247,245,239,0.28)`,
              background: "transparent",
              color: error ? color.dangerInk : color.accentInk,
              fontFamily: font.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {toast.action.label}
          </button>
        )}

        {showDismiss && (
          <button
            className="at-press"
            onClick={onDismiss}
            aria-label={toast.dismissLabel ?? "Dismiss"}
            style={{
              flexShrink: 0,
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: error ? color.dangerInk : color.accentInk,
              opacity: 0.55,
              fontSize: 15,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
