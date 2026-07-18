"use client";

import { useState } from "react";
import {
  STREAK_COLOR,
  reminderCopy,
  streakStatus,
  type AdherenceState,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface StreakFlameProps {
  adherence: AdherenceState;
  /** Arm / disarm the right-moment reminder (persisted in AtlasApp). */
  onToggleReminder: () => void;
}

/** The day-strip dot color by status — the freeze reads visibly different so the
 *  forgiving mechanic is legible at a glance. */
const DOT_COLOR: Record<string, string> = {
  hit: STREAK_COLOR.flame,
  freeze: STREAK_COLOR.freeze,
  miss: STREAK_COLOR.miss,
  today: "transparent",
};

/**
 * The streak flame — lives in the top bar everywhere (map + review), because a
 * visible streak is the pull back. Click it for the popover: the forgiving-freeze
 * reassurance, the day strip, best + banked freezes, and the rhythm-tuned reminder.
 */
export default function StreakFlame({
  adherence,
  onToggleReminder,
}: StreakFlameProps) {
  const [open, setOpen] = useState(false);
  const lit = adherence.metToday;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          color: color.inkMuted,
          padding: 0,
        }}
      >
        <span
          style={{
            position: "relative",
            width: lit ? 10 : 8,
            height: lit ? 10 : 8,
            borderRadius: "50%",
            background: STREAK_COLOR.flame,
            boxShadow: `0 0 ${lit ? 12 : 8}px rgba(201,154,46,${lit ? 0.85 : 0.6})`,
            transition: "width .2s, height .2s, box-shadow .2s",
          }}
        />
        <span>
          <span style={{ fontWeight: 600, color: color.ink }}>
            {adherence.streak}
          </span>{" "}
          day streak
        </span>
        {adherence.freezes > 0 && (
          <span
            title={`${adherence.freezes} freeze${adherence.freezes === 1 ? "" : "s"} banked — each absorbs a missed day`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: font.mono,
              fontSize: 10.5,
              color: STREAK_COLOR.freeze,
              background: "rgba(111,143,166,0.12)",
              border: `1px solid ${STREAK_COLOR.freeze}44`,
              borderRadius: 6,
              padding: "2px 6px",
            }}
          >
            <Snowflake />
            {adherence.freezes}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <Popover
            adherence={adherence}
            onToggleReminder={onToggleReminder}
          />
        </>
      )}
    </div>
  );
}

function Popover({
  adherence,
  onToggleReminder,
}: {
  adherence: AdherenceState;
  onToggleReminder: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 12px)",
        right: 0,
        width: 288,
        background: color.card,
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: 14,
        boxShadow: "0 16px 40px rgba(44,40,35,0.18)",
        padding: 18,
        zIndex: 41,
        animation: "fadeUp .18s both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 9,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: font.serif,
            fontSize: 30,
            color: STREAK_COLOR.flame,
            lineHeight: 1,
          }}
        >
          {adherence.streak}
        </span>
        <span style={{ ...kicker(10, "0.1em"), color: color.inkMuted }}>
          day streak
        </span>
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: color.inkSoft,
          marginBottom: 14,
        }}
      >
        {streakStatus(adherence)}
      </div>

      {/* The day strip — the freeze-absorbed day is the forgiving mechanic, visible. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {adherence.history.map((day, i) => (
          <div
            key={i}
            title={
              day.status === "freeze"
                ? "Missed — a freeze absorbed it, streak held"
                : day.status === "today"
                  ? adherence.metToday
                    ? "Today — done"
                    : "Today — still open"
                  : day.status === "miss"
                    ? "Missed"
                    : "Target met"
            }
            style={{
              flex: 1,
              height: 26,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                day.status === "today"
                  ? "transparent"
                  : day.status === "hit"
                    ? "rgba(201,154,46,0.16)"
                    : day.status === "freeze"
                      ? "rgba(111,143,166,0.16)"
                      : "rgba(44,40,35,0.05)",
              border:
                day.status === "today"
                  ? `1.5px dashed ${
                      adherence.metToday ? STREAK_COLOR.flame : color.inkGhost
                    }`
                  : "none",
            }}
          >
            {day.status === "freeze" ? (
              <Snowflake />
            ) : (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background:
                    day.status === "today" && !adherence.metToday
                      ? "transparent"
                      : DOT_COLOR[day.status],
                  border:
                    day.status === "today" && !adherence.metToday
                      ? `1.5px solid ${color.inkGhost}`
                      : "none",
                  boxShadow:
                    day.status === "hit"
                      ? `0 0 5px ${STREAK_COLOR.flame}`
                      : "none",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: font.mono,
          fontSize: 9.5,
          color: color.inkGhost,
          letterSpacing: "0.04em",
          marginBottom: 15,
        }}
      >
        <span>{adherence.history[0]?.label ?? ""}</span>
        <span>today</span>
      </div>

      {/* Best + banked freezes */}
      <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
        <Stat label="Best" value={`${adherence.best} d`} tone={color.ink} />
        <Stat
          label="Freezes"
          value={`${adherence.freezes}`}
          tone={STREAK_COLOR.freeze}
          icon
        />
      </div>

      {/* Right-moment reminder — tuned to the learner's actual rhythm */}
      <div
        style={{
          borderTop: `1px solid ${color.hairline}`,
          paddingTop: 13,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={{ ...kicker(9.5, "0.1em") }}>Reminder</span>
          <button
            onClick={onToggleReminder}
            role="switch"
            aria-checked={adherence.reminderOn}
            style={{
              position: "relative",
              width: 38,
              height: 22,
              borderRadius: 11,
              border: "none",
              cursor: "pointer",
              padding: 0,
              background: adherence.reminderOn
                ? color.accent
                : "rgba(44,40,35,0.18)",
              transition: "background .18s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: adherence.reminderOn ? 18 : 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: color.card,
                boxShadow: "0 1px 3px rgba(44,40,35,0.3)",
                transition: "left .18s",
              }}
            />
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: color.inkFaint,
            marginTop: 8,
          }}
        >
          {reminderCopy(adherence)}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: color.cardAlt,
        border: `1px solid ${color.hairline}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ ...kicker(9, "0.08em"), marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontFamily: font.serif,
          fontSize: 19,
          color: tone,
        }}
      >
        {icon && <Snowflake />}
        {value}
      </div>
    </div>
  );
}

/** A small snowflake glyph for the freeze — no icon dependency, matches the token palette. */
function Snowflake() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke={STREAK_COLOR.freeze}
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="3" y1="7" x2="21" y2="17" />
      <line x1="21" y1="7" x2="3" y2="17" />
    </svg>
  );
}
