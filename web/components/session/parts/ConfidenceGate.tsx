"use client";

// The one-tap "how sure are you?" that opens a run, before anything is shown.
//
// Taken before the work on purpose: a rating given after the first item is
// seen is a rating of that item, not of what the learner thinks they know.
// Its three answers stand for the felt-% in `CONFIDENCE_FELT`, the scale every
// phase shares, so a reading here averages with the Crucible's and Predict's.
// Same buttons, same `action-sure-<i>` handles as Predict's per-forecast tap.

import { useLanguage } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: { sure: ["Not sure", "Fairly sure", "Very sure"] },
  "pt-BR": { sure: ["Não tenho certeza", "Bastante seguro", "Muito seguro"] },
} as const;

export default function ConfidenceGate({
  question,
  onPick,
}: {
  /** What the learner is rating — asked in the phase's own words. */
  question: string;
  onPick: (level: number) => void;
}) {
  const labels = STRINGS[useLanguage().language].sure;
  return (
    <div data-testid="confidence-gate" style={{ marginTop: 18 }}>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 17,
          lineHeight: 1.45,
          color: color.ink,
          marginBottom: 12,
        }}
      >
        {question}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {labels.map((label, i) => (
          <button
            key={i}
            className="at-press"
            data-testid={`action-sure-${i}`}
            onClick={() => onPick(i)}
            style={{
              padding: "10px 16px",
              borderRadius: 3,
              // All three alike: a highlighted answer is a suggested one.
              border: `1px solid ${color.hairlineStrong}`,
              background: color.card,
              color: color.ink,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
