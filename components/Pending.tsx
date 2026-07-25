"use client";

import { color } from "@/lib/theme";

/**
 * The app's one loading mark: three ink dots keeping time. Sits inline in
 * buttons and captions wherever work is in flight.
 */
export function InkDots({
  size = 4,
  tone = color.inkGhost,
}: {
  size?: number;
  tone?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        gap: size,
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: tone,
            animation: `inkDot 1.2s ${(i * 0.16).toFixed(2)}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

/** Indeterminate hairline — an ink stroke drawn across the page, and again. */
export function InkRule({
  width = 210,
  tone = color.accent,
}: {
  width?: number | string;
  tone?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width,
        height: 1.5,
        margin: "0 auto",
        borderRadius: 1,
        background: color.hairline,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "32%",
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
          animation: "inkSweep 1.7s cubic-bezier(0.45,0,0.25,1) infinite",
        }}
      />
    </div>
  );
}
