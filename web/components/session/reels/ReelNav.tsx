"use client";

// The ways on from a reel card: the section's Continue / Finish on its last
// card, and the arrow under every card but the last — the tap that does what
// a swipe does, for a mouse, a keyboard, or a learner who has not found the
// swipe yet (the first card says so).

import type { ReelNext } from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { STRINGS } from "../consume/shared";

/** A reel card's button: the accent for the one that ends the reading. */
export const reelAction = (primary: boolean) =>
  ({
    marginTop: 28,
    padding: "13px 22px",
    background: primary ? color.accent : color.card,
    color: primary ? color.accentInk : color.ink,
    border: primary ? "none" : `1px solid ${color.hairlineStrong}`,
    borderRadius: 3,
    fontSize: 15,
    fontFamily: font.caps,
    letterSpacing: "0.05em",
    cursor: "pointer",
  }) as const;

/** Continue to the next section, finish the reading, or wait for the writer. */
export function ReelNextSection({
  next,
  nextSection,
  nextPhase,
  onContinue,
  onFinish,
}: {
  next: ReelNext | undefined;
  /** The name of the section Continue opens. */
  nextSection: string;
  /** The rung the reading hands on to. */
  nextPhase?: string;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const t = useT(STRINGS);
  if (next === "continue")
    return (
      <button
        type="button"
        className="at-press"
        data-testid="action-continue"
        onClick={onContinue}
        style={reelAction(false)}
      >
        {t.continueSection(nextSection)}
      </button>
    );
  if (next === "finish")
    return (
      <button
        type="button"
        className="at-press"
        data-testid="action-finish"
        onClick={onFinish}
        style={reelAction(true)}
      >
        {t.finishBegin(nextPhase)}
      </button>
    );
  if (next === "writing")
    return (
      <div
        style={{
          marginTop: 24,
          fontSize: 13,
          color: color.inkFaint,
          fontStyle: "italic",
        }}
      >
        {t.writingNext}
      </div>
    );
  return null;
}

/** The arrow under a card. The wrapper holds the centring transform, since an
 *  `at-press` element must not set `transform` inline. */
export function ReelNextCard({ first, onNext }: { first: boolean; onNext: () => void }) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 14,
        transform: "translateX(-50%)",
      }}
    >
      <button
        type="button"
        className="at-press"
        data-testid="action-next-card"
        aria-label={t.nextCard}
        onClick={onNext}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          background: "none",
          border: "none",
          padding: "4px 10px",
          cursor: "pointer",
          color: color.inkFaint,
          fontFamily: font.caps,
          fontSize: 11,
          letterSpacing: "0.06em",
        }}
      >
        {first && <span>{t.swipeHint}</span>}
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          ↓
        </span>
      </button>
    </div>
  );
}
