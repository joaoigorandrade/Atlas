"use client";

// The app's shared *failure* marks, the way `components/Pending.tsx` holds its
// shared *pending* ones. A surface that ended up with nothing renders
// `ErrorState`; a surface that got some of what it asked for and then lost the
// rest pins an `InlineError` under what landed.
//
// Both are presentational: they take resolved strings, never an `AtlasError`.
// Picking the copy is the caller's job, because the caller is the one that
// knows the language and the context (`lib/errorCopy.ts`).

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { color, font, kicker as kickerStyle, motion } from "@/lib/theme";

const STRINGS = {
  en: { tryAgain: "Try again" },
  "pt-BR": { tryAgain: "Tentar de novo" },
} as const;

/**
 * The full panel — a mono kicker, the sentence, and the way out. Used by the
 * error boundaries, `app/error.tsx`, and any phase that opened onto nothing.
 *
 * `onRetry` is the primary action and `secondary` is the escape hatch ("Back to
 * the map"), so a learner is never left on a dead screen with one button that
 * might not work twice.
 */
export function ErrorState({
  kicker,
  message,
  body,
  retryLabel,
  onRetry,
  secondary,
  compact,
}: {
  kicker?: string;
  message: string;
  /** A second, quieter line — what survived, what happens next. */
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
  secondary?: { label: string; onClick: () => void };
  /** Sits inside a sheet — a smaller headline than the full-screen state. */
  compact?: boolean;
}): ReactNode {
  const t = useT(STRINGS);
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 12,
        maxWidth: 460,
        // `compact` is the crashed-session fallback. It still fills the sheet
        // it replaced: hung at the corner with the map showing behind it, a
        // handled error read as a render failure.
        margin: "0 auto",
        padding: compact ? "72px 32px" : "72px 40px",
        minHeight: compact ? "70vh" : "60vh",
        animation: `fadeUp ${motion.duration.slow}ms ${motion.ease.enter} both`,
      }}
    >
      {kicker && (
        <div style={{ ...kickerStyle(10.5, "0.18em"), color: color.dangerInk }}>
          {kicker}
        </div>
      )}
      <div
        style={{
          fontFamily: font.serif,
          fontWeight: 500,
          fontSize: compact ? 21 : 26,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          color: color.ink,
        }}
      >
        {message}
      </div>
      {body && (
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: color.inkMuted }}>
          {body}
        </div>
      )}
      {(onRetry || secondary) && (
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {onRetry && (
            <button className="at-press" onClick={onRetry} style={primaryButton}>
              {retryLabel ?? t.tryAgain}
            </button>
          )}
          {secondary && (
            <button
              className="at-press"
              onClick={secondary.onClick}
              style={secondaryButton}
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The compact form, for a failure *inside* content that is otherwise fine: the
 * tail of a reading pass that stopped halfway, an aside whose answer never
 * arrived. It sits in the flow and offers the same one tap back.
 */
export function InlineError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}): ReactNode {
  const t = useT(STRINGS);
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 3,
        background: color.dangerBg,
        border: "1px solid rgba(154,64,52,0.2)",
        color: color.dangerInk,
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    >
      <span style={{ flex: 1, minWidth: 180 }}>{message}</span>
      {onRetry && (
        <button
          className="at-press"
          onClick={onRetry}
          style={{
            flexShrink: 0,
            padding: "6px 11px",
            borderRadius: 3,
            border: "1px solid rgba(154,64,52,0.3)",
            background: "transparent",
            color: color.dangerInk,
            fontFamily: font.sans,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {retryLabel ?? t.tryAgain}
        </button>
      )}
    </div>
  );
}

const primaryButton = {
  padding: "11px 18px",
  borderRadius: 3,
  border: "none",
  background: color.accent,
  color: color.accentInk,
  fontFamily: font.caps,
  fontSize: 15.5,
  letterSpacing: "0.06em",
  cursor: "pointer",
  boxShadow: `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(246,239,223,0.34)`,
} as const;

const secondaryButton = {
  padding: "11px 18px",
  borderRadius: 3,
  border: `1px solid ${color.hairlineStrong}`,
  background: color.card,
  color: color.inkSoft,
  fontFamily: font.caps,
  fontSize: 15.5,
  letterSpacing: "0.06em",
  cursor: "pointer",
} as const;
