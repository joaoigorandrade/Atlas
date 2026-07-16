"use client";

import { color, font } from "@/lib/theme";

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
}

export default function TopBar({ query, onQuery, onSurface }: TopBarProps) {
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: color.inkMuted,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#c99a2e",
            boxShadow: "0 0 8px rgba(201,154,46,0.6)",
          }}
        />
        <span style={{ fontWeight: 600, color: color.ink }}>12</span> day streak
      </div>
      <div
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
        Review · ~8 min
      </div>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: color.ink,
          color: color.accentInk,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        A
      </div>
    </div>
  );
}
