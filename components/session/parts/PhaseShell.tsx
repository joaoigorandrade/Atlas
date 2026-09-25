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
import Masthead from "@/components/ui/Masthead";
import { color, font } from "@/lib/theme";

const BACK = { en: "← Map", "pt-BR": "← Mapa" } as const;
const SESSION = { en: "Session", "pt-BR": "Sessão" } as const;

export default function PhaseShell({
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
    <Sheet data-testid={`phase-${phase}`} aria-label={`${kicker} — ${title}`}>
      <Masthead
        back={BACK[lang]}
        onBack={onExit}
        backTestId="action-exit"
        kicker={`${SESSION[lang]} · ${kicker}`}
        accent={accent}
        title={title}
      >
        {headerRight}
      </Masthead>

      <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 90px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>{children}</div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 24,
          fontFamily: font.caps,
          fontSize: 12,
          letterSpacing: "0.06em",
          color: color.inkGhost,
        }}
      >
        {plan.map(phaseLabel).join(" · ")}
      </div>
    </Sheet>
  );
}
