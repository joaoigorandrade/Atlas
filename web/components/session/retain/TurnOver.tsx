"use client";

// Turning a review card over, and saying how sure you were first.
//
// The confidence tap rides on the flip rather than adding a step: the card has
// to be turned anyway, so the three ways to turn it are the three answers to
// "how sure are you?" — and the calibration curve gets one reading per card,
// held against whether the grade that follows is a miss. Keys 1–3 do the same
// from the keyboard; space still turns it without a rating.

import { color, font, kicker } from "@/lib/theme";
import { useLanguage } from "@/lib/i18n";
import type { CSSProperties } from "react";

const STRINGS = {
  en: { sure: ["Not sure", "Fairly sure", "Certain"], turn: "turn it over" },
  "pt-BR": { sure: ["Não sei", "Quase certo", "Certeza"], turn: "vire o card" },
} as const;

export default function TurnOver({
  onFlip,
  keycap,
}: {
  onFlip: (sure?: number) => void;
  keycap: CSSProperties;
}) {
  const t = STRINGS[useLanguage().language];
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
      {t.sure.map((label, i) => (
        <button
          key={i}
          className="at-press"
          data-testid={`action-sure-${i}`}
          aria-label={`${label} — ${t.turn}`}
          onClick={() => onFlip(i)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 3,
            cursor: "pointer",
            ...kicker(12, "0.1em", color.accent),
            fontFamily: font.caps,
            background: "none",
            border: `1px solid ${color.accent}47`,
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>
            ↻
          </span>
          {label}
          <span style={keycap}>{i + 1}</span>
        </button>
      ))}
    </div>
  );
}
