"use client";

import { STATE_COLOR, STATE_LABEL, type NodeState } from "@/lib/curriculum";
import { EXAM_DAYS, type Pace } from "@/lib/planner";
import { color, font, kicker } from "@/lib/theme";

/** Pace verdict → the amber/green treatment the Plan panel wears. */
const PACE_TONE: Record<Pace["verdict"], { ink: string; bg: string; border: string }> = {
  behind: { ink: color.amberInk, bg: color.amberBg, border: "rgba(160,106,48,0.24)" },
  ontrack: { ink: color.accent, bg: color.accentBg, border: "rgba(47,107,79,0.22)" },
  ahead: { ink: color.accent, bg: color.accentBg, border: "rgba(47,107,79,0.22)" },
};

const LEGEND_ORDER: NodeState[] = [
  "frontier",
  "learning",
  "shaky",
  "mastered",
  "gap",
  "unknown",
];

interface LeftRailProps {
  subject: string;
  showDeadline: boolean;
  masteryPct: number;
  goalLabel: string;
  pace: Pace;
  prioritize: boolean;
  momentumPlaying: boolean;
  momentumWeek: number;
  onJumpFrontier: () => void;
  onTogglePrioritize: () => void;
  onToggleMomentum: () => void;
}

export default function LeftRail({
  subject,
  showDeadline,
  masteryPct,
  goalLabel,
  pace,
  prioritize,
  momentumPlaying,
  momentumWeek,
  onJumpFrontier,
  onTogglePrioritize,
  onToggleMomentum,
}: LeftRailProps) {
  const tone = PACE_TONE[pace.verdict];
  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        bottom: 0,
        left: 0,
        width: 262,
        background: "rgba(248,246,240,0.94)",
        borderRight: `1px solid ${color.hairline}`,
        padding: "26px 22px",
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div>
        <div style={{ ...kicker(10), marginBottom: 8 }}>Subject</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 1.1 }}>
          {subject}
        </div>
        {showDeadline && (
          <div
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              color: color.amberInk,
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.24)",
              borderRadius: 7,
              padding: "4px 9px",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#c99a2e",
              }}
            />
            Final exam · {EXAM_DAYS} days
          </div>
        )}
      </div>

      {showDeadline && (
        <div>
          <div style={{ ...kicker(10), marginBottom: 10 }}>Plan · pace</div>
          <div
            style={{
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderRadius: 10,
              padding: "12px 13px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: tone.ink,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: tone.ink,
                  flex: "0 0 auto",
                }}
              />
              {pace.headline}
            </div>
            <div
              style={{ fontSize: 12.5, lineHeight: 1.5, color: color.inkMuted }}
            >
              {pace.detail}
            </div>
          </div>
        </div>
      )}

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, color: color.inkMuted }}>
            Territory mastered
          </span>
          <span
            style={{ fontFamily: font.serif, fontSize: 22, color: color.accent }}
          >
            {masteryPct}%
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 5,
            background: "rgba(44,40,35,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${masteryPct}%`,
              height: "100%",
              background: color.accent,
              borderRadius: 5,
              transition: "width .5s",
            }}
          />
        </div>
      </div>

      <button
        onClick={onJumpFrontier}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 15px",
          background: color.card,
          border: "1px solid rgba(44,40,35,0.16)",
          borderRadius: 11,
          fontSize: 14,
          color: color.ink,
          cursor: "pointer",
        }}
      >
        <span>Jump to frontier</span>
        <span style={{ color: "#c99a2e" }}>→</span>
      </button>

      <button
        onClick={onTogglePrioritize}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 15px",
          marginTop: -12,
          background: prioritize ? color.accentBg : color.card,
          border: `1px solid ${
            prioritize ? "rgba(47,107,79,0.4)" : "rgba(44,40,35,0.16)"
          }`,
          borderRadius: 11,
          fontSize: 14,
          color: prioritize ? color.accent : color.ink,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          {prioritize ? "Path to " : "Prioritize path to "}
          {goalLabel}
        </span>
        <span style={{ color: color.accent, flex: "0 0 auto" }}>
          {prioritize ? "✓" : "◇"}
        </span>
      </button>

      <div>
        <div style={{ ...kicker(10), marginBottom: 12 }}>States</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {LEGEND_ORDER.map((state) => (
            <div
              key={state}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                color: color.inkSoft,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: STATE_COLOR[state],
                  flex: "0 0 auto",
                  boxShadow:
                    state === "frontier"
                      ? `0 0 7px ${STATE_COLOR[state]}`
                      : "none",
                }}
              />
              {STATE_LABEL[state].replace(" · ready", "")}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "auto" }}>
        <button
          onClick={onToggleMomentum}
          style={{
            width: "100%",
            padding: "12px 15px",
            borderRadius: 11,
            fontSize: 14,
            cursor: "pointer",
            background: momentumPlaying ? color.accent : color.card,
            color: momentumPlaying ? color.accentInk : color.ink,
            border: `1px solid ${
              momentumPlaying ? color.accent : "rgba(44,40,35,0.16)"
            }`,
          }}
        >
          {momentumPlaying ? "Stop replay" : "Momentum replay"}
        </button>
        {momentumPlaying && (
          <div
            style={{
              marginTop: 10,
              fontFamily: font.mono,
              fontSize: 11,
              color: color.inkFaint,
              textAlign: "center",
            }}
          >
            {momentumWeek === 0
              ? "Placement diagnostic"
              : `Week ${momentumWeek} of 3`}{" "}
            — watch it light up
          </div>
        )}
      </div>
    </div>
  );
}
