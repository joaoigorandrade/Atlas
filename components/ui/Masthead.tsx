"use client";

import type { CSSProperties, ReactNode } from "react";
import { color, font, layout } from "@/lib/theme";

/**
 * The bar across the head of every page, drawn as the head of an atlas leaf:
 * opaque vellum over a double engraved rule. Opaque on purpose — the blurred
 * glass it replaced blurred nothing on the session pages and cost a full
 * re-blur per frame over the moving map.
 */
export const mastheadBar: CSSProperties = {
  flex: "0 0 auto",
  height: layout.topBar,
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 24px",
  background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
  borderBottom: `3px double ${color.rule}`,
  position: "relative",
};

/**
 * The page head: a way back, the page's name as an engraved kicker, its title
 * set in Fell, and whatever the page wants at the right edge. Every session
 * phase, the dashboard, the profile and the calibration read-out wear this one
 * — there were eleven hand copies of it.
 */
export default function Masthead({
  back,
  onBack,
  backTestId,
  kicker,
  accent = color.inkFaint,
  title,
  meta,
  style,
  children,
}: {
  back?: string;
  onBack?: () => void;
  backTestId?: string;
  kicker?: ReactNode;
  /** The kicker's ink — a phase strikes its name in its own colour. */
  accent?: string;
  title?: ReactNode;
  /** Set just after the title — a count, a progress mark. */
  meta?: ReactNode;
  style?: CSSProperties;
  /** Laid out at the right edge. */
  children?: ReactNode;
}) {
  return (
    <header style={{ ...mastheadBar, ...style }}>
      {onBack && (
        <>
          <button
            className="at-press"
            data-testid={backTestId}
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 2px",
              fontFamily: font.display,
              fontStyle: "italic",
              fontSize: 15.5,
              color: color.inkMuted,
            }}
          >
            {back}
          </button>
          <span aria-hidden style={{ color: color.gilt, fontSize: 10 }}>
            ◆
          </span>
        </>
      )}
      {kicker && (
        <span
          style={{
            fontFamily: font.caps,
            fontSize: 13,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: accent,
            whiteSpace: "nowrap",
          }}
        >
          {kicker}
        </span>
      )}
      {title && (
        <div
          style={{
            fontFamily: font.display,
            fontSize: 21,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {title}
        </div>
      )}
      {meta}
      <div style={{ flex: 1 }} />
      {children}
    </header>
  );
}
