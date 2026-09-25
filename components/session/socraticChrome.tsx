"use client";

// The two controls that surround the ladder: the one that shows what the probe
// on screen has established, and the one that shows (and sets) the rung. Lifted
// out of `SocraticView` for the same reason `socraticCopy.ts` was — the view is
// at its size ceiling, and these two are the pieces with no dialogue in them.
import {
  HELP_COLOR,
  type HelpLevel,
  helpLabels,
  type SocraticAction,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import { useLanguage } from "@/lib/i18n";

const GREEN = "#3a6a55";

/**
 * What this probe has already established, and what is still open.
 *
 * The anti-stuck pixel. Without it a learner answering a probing question in
 * two goes sees only "not quite" twice and reads it as failing twice; with it
 * they watch a circle become a tick. It draws nothing for a pass generated
 * before `sufficient` existed — there is no bar to show, and an empty box
 * would read as a bug rather than as an older pass.
 */
export function Ledger({
  sufficient = [],
  covered = [],
  banked,
  stillOpen,
}: {
  sufficient?: readonly string[];
  covered?: number[];
  banked: string;
  stillOpen: string;
}) {
  if (sufficient.length < 2) return null;
  const has = (i: number) => covered.includes(i);
  const done = sufficient.filter((_, i) => has(i)).length;
  return (
    <div
      data-testid="socratic-ledger"
      style={{
        marginBottom: 13,
        padding: "10px 13px",
        borderRadius: 3,
        background: "rgba(43,33,24,0.035)",
        border: `1px solid ${color.hairline}`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: color.inkGhost,
          marginBottom: 7,
        }}
      >
        {done ? banked : stillOpen}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {sufficient.map((piece, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              fontSize: 12.5,
              lineHeight: 1.4,
              color: has(i) ? color.ink : color.inkFaint,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "0 0 auto",
                fontSize: 11,
                color: has(i) ? GREEN : color.inkGhost,
              }}
            >
              {has(i) ? "✓" : "○"}
            </span>
            {/* The piece itself stays hidden until it is banked: printing the
                whole bar up front is the outline of the answer handed over
                before the question is asked. */}
            <span>{has(i) ? piece : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Silent · Hint · Guide · Show me ladder. The active cell is the rung the
 *  step is at right now; clicking sets the floor every later probe opens on. */
export function HelpDial({
  help,
  dispatch,
}: {
  help: HelpLevel;
  dispatch: (action: SocraticAction) => void;
}) {
  const { language } = useLanguage();
  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        background: color.chipBg,
        border: `1px solid rgba(43,33,24,0.09)`,
        borderRadius: 3,
        padding: 3,
      }}
    >
      {helpLabels(language).map((label, i) => {
        const active = i === help;
        const c = HELP_COLOR[i as HelpLevel];
        return (
          <button
            className="at-press"
            key={label}
            onClick={() => dispatch({ type: "setHelp", level: i as HelpLevel })}
            style={{
              padding: "5px 11px",
              borderRadius: 2,
              border: "none",
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.04em",
              background: active ? c : "transparent",
              color: active ? color.accentInk : color.inkFaint,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
