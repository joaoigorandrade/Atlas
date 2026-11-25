"use client";

import type { CSSProperties } from "react";
import { color } from "@/lib/theme";

/**
 * The app's full-screen waits, drawn as an engraver would: one plate per
 * context. The compass while Atlas finds its bearings (boot), a coast being
 * charted while a map is made, a quill while something is written.
 *
 * Every stroke is `pathLength={1}` so one `engrave` keyframe draws any of
 * them; each animation runs `alternate` (or ends drawn), so the blanket
 * reduced-motion rule in globals.css leaves the finished engraving, still.
 * Only `stroke-dashoffset`, `transform`, `opacity` and `offset-distance`
 * move — no filters or masks (Safari).
 */

const engrave = (delay: number, period = 3.2): CSSProperties => ({
  strokeDasharray: 1,
  strokeDashoffset: 1,
  animation: `engrave ${period}s ${delay}s cubic-bezier(0.45,0,0.25,1) infinite alternate both`,
});

const fillIn = (delay: number, period = 3.2): CSSProperties => ({
  animation: `inkFill ${period}s ${delay}s ease-in-out infinite alternate both`,
});

const ring = (r: number, c = 50) =>
  `M${c - r} ${c}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
};

/** One point of the rose: the full lozenge, and its shaded left half. */
const point = (deg: number, length: number, shoulder: number) => ({
  outline: `M50 50L${polar(deg - 45, shoulder)}L${polar(deg, length)}L${polar(deg + 45, shoulder)}Z`,
  shade: `M50 50L${polar(deg - 45, shoulder)}L${polar(deg, length)}Z`,
});

const CARDINALS = [0, 90, 180, 270].map((d) => point(d, 38, 7));
const ORDINALS = [45, 135, 225, 315].map((d) => point(d, 24, 5));

/** Boot: a compass rose engraving itself, its needle seeking north. */
export function CompassRose({ size = 88 }: { size?: number }) {
  const line = { fill: "none", strokeLinejoin: "round" as const };
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ overflow: "visible" }}
    >
      <path
        d={ring(47)}
        {...line}
        stroke={color.inkSoft}
        strokeWidth={0.9}
        pathLength={1}
        style={engrave(0)}
      />
      <path
        d={ring(42)}
        {...line}
        stroke={color.inkFaint}
        strokeWidth={0.6}
        pathLength={1}
        style={engrave(0.15)}
      />
      {/* The degree ring: struck as dots once the two rules are cut. */}
      <path
        d={ring(44.5)}
        fill="none"
        stroke={color.inkGhost}
        strokeWidth={2.2}
        strokeDasharray="0.4 2.2"
        style={fillIn(0.3)}
      />
      {ORDINALS.map((p, i) => (
        <g key={i}>
          <path d={p.shade} fill={color.inkGhost} style={fillIn(0.6 + i * 0.08)} />
          <path
            d={p.outline}
            {...line}
            stroke={color.inkFaint}
            strokeWidth={0.7}
            pathLength={1}
            style={engrave(0.4 + i * 0.08)}
          />
        </g>
      ))}
      {CARDINALS.map((p, i) => (
        <g key={i}>
          <path
            d={p.shade}
            // North is the gilt point, laid last, as the colourist would.
            fill={i === 0 ? color.gilt : color.inkSoft}
            style={fillIn(i === 0 ? 1.15 : 0.8 + i * 0.1)}
          />
          <path
            d={p.outline}
            {...line}
            stroke={color.ink}
            strokeWidth={0.9}
            pathLength={1}
            style={engrave(i === 0 ? 0.95 : 0.6 + i * 0.1)}
          />
        </g>
      ))}
      <g
        style={{
          transformOrigin: "50px 50px",
          animation: "needleSeek 2.6s 1.2s ease-out infinite both",
        }}
      >
        <path d="M50 20L52.2 50L50 54L47.8 50Z" fill={color.rubric} opacity={0.85} />
        <circle
          cx={50}
          cy={50}
          r={2.2}
          fill={color.paper}
          stroke={color.ink}
          strokeWidth={0.8}
        />
      </g>
    </svg>
  );
}

const COAST =
  "M4 36C22 30 34 41 52 34S78 22 98 28S124 40 146 33S176 20 196 27S232 38 256 29";
const ROUTE = "M44 19Q87 3 130 13T216 15";
const SURVEY = [
  [44, 19],
  [130, 13],
  [216, 15],
] as const;

/** Map building: a coast inked in, a route marching between survey points. */
export function ChartingMark({ width = 260 }: { width?: number }) {
  return (
    <svg
      aria-hidden
      width={width}
      height={(width * 48) / 260}
      viewBox="0 0 260 48"
      style={{ display: "block", margin: "0 auto", overflow: "visible" }}
    >
      {/* Sea hatching, the engraver's water lines under the coast. */}
      {[40, 43.5, 47].map((y, i) => (
        <path
          key={y}
          d={`M${18 + i * 14} ${y}H${242 - i * 14}`}
          stroke={color.hairlineStrong}
          strokeWidth={0.7}
          strokeDasharray="14 5"
          style={fillIn(0.5 + i * 0.12, 4)}
        />
      ))}
      <path
        d={COAST}
        fill="none"
        stroke={color.inkSoft}
        strokeWidth={1.1}
        strokeLinecap="round"
        pathLength={1}
        style={engrave(0, 4)}
      />
      <path
        d={ROUTE}
        fill="none"
        stroke={color.rubric}
        strokeWidth={1}
        strokeLinecap="round"
        strokeDasharray="2 4"
        style={{ animation: "routeMarch 0.9s linear infinite" }}
      />
      {SURVEY.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          fill={i === 1 ? color.accent : color.card}
          stroke={color.ink}
          strokeWidth={0.9}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: `survey 4s ${(0.6 + i * 0.45).toFixed(2)}s ease-out infinite alternate both`,
          }}
        />
      ))}
    </svg>
  );
}

const FLOURISH =
  "M6 28C30 28 34 10 52 14S64 32 84 24S110 8 128 18S150 30 170 20S196 14 204 22";

/** Generation: a nib riding a flourish, the line drying and lifting behind it. */
export function QuillMark({ width = 210 }: { width?: number }) {
  const ride = "2.8s cubic-bezier(0.4,0,0.3,1) infinite both";
  return (
    <svg
      aria-hidden
      width={width}
      height={(width * 40) / 210}
      viewBox="0 -8 210 40"
      style={{ display: "block", margin: "0 auto", overflow: "visible" }}
    >
      <g style={{ animation: "quillFade 2.8s linear infinite both" }}>
        <path d="M6 33H204" stroke={color.hairline} strokeWidth={0.7} />
        <path
          d={FLOURISH}
          fill="none"
          stroke={color.ink}
          strokeWidth={1.3}
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: 1, animation: `quillWrite ${ride}` }}
        />
        {/* The nib's tip is its origin, so offset-path sets the tip on the line. */}
        <g
          style={
            {
              offsetPath: `path("${FLOURISH}")`,
              offsetRotate: "0deg",
              offsetAnchor: "0 0",
              animation: `nibRide ${ride}`,
            } as CSSProperties
          }
        >
          <path d="M0 0L2.5 -7L15 -26C13 -15 8 -8 0 0Z" fill={color.inkSoft} />
          <path d="M1.5 -3.5L17 -30" stroke={color.inkFaint} strokeWidth={0.6} />
        </g>
      </g>
    </svg>
  );
}
