"use client";

import {
  GOAL_ORDER_CAPTION,
  STATE_COLOR,
  STATE_LABEL,
  type GoalKind,
  type NodeState,
  type PaceStatus,
  type PlanEntry,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

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
  goal: GoalKind;
  /** Pace against the deadline — null when the goal has no deadline. */
  pace: PaceStatus | null;
  /** Goal-ordered frontier: the plan's next moves. */
  nextUp: PlanEntry[];
  masteryPct: number;
  momentumPlaying: boolean;
  momentumWeek: number;
  onJumpFrontier: () => void;
  onToggleMomentum: () => void;
  onPickNode: (id: string) => void;
}

export default function LeftRail({
  subject,
  goal,
  pace,
  nextUp,
  masteryPct,
  momentumPlaying,
  momentumWeek,
  onJumpFrontier,
  onToggleMomentum,
  onPickNode,
}: LeftRailProps) {
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
        overflowY: "auto",
      }}
    >
      <div>
        <div style={{ ...kicker(10), marginBottom: 8 }}>Subject</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 1.1 }}>
          {subject}
        </div>
        {pace && (
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
            Final exam · {pace.daysLeft} days
          </div>
        )}
        {pace && (
          <div
            style={{
              marginTop: 9,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: pace.onTrack ? color.accent : color.amberInk,
            }}
          >
            {pace.onTrack
              ? `On pace — ~${pace.neededPerDay} min/day covers the ${pace.remaining} concepts left.`
              : `Behind pace — the map needs ~${pace.neededPerDay} min/day; your target is ${pace.targetPerDay}. Skip what you already know.`}
          </div>
        )}
      </div>

      {nextUp.length > 0 && (
        <div>
          <div style={{ ...kicker(10), marginBottom: 5 }}>Next up</div>
          <div
            style={{
              fontSize: 11.5,
              color: color.inkGhost,
              marginBottom: 10,
            }}
          >
            {GOAL_ORDER_CAPTION[goal]}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {nextUp.map(({ node, unlocks }) => (
              <button
                key={node.id}
                onClick={() => onPickNode(node.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 11px",
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 9,
                  fontSize: 13.5,
                  color: color.ink,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATE_COLOR.frontier,
                    boxShadow: `0 0 6px ${STATE_COLOR.frontier}`,
                    flex: "0 0 auto",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: font.serif,
                  }}
                >
                  {node.label}
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.inkFaint,
                    flex: "0 0 auto",
                  }}
                >
                  +{unlocks}
                </span>
              </button>
            ))}
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
