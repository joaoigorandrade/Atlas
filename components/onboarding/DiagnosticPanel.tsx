"use client";

import { DIAGNOSTIC } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface DiagnosticPanelProps {
  /** Number of questions answered so far. */
  answered: number;
  onAnswer: () => void;
  onStart: () => void;
}

export default function DiagnosticPanel({
  answered,
  onAnswer,
  onStart,
}: DiagnosticPanelProps) {
  const done = answered >= DIAGNOSTIC.length;
  const question = DIAGNOSTIC[Math.min(answered, DIAGNOSTIC.length - 1)];

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        background: "rgba(248,246,240,0.92)",
        backdropFilter: "blur(6px)",
        borderLeft: `1px solid ${color.hairline}`,
        padding: "52px 44px",
        display: "flex",
        flexDirection: "column",
        animation: "softIn 0.4s both",
      }}
    >
      <div style={kicker(11)}>Placement · adaptive</div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {DIAGNOSTIC.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 3,
              background: i < answered ? color.accent : "rgba(44,40,35,0.12)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>

      {!done && (
        <div key={answered} style={{ marginTop: 44, animation: "fadeUp 0.4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: color.amberInk,
              marginBottom: 16,
            }}
          >
            {question.tag}
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 27,
              lineHeight: 1.28,
              marginBottom: 30,
            }}
          >
            {question.q}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {question.opts.map((label) => (
              <button
                key={label}
                onClick={onAnswer}
                style={{
                  textAlign: "left",
                  padding: "15px 18px",
                  background: color.card,
                  border: "1px solid rgba(44,40,35,0.16)",
                  borderRadius: 11,
                  fontSize: 15,
                  color: color.ink,
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 13,
              color: color.inkFaint,
              lineHeight: 1.5,
            }}
          >
            {question.note}
          </div>
        </div>
      )}

      {done && (
        <div style={{ marginTop: "auto", animation: "fadeUp 0.5s both" }}>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              lineHeight: 1.3,
              marginBottom: 8,
            }}
          >
            Your map is ready.
          </div>
          <div
            style={{
              fontSize: 14,
              color: color.inkMuted,
              lineHeight: 1.55,
              marginBottom: 24,
            }}
          >
            We pruned what you already own and lit your frontier — the concepts
            you&rsquo;re ready to learn next.
          </div>
          <button
            onClick={onStart}
            style={{
              width: "100%",
              padding: 16,
              background: color.accent,
              color: color.accentInk,
              border: "none",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(47,107,79,0.28)",
            }}
          >
            Start here →
          </button>
        </div>
      )}
    </div>
  );
}
