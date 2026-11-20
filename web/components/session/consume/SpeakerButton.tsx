"use client";

import { BLUE, STRINGS } from "./shared";
import { useT } from "@/lib/i18n";
import { ReadStatus } from "@/lib/speech";
import { color, motion, transition } from "@/lib/theme";

export function sectionName(kicker: string): string {
  return kicker.replace(/^\s*\d+\s*·\s*/, "");
}

/**
 * Play/pause for one section's reading. Hidden entirely where the deploy has
 * no speech engine or the learner has read-aloud off.
 *
 * Every state the engine can be in is drawn, and drawn differently — that is
 * the whole point of the control. The ring carries *where* the reading is: an
 * indeterminate sweep while a clip is on the wire, a real arc filled to how
 * far through the section the voice has got once it is talking. The glyph
 * carries *what a click does*: pause bars while it plays, a triangle while it
 * waits. Neither one is ever a guess — the old control pulsed its whole
 * opacity because "warming up" was the only wait `speechSynthesis` could
 * report, and it could not tell that apart from failure.
 */
export function SpeakerButton({
  status,
  progress,
  onClick,
}: {
  status: ReadStatus;
  /** 0–1 through the whole section. */
  progress: number;
  onClick: () => void;
}) {
  const t = useT(STRINGS);
  const label =
    status === "idle"
      ? t.readAloud
      : status === "preparing"
        ? t.startingReading
        : status === "buffering"
          ? t.bufferingReading
          : status === "paused"
            ? t.resumeReading
            : status === "error"
              ? t.readingFailed
              : t.pauseReading;

  const active = status !== "idle" && status !== "error";
  const failed = status === "error";
  const waiting = status === "preparing" || status === "buffering";
  // Pause bars mean "clicking stops it". While a clip is on the wire nothing
  // is playing yet, so they would be a lie — the old control made exactly this
  // distinction and it is worth keeping.
  const showPause = status === "playing" || status === "buffering";
  const tint = failed ? color.dangerInk : BLUE;

  // The gauge rides *outside* the 26px button, in a 34px box. Inside it, an
  // accent arc on an accent fill is invisible — which is exactly how the first
  // cut of this control shipped in a screenshot and read as "no progress at
  // all". Out here it sits on paper and has something to contrast with.
  const R = 15;
  const CIRC = 2 * Math.PI * R;
  const shown = Math.min(Math.max(progress, 0), 1);

  return (
    <button
      className="at-press"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        // The gauge needs room to sit outside the circle without nudging the
        // kicker row, so the button reserves it as margin rather than width.
        margin: 4,
        borderRadius: "50%",
        border: `1px solid ${active || failed ? tint : color.hairlineStrong}`,
        background: active ? tint : color.card,
        cursor: "pointer",
        transition: transition(["background", "border-color"], "fast"),
      }}
    >
      {(active || failed) && (
        <svg
          width="34"
          height="34"
          viewBox="0 0 34 34"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -5,
            // The arc has to start at twelve o'clock; SVG starts at three.
            transform: "rotate(-90deg)",
          }}
        >
          {/* The groove. Without it a part-filled arc reads as a broken ring
              rather than as a measure of something. */}
          <circle
            cx="17"
            cy="17"
            r={R}
            fill="none"
            stroke={color.hairlineStrong}
            strokeWidth="2"
          />
          {shown > 0 && (
            <circle
              cx="17"
              cy="17"
              r={R}
              fill="none"
              stroke={tint}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - shown)}
              // A transition, not an animation: it is the one piece of motion
              // here that still means something when the learner has asked for
              // less of it, and `prefers-reduced-motion` leaves it alone.
              style={{ transition: transition("stroke-dashoffset", "fast") }}
            />
          )}
        </svg>
      )}
      {waiting && (
        // The wait, as its own layer over the gauge: a quarter-arc going round
        // says "no idea how long" without overwriting the progress already
        // earned — which is the difference between starting a section and
        // running dry between two paragraphs of one.
        <svg
          width="34"
          height="34"
          viewBox="0 0 34 34"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -5,
            transformOrigin: "center",
            animation: `ringSpin ${motion.duration.deliberate * 2}ms linear infinite`,
          }}
        >
          <circle
            cx="17"
            cy="17"
            r={R}
            fill="none"
            stroke={tint}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${CIRC * 0.22} ${CIRC}`}
          />
        </svg>
      )}
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M1.4 5.2h2.4L7.2 2.3v9.4L3.8 8.8H1.4z"
          fill={active ? color.accentInk : tint}
        />
        {showPause ? (
          <>
            <rect
              x="9.3"
              y="4.4"
              width="1.4"
              height="5.2"
              rx="0.6"
              fill={color.accentInk}
            />
            <rect
              x="11.6"
              y="4.4"
              width="1.4"
              height="5.2"
              rx="0.6"
              fill={color.accentInk}
            />
          </>
        ) : (
          // The wave arcs are the "this will make sound" promise. They go quiet
          // while a clip loads, because nothing is coming out yet.
          !waiting && (
            <path
              d="M9.6 4.9a3 3 0 0 1 0 4.2M11.6 3.2a5.6 5.6 0 0 1 0 7.6"
              stroke={active ? color.accentInk : tint}
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          )
        )}
      </svg>
    </button>
  );
}

/** The worked example that closes each section's prose — material, not an
 *  on-demand rewrite the learner has to go hunting for. */
