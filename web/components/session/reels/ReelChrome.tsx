"use client";

// The reels' frame around the cards: the story bar along the top, the notice
// cards at the foot of the feed, and the "ask about this" sheet that rises
// over a card the way a reel's comments do.

import Button from "@/components/ui/Button";
import { InlineError } from "@/components/ErrorState";
import { color, font, motion, transition } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { STRINGS, type PassageAsk } from "../consume/shared";
import { PassagePanel } from "../consume/PassagePanel";

/** A segment per section, filling card by card; a reached one jumps to it. */
export function ReelStoryBar({
  segments,
  sections,
  here,
  active,
  onJump,
}: {
  segments: number;
  sections: Map<number, { start: number; count: number }>;
  /** The section on screen. */
  here: number;
  /** The card on screen. */
  active: number;
  onJump: (card: number) => void;
}) {
  const t = useT(STRINGS);
  return (
    <nav style={{ flex: "0 0 auto", display: "flex", gap: 5, padding: "10px 16px 4px" }}>
      {Array.from({ length: segments }, (_, s) => {
        const span = sections.get(s);
        const fill = !span
          ? 0
          : s < here
            ? 1
            : s > here
              ? 0
              : (active - span.start + 1) / span.count;
        return (
          <button
            key={s}
            type="button"
            className="at-press"
            disabled={!span}
            aria-label={t.sectionProgress(s + 1, segments)}
            aria-current={s === here ? "step" : undefined}
            onClick={() => span && onJump(span.start)}
            style={{
              flex: 1,
              height: 12,
              padding: 0,
              background: "none",
              border: "none",
              display: "flex",
              alignItems: "center",
              cursor: span ? "pointer" : "default",
            }}
          >
            <span
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                height: 3,
                borderRadius: 2,
                background: "rgba(43,33,24,0.12)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${Math.min(1, Math.max(0, fill)) * 100}%`,
                  background: color.accent,
                  transition: transition("width", "base"),
                }}
              />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** A full card at the foot of the feed: the stream that stopped, or the
 *  missing-prerequisite flag. */
export function ReelNotice({
  index,
  incomplete,
  onRoutePrereq,
}: {
  index: number;
  incomplete?: { onRetry: () => void };
  onRoutePrereq: () => void;
}) {
  const t = useT(STRINGS);
  return (
    <section
      data-reel={index}
      className="at-reel-card"
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 520, width: "100%" }}>
        {incomplete ? (
          <InlineError
            message={t.readingIncomplete}
            retryLabel={t.readingRetry}
            onRetry={incomplete.onRetry}
          />
        ) : (
          <div
            style={{
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.28)",
              borderRadius: 3,
              padding: "20px 22px",
            }}
          >
            <div style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}>
              {t.simplifyingTitle}
            </div>
            <div style={{ fontSize: 14, color: color.inkMuted, marginBottom: 16 }}>
              {t.simplifyingBody}
            </div>
            <Button
              variant="secondary"
              full={false}
              accent={color.amberInk}
              onClick={onRoutePrereq}
            >
              {t.reviewPrereq}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** "Ask about this", risen from the bottom over the card it is about. */
export function ReelAskSheet({
  ask,
  suggestion,
  onAsk,
  onClose,
}: {
  ask: PassageAsk;
  suggestion: string;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(43,33,24,0.26)",
      }}
    >
      <div
        role="dialog"
        aria-label={t.askSection}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "78%",
          overflowY: "auto",
          background: color.paper,
          borderTop: `1px solid ${color.hairlineStrong}`,
          borderRadius: "14px 14px 0 0",
          padding: "4px 20px calc(24px + env(safe-area-inset-bottom))",
          animation: `fadeUp ${motion.duration.slow}ms ${motion.ease.enter} both`,
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <PassagePanel
            ask={ask}
            suggestion={suggestion}
            onAsk={onAsk}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
