"use client";

// The chrome every session surface has worn since Consume: the header with a
// way back and the phase's own kicker, the scrolling body, and the node's
// ladder along the bottom.
//
// This is layout, not an engine. Each phase still owns its reducer, its
// generator, its grader, its palette and its screen — what it does not own is
// a fifth copy of a 58-pixel header, which is the kind of duplication that
// makes a design change miss one surface.

import type { ReactNode } from "react";
import { phaseLabel, type PhaseId } from "@/lib/curriculum";
import Sheet from "@/components/Sheet";
import { color, font } from "@/lib/theme";
import type { PresenceState } from "@/lib/motion";

const BACK = { en: "← Map", "pt-BR": "← Mapa" } as const;
const SESSION = { en: "Session", "pt-BR": "Sessão" } as const;

export default function PhaseShell({
  presence,
  phase,
  kicker,
  accent,
  title,
  plan,
  lang,
  onExit,
  headerRight,
  children,
}: {
  presence: PresenceState;
  /** Drives `data-testid="phase-<id>"` — the stable handle every spec uses. */
  phase: PhaseId;
  /** The phase's own product name, from its copy table. */
  kicker: string;
  accent: string;
  title: string;
  plan: readonly PhaseId[];
  lang: "en" | "pt-BR";
  onExit: () => void;
  /** Anything the phase wants in the header's right edge — a counter, a dial. */
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet
      presence={presence}
      data-testid={`phase-${phase}`}
      aria-label={`${kicker} — ${title}`}
    >
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 58,
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          className="at-press"
          data-testid="action-exit"
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {BACK[lang]}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {SESSION[lang]} · {kicker}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
        <div style={{ flex: 1 }} />
        {headerRight}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 90px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>{children}</div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 24,
          fontFamily: font.mono,
          fontSize: 10.5,
          color: color.inkGhost,
        }}
      >
        {plan.map(phaseLabel).join(" → ")}
      </div>
    </Sheet>
  );
}
