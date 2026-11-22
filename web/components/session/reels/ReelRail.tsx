"use client";

// The action rail down the right edge of a reel card — where a reel keeps its
// actions, so a thumb finds them without leaving the card. Each one is what
// the page view offered under a section, scoped to the card on screen: the
// four lenses (a model view over this section), "ask about this" (seeded with
// the card's own text), read-aloud, and skip.

import type { AltKey } from "@/lib/curriculum";
import type { ReadStatus } from "@/lib/speech";
import { color, font, transition } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { STRINGS } from "../consume/shared";

/** Engraved marks rather than pictograms: the atlas is set in type. */
const LENS_MARK: Record<AltKey, string> = {
  simpler: "○",
  example: "✎",
  analogy: "≈",
  deeper: "∴",
};

function RailButton({
  mark,
  label,
  on = false,
  testId,
  onClick,
  pressed,
}: {
  mark: string;
  label: string;
  on?: boolean;
  testId: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className="at-press"
      data-testid={testId}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: on ? color.accent : color.inkMuted,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 17,
          fontFamily: font.serif,
          background: on ? color.accentBg : color.card,
          border: `1px solid ${on ? color.accent : color.hairlineStrong}`,
          boxShadow: "0 2px 8px rgba(43,33,24,0.10)",
          transition: transition(["background", "border-color"], "fast"),
        }}
      >
        {mark}
      </span>
      <span
        style={{
          fontFamily: font.caps,
          fontSize: 10,
          letterSpacing: "0.06em",
          maxWidth: 56,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {label}
      </span>
    </button>
  );
}

export function ReelRail({
  controls,
  used,
  suggested,
  onLens,
  onAsk,
  listen,
  onSkip,
}: {
  controls: ReadonlyArray<[AltKey, string]>;
  /** The lens last opened over this section. */
  used: AltKey | null;
  /** The learner's learned default, marked where they haven't chosen one. */
  suggested: AltKey | null;
  onLens: (lens: AltKey) => void;
  onAsk: () => void;
  /** Read-aloud for this card; absent where there is no voice or no prose. */
  listen: { status: ReadStatus; onClick: () => void } | null;
  /** Fold the rest of this section to its takeaway. */
  onSkip?: () => void;
}) {
  const t = useT(STRINGS);
  const playing =
    !!listen && ["preparing", "playing", "buffering"].includes(listen.status);
  return (
    <nav
      aria-label={t.railLabel}
      className="at-reel-rail"
      style={{ display: "flex", flexDirection: "column", gap: 12, zIndex: 2 }}
    >
      {controls.map(([key, label]) => (
        <RailButton
          key={key}
          mark={LENS_MARK[key]}
          label={label}
          on={used === key || suggested === key}
          testId={`action-lens-${key}`}
          onClick={() => onLens(key)}
        />
      ))}
      <RailButton mark="?" label={t.railAsk} testId="action-ask" onClick={onAsk} />
      {listen && (
        <RailButton
          mark={playing ? "❚❚" : "♪"}
          label={playing ? t.railPause : t.railListen}
          on={playing || listen.status === "paused"}
          pressed={playing}
          testId="action-listen"
          onClick={listen.onClick}
        />
      )}
      {onSkip && (
        <RailButton
          mark="»"
          label={t.railSkip}
          testId="action-skip-section"
          onClick={onSkip}
        />
      )}
    </nav>
  );
}
