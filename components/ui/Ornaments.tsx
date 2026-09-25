"use client";

import type { CSSProperties } from "react";
import { color, font, motion } from "@/lib/theme";

/**
 * The engraver's ornaments. All inline SVG and flat fills — no filters, so
 * each one costs what a glyph costs, wherever it sits.
 */

/** An eight-point compass rose, north struck in the accent. */
export function CompassRose({
  size = 20,
  north = color.accent,
  ink = color.ink,
}: {
  size?: number;
  north?: string;
  ink?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden>
      <circle r={9.2} fill="none" stroke={ink} strokeWidth={0.7} />
      <circle
        r={7.6}
        fill="none"
        stroke={ink}
        strokeWidth={0.35}
        strokeDasharray="0.6 0.9"
      />
      {/* The half-winds, behind. */}
      <path
        d="M0,0 L4.6,-4.6 L1.1,0 Z M0,0 L4.6,4.6 L0,1.1 Z M0,0 L-4.6,4.6 L-1.1,0 Z M0,0 L-4.6,-4.6 L0,-1.1 Z"
        fill={ink}
        opacity={0.45}
      />
      {/* The cardinal points: each a light and a dark facet, as engraved. */}
      <path
        d="M0,-9 L1.8,0 L0,0 Z M9,0 L0,1.8 L0,0 Z M0,9 L-1.8,0 L0,0 Z M-9,0 L0,-1.8 L0,0 Z"
        fill={ink}
      />
      <path
        d="M0,-9 L-1.8,0 L0,0 Z M9,0 L0,-1.8 L0,0 Z M0,9 L1.8,0 L0,0 Z M-9,0 L0,1.8 L0,0 Z"
        fill={color.card}
        stroke={ink}
        strokeWidth={0.3}
      />
      <path d="M0,-9 L1.8,0 L-1.8,0 Z" fill={north} />
      <circle r={0.9} fill={ink} />
    </svg>
  );
}

/** A section break: a hairline either side of a printer's flower. */
export function Fleuron({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: color.inkFaint,
        margin: "30px 0",
        ...style,
      }}
    >
      <span style={{ flex: 1, height: 1, background: color.hairlineStrong }} />
      <span style={{ fontFamily: font.display, fontSize: 18, lineHeight: 1 }}>❦</span>
      <span style={{ flex: 1, height: 1, background: color.hairlineStrong }} />
    </div>
  );
}

/**
 * A surveyor's scale bar in alternating ink and paper. `scale` stretches it on
 * the compositor (`scaleX`) — the ruler used to animate its `width`, a layout
 * change on every zoom step.
 */
export function ScaleBar({ scale, unit = 60 }: { scale: number; unit?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: unit,
        height: 5,
        border: `1px solid ${color.inkSoft}`,
        background: `repeating-linear-gradient(90deg, ${color.inkSoft} 0 25%, ${color.card} 25% 50%)`,
        transformOrigin: "0 50%",
        transform: `scaleX(${scale})`,
        transition: `transform ${motion.duration.fast}ms ${motion.ease.standard}`,
      }}
    />
  );
}

// A scalloped disc: sixteen lobes around a round face, like wax pressed out
// from under a seal.
const LOBES = 16;
const SEAL_PATH = (() => {
  let d = "";
  for (let i = 0; i <= LOBES * 2; i++) {
    const a = (i / (LOBES * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 10 : 8.9;
    d += `${i === 0 ? "M" : "L"}${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }
  return d + "Z";
})();

/**
 * A wax seal: what the atlas presses onto a concept once it is mastered.
 * `stamp` plays the pressing (the existing `stamp` keyframe — scale and a
 * twist, compositor-only); otherwise it simply sits there.
 */
export function WaxSeal({
  size = 18,
  wax = color.rubric,
  stamp,
  style,
}: {
  size?: number;
  wax?: string;
  stamp?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-11 -11 22 22"
      aria-hidden
      style={{
        display: "block",
        overflow: "visible",
        animation: stamp
          ? `stamp ${motion.duration.deliberate}ms ${motion.ease.spring} both`
          : undefined,
        ...style,
      }}
    >
      <path d={SEAL_PATH} fill={wax} transform="translate(0.5 0.8)" opacity={0.35} />
      <path d={SEAL_PATH} fill={wax} />
      {/* The pressed face: a sunken ring, lit from the top-left. */}
      <circle r={6.4} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth={1.1} />
      <circle
        r={6.4}
        fill="none"
        stroke="rgba(255,235,210,0.3)"
        strokeWidth={0.6}
        transform="translate(-0.5 -0.5)"
      />
      {/* The device: a small compass star. */}
      <path d="M0,-4 L1,-1 L4,0 L1,1 L0,4 L-1,1 L-4,0 L-1,-1 Z" fill="rgba(0,0,0,0.3)" />
      <path
        d="M0,-4 L1,-1 L4,0 L1,1 L0,4 L-1,1 L-4,0 L-1,-1 Z"
        fill="rgba(255,235,210,0.28)"
        transform="translate(-0.35 -0.35)"
      />
      <ellipse
        cx={-3.6}
        cy={-4.4}
        rx={2.2}
        ry={1.1}
        fill="rgba(255,240,220,0.35)"
        transform="rotate(-35)"
      />
    </svg>
  );
}
