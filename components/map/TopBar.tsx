"use client";

import type { AdherenceState, DailyQueue } from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import StreakFlame from "@/components/map/StreakFlame";

export type Surface = "map" | "session" | "review";

const SURFACES: ReadonlyArray<[Surface, string]> = [
  ["map", "Map"],
  ["session", "Session"],
  ["review", "Review"],
];

interface TopBarProps {
  query: string;
  onQuery: (value: string) => void;
  onSurface: (surface: Surface) => void;
  /** Adherence state — drives the flame + freeze badge. */
  adherence: AdherenceState;
  /** The honest queue: minutes against the daily target, never a card wall. */
  queue: DailyQueue;
  /** Arm / disarm the right-moment reminder from the flame popover. */
  onToggleReminder: () => void;
  /** Signed-in account — the avatar shows its initial and signs out on click. */
  userEmail: string;
  onSignOut: () => void;
}

export default function TopBar({
  query,
  onQuery,
  onSurface,
  adherence,
  queue,
  onToggleReminder,
  userEmail,
  onSignOut,
}: TopBarProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 58,
        background: "rgba(248,246,240,0.88)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${color.hairline}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px 0 24px",
        gap: 18,
        zIndex: 20,
      }}
    >
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        Atlas
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: color.chipBg,
          border: "1px solid rgba(44,40,35,0.09)",
          borderRadius: 10,
          padding: 3,
          marginLeft: 6,
        }}
      >
        {SURFACES.map(([key, label]) => {
          const active = key === "map";
          return (
            <button
              key={key}
              onClick={() => onSurface(key)}
              style={{
                padding: "6px 15px",
                borderRadius: 8,
                border: "none",
                fontSize: 13.5,
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
                background: active ? color.card : "transparent",
                color: active ? color.ink : color.inkFaint,
                boxShadow: active ? "0 1px 3px rgba(44,40,35,0.1)" : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          flex: 1,
          maxWidth: 300,
          marginLeft: 8,
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 9,
          padding: "8px 12px",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            border: `1.5px solid ${color.inkGhost}`,
            borderRadius: "50%",
          }}
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search concepts…"
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            fontSize: 14,
            color: color.ink,
          }}
        />
      </div>
      <div style={{ flex: 1 }} />
      <StreakFlame adherence={adherence} onToggleReminder={onToggleReminder} />
      <button
        onClick={() => onSurface("review")}
        title={
          adherence.metToday
            ? "Today's queue is clear"
            : `${queue.cards} cards due now — framed in minutes, not a card wall`
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: color.accentBg,
          border: "1px solid rgba(47,107,79,0.22)",
          borderRadius: 20,
          padding: "6px 13px",
          fontSize: 13,
          color: color.accent,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color.accent,
          }}
        />
        {adherence.metToday
          ? "Review · clear ✓"
          : `Review · ~${queue.minutes} min`}
      </button>
      <button
        onClick={onSignOut}
        title={userEmail ? `Sign out (${userEmail})` : "Sign out"}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: color.ink,
          color: color.accentInk,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {(userEmail[0] ?? "A").toUpperCase()}
      </button>
    </div>
  );
}
