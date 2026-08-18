"use client";

// Retain's right rail — the honest budget bar and the FSRS retention forecast.
// Its own file so `RetainView` stays under its size ceiling.

import { FORECAST_COLOR, retainBudget, type RetainContent } from "@/lib/curriculum";
import { color, font, kicker, transition } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { STRINGS } from "@/components/session/retainCopy";

/** The right rail — the honest budget bar and the FSRS retention forecast. */
export default function Sidebar({
  content,
  budget,
}: {
  content: RetainContent;
  budget: ReturnType<typeof retainBudget>;
}) {
  const t = useT(STRINGS);
  return (
    <div>
      {/* Today's budget — minutes, never a wall of cards */}
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 14,
          padding: "18px 18px 8px",
          marginBottom: 16,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 6 }}>{t.todaysBudget}</div>
        <div style={{ fontSize: 13, color: color.inkMuted, marginBottom: 11 }}>
          {t.dailyTarget(content.budgetMin)}
        </div>
        <div
          style={{
            height: 8,
            background: "rgba(44,40,35,0.1)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${budget.pct}%`,
              height: "100%",
              background: color.accent,
              borderRadius: 4,
              transition: transition("width", "deliberate", "enter"),
            }}
          />
        </div>
        <div
          style={{
            fontSize: 12,
            color: color.inkFaint,
            marginTop: 9,
            lineHeight: 1.5,
            paddingBottom: 8,
          }}
        >
          {t.budgetBody}
        </div>
      </div>

      {/* Retention health · FSRS forecast */}
      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairline}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 14 }}>
          {t.retentionHealth}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {(content.forecast ?? []).map((f) => (
            <div key={f.label} style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  width: 8,
                  alignSelf: "stretch",
                  borderRadius: 4,
                  background: FORECAST_COLOR[f.tone],
                  flex: "0 0 auto",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontSize: 13.5, color: color.ink }}>{f.label}</span>
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: 15,
                      color: color.ink,
                    }}
                  >
                    {f.count}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: color.inkFaint,
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {f.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 15,
            paddingTop: 13,
            borderTop: `1px solid ${color.hairline}`,
            fontSize: 12,
            color: color.inkFaint,
            lineHeight: 1.5,
          }}
        >
          {t.fsrsNote}
        </div>
      </div>
    </div>
  );
}
