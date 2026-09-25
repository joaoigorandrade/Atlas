"use client";

import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { color, font } from "@/lib/theme";

/**
 * The atlas's buttons. There used to be none — the same full-width filled CTA
 * was hand-copied into every phase — so a restyle missed half of them.
 *
 * - `primary`: a plate of solid ink with an engraved rule set inside it.
 * - `secondary`: the rule alone, in the accent.
 * - `quiet`: an italic line of text, for the way out.
 */
export default function Button({
  variant = "primary",
  accent = color.accent,
  full = variant !== "quiet",
  style,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  /** The ink the button is struck in — a phase passes its own. */
  accent?: string;
  /** Span the column. Default for everything but `quiet`. */
  full?: boolean;
}) {
  return (
    <button
      className={className ? `at-press ${className}` : "at-press"}
      {...rest}
      style={{
        ...base,
        ...VARIANT[variant](accent),
        width: full ? "100%" : undefined,
        ...style,
      }}
    />
  );
}

const base: CSSProperties = {
  cursor: "pointer",
  borderRadius: 3,
  fontFamily: font.caps,
  fontSize: 15.5,
  letterSpacing: "0.06em",
  lineHeight: 1.2,
};

const VARIANT: Record<"primary" | "secondary" | "quiet", (ink: string) => CSSProperties> =
  {
    primary: (ink) => ({
      padding: "13px 20px",
      border: "none",
      background: ink,
      color: color.accentInk,
      // The engraved rule: a hairline of paper set in from the plate's edge.
      boxShadow: `inset 0 0 0 3px ${ink}, inset 0 0 0 4px rgba(246,239,223,0.34), 0 1px 0 rgba(43,33,24,0.25)`,
    }),
    secondary: (ink) => ({
      padding: "12px 18px",
      border: `1px solid ${ink}`,
      background: "transparent",
      color: ink,
      boxShadow: `inset 0 0 0 2px ${color.card}, inset 0 0 0 3px ${ink}33`,
    }),
    quiet: () => ({
      padding: "6px 4px",
      border: "none",
      background: "none",
      color: color.inkMuted,
      fontFamily: font.display,
      fontStyle: "italic",
      letterSpacing: 0,
    }),
  };
