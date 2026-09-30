"use client";

// The gentle skip flag: tapping a phase ahead of the recommended one asks
// first — do the owed one, or jump anyway. Lifted out of NodeDetail to keep
// that file under its size ceiling.

import { color, font } from "@/lib/theme";

export function SkipNudge({
  nudge,
  doFirst,
  skipTo,
  onDoFirst,
  onSkip,
}: {
  /** What the skipped-over phase is for — `phaseSkipNudge`. */
  nudge: string;
  doFirst: string;
  skipTo: string;
  onDoFirst: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      style={{
        background: color.amberBg,
        border: "1px solid rgba(160,106,48,0.25)",
        borderRadius: 3,
        padding: "13px 15px",
        marginTop: -8,
        marginBottom: 18,
        animation: "fadeUp 0.25s both",
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          lineHeight: 1.5,
          color: color.amberInk,
          marginBottom: 11,
        }}
      >
        {nudge}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="at-press"
          data-testid="action-skip-cancel"
          onClick={onDoFirst}
          style={{
            padding: "8px 13px",
            background: color.accent,
            color: color.accentInk,
            border: "none",
            borderRadius: 3,
            fontSize: 13,
            fontFamily: font.caps,
            letterSpacing: "0.06em",
            cursor: "pointer",
          }}
        >
          {doFirst}
        </button>
        <button
          className="at-press"
          data-testid="action-skip-confirm"
          onClick={onSkip}
          style={{
            padding: "8px 4px",
            background: "none",
            border: "none",
            fontSize: 13,
            color: color.amberInk,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {skipTo}
        </button>
      </div>
    </div>
  );
}
