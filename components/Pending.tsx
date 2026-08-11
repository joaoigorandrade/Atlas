"use client";

import { color, motion } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";

/**
 * The app's one loading mark: three ink dots keeping time. Sits inline in
 * buttons and captions wherever work is in flight.
 */
export function InkDots({
  size = 4,
  tone = color.inkGhost,
}: {
  size?: number;
  tone?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        gap: size,
        alignItems: "center",
        verticalAlign: "middle",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: tone,
            animation: `inkDot 1.2s ${(i * 0.16).toFixed(2)}s ease-in-out infinite`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Prose arriving token by token: what has been written so far, with a blinking
 * nib after it — and the ink dots while it is still empty, since a lone caret
 * on a blank line doesn't read as "working".
 *
 * Every surface that renders a streamed answer uses this, so "still writing"
 * looks the same in the tutor's bubble, the teach-back and the passage aside.
 */
export function StreamingText({
  text,
  writing,
  size = 4,
}: {
  text: string;
  /** More is coming. False once the final frame has landed. */
  writing: boolean;
  size?: number;
}) {
  if (!writing) return <>{text}</>;
  if (!text) return <InkDots size={size} />;
  return (
    <>
      {text}
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: "0.42em",
          height: "1em",
          marginLeft: 2,
          verticalAlign: "-0.12em",
          background: color.accent,
          animation: "inkCaret 1.1s ease-in-out infinite",
        }}
      />
    </>
  );
}

/** Indeterminate hairline — an ink stroke drawn across the page, and again. */
export function InkRule({
  width = 210,
  tone = color.accent,
}: {
  width?: number | string;
  tone?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        width,
        height: 1.5,
        margin: "0 auto",
        borderRadius: 1,
        background: color.hairline,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "32%",
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
          animation: "inkSweep 1.7s cubic-bezier(0.45,0,0.25,1) infinite",
        }}
      />
    </div>
  );
}

/**
 * The shape of prose that is still being written — a stack of bars washing with
 * ink, sized like the paragraph each one stands in for.
 *
 * A blank page reads as broken; a shape of what's coming reads as in progress.
 * Under reduced motion the bars stay, still and legible, without the wash: the
 * information is the layout, not the movement.
 */
export function SkeletonBars({
  widths,
  heights,
}: {
  widths: (number | string)[];
  /** Per-bar height, or one height for all of them. */
  heights: number | number[];
}) {
  const reduced = useReducedMotion();
  return (
    <>
      {widths.map((w, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            height: Array.isArray(heights) ? heights[i] : heights,
            width: w,
            borderRadius: 5,
            background: reduced
              ? "rgba(44,40,35,0.08)"
              : `linear-gradient(90deg, rgba(44,40,35,0.06) 30%, rgba(44,40,35,0.13) 50%, rgba(44,40,35,0.06) 70%)`,
            backgroundSize: "200% 100%",
            animation: reduced
              ? undefined
              : `shimmer 1.6s ${motion.ease.standard} infinite`,
            // Staggered so the stack reads as one sweep down the page rather
            // than five bars blinking in unison.
            animationDelay: `${(i * 0.12).toFixed(2)}s`,
          }}
        />
      ))}
    </>
  );
}
