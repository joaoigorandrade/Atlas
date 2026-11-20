"use client";

// One of the dashboard's two hero cards — today's review, and your frontier.
// They were the same card written out twice.

import type { CSSProperties, ReactNode } from "react";
import { pressable } from "@/components/ui/Button";
import { plateStyle } from "@/components/ui/Plate";
import { color, font, kicker } from "@/lib/theme";

export function HeroCard({
  onOpen,
  frame,
  ink,
  dot,
  label,
  title,
  body,
  cta,
}: {
  onOpen: () => void;
  /** The double rule's colour. */
  frame: string;
  /** The kicker's and the call to action's colour. */
  ink: string;
  dot: CSSProperties;
  label: ReactNode;
  title: ReactNode;
  body: ReactNode;
  cta: ReactNode;
}) {
  return (
    <div
      className="at-lift"
      {...pressable(onOpen)}
      style={{
        ...plateStyle,
        padding: "24px 26px",
        cursor: "pointer",
        border: `3px double ${frame}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...kicker(10.5, "0.12em"),
          color: ink,
          marginBottom: 14,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", ...dot }} />
        {label}
      </div>
      <div
        style={{ fontFamily: font.serif, fontSize: 28, lineHeight: 1.1, marginBottom: 6 }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: color.inkMuted,
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
      <div style={{ fontSize: 13.5, color: ink, fontWeight: 600 }}>{cta}</div>
    </div>
  );
}
