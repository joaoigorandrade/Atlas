"use client";

// The ground the map is drawn on, as SVG layers inside the canvas's transformed
// layer — so all of it pans and zooms with the concepts on it.
//
// - `Terrain`: the graticule and one meridian per depth stage.
// - `Land`: the learned territory. Every concept the learner has worked on puts down a disc of its
//   mastery colour, every road between two of them a broad stroke, and one
//   blur-then-threshold filter melts them into land masses with a contour line
//   round the coast. Mastered ground gets a second, higher level on top. It is
//   the "territory mastered" number drawn as a place.
// - `Fog`: a paper veil over whatever hasn't been reached. Holes open around
//   every lit concept, and — transiently — around whatever the learner is
//   looking at: the hovered chain, the locked path, the search matches.

import { useEffect, useRef, type ReactNode } from "react";
import { STATE_COLOR, type ConceptEdge, type NodeState } from "@/lib/curriculum";
import { color, font, map } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { edgePath, type Bounds, type Pt } from "@/components/map/mapGeometry";

const STRINGS = {
  en: { stage: (n: string) => `Stage ${n}` },
  "pt-BR": { stage: (n: string) => `Etapa ${n}` },
} as const;

/** How far past the outermost concepts the ground and the fog extend. */
const MARGIN = 2400;
const LAND: Partial<Record<NodeState, string>> = {
  learning: STATE_COLOR.learning,
  shaky: STATE_COLOR.shaky,
  mastered: STATE_COLOR.mastered,
};

const region = (b: Bounds, m: number) => ({
  x: b.minX - m,
  y: b.minY - m,
  width: b.maxX - b.minX + m * 2,
  height: b.maxY - b.minY + m * 2,
});

type Box = ReturnType<typeof region>;

/**
 * SVG drawn once into a bitmap, redrawn only when its markup changes. Safari
 * runs SVG filters and masks on the CPU and re-runs them on every pan and zoom
 * frame over the whole map; a bitmap is only moved. `res` is bitmap pixels per
 * map unit — the land and the fog are soft, so less than 1 costs nothing.
 */
function Baked({
  box,
  res,
  frozen,
  children,
}: {
  box: Box;
  res: number;
  /** Mid-drag: hold the last bitmap and bake once on release, not per frame. */
  frozen: boolean;
  children: ReactNode;
}) {
  const src = useRef<SVGSVGElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const drawn = useRef("");
  const w = Math.round(box.width * res);
  const h = Math.round(box.height * res);
  useEffect(() => {
    if (frozen) return;
    const vb = `${box.x} ${box.y} ${box.width} ${box.height}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${src.current?.innerHTML ?? ""}</svg>`;
    if (svg === drawn.current) return;
    drawn.current = svg;
    const img = new Image();
    img.onload = () => {
      const ctx = out.current?.getContext("2d");
      if (!ctx || drawn.current !== svg) return;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  return (
    <>
      <svg ref={src} style={{ display: "none" }}>
        {children}
      </svg>
      <canvas
        ref={out}
        width={w}
        height={h}
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          pointerEvents: "none",
        }}
      />
    </>
  );
}

/** The graticule and one meridian per depth stage — plain strokes, drawn live. */
export function Terrain({
  bounds,
  stages,
}: {
  bounds: Bounds;
  stages: { g: number; x: number }[];
}) {
  return (
    <>
      <defs>
        <pattern
          id="atlas-graticule"
          patternUnits="userSpaceOnUse"
          width={130}
          height={130}
        >
          <path d="M130 0H0V130" fill="none" stroke={map.graticule} strokeWidth={1} />
          <circle cx={65} cy={65} r={0.9} fill={map.graticule} />
        </pattern>
      </defs>

      <rect {...region(bounds, MARGIN)} fill="url(#atlas-graticule)" />

      {stages.map((s) => (
        <line
          key={s.g}
          x1={s.x}
          x2={s.x}
          y1={bounds.minY - 96}
          y2={bounds.maxY + 110}
          stroke={map.meridian}
          strokeWidth={1}
          strokeDasharray="2 7"
        />
      ))}
    </>
  );
}

/** The learned territory, baked (see `Baked`). */
export function Land({
  ids,
  edges,
  positions,
  display,
  bounds,
  frozen,
}: {
  ids: string[];
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  bounds: Bounds;
  frozen: boolean;
}) {
  const r = region(bounds, 600);
  return (
    <Baked box={r} res={0.5} frozen={frozen}>
      <defs>
        <filter
          id="atlas-land"
          filterUnits="userSpaceOnUse"
          {...r}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={20} result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11"
            result="mass"
          />
          {/* The coast: a second, lower threshold of the same blur, minus the land. */}
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -9.6"
            result="outer"
          />
          <feComposite in="outer" in2="mass" operator="out" result="line" />
          <feComponentTransfer in="mass" result="fill">
            <feFuncA type="linear" slope={0.13} />
          </feComponentTransfer>
          <feComponentTransfer in="line" result="coast">
            <feFuncA type="linear" slope={0.5} />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="fill" />
            <feMergeNode in="coast" />
          </feMerge>
        </filter>
      </defs>
      {/* Two levels: everything worked on, then mastered ground on top of it —
          the second contour is what makes it read as elevation. */}
      {[false, true].map((summit) => (
        <g key={String(summit)} filter="url(#atlas-land)">
          {edges.map(([a, b, dashed], i) => {
            const pa = positions[a];
            const pb = positions[b];
            const on = summit
              ? display[a] === "mastered" && display[b] === "mastered"
              : !dashed && LAND[display[a]] && LAND[display[b]];
            if (!pa || !pb || !on) return null;
            return (
              <path
                key={i}
                d={edgePath(pa, pb)}
                fill="none"
                stroke={LAND[display[b]] ?? STATE_COLOR.mastered}
                strokeWidth={summit ? 30 : 64}
                strokeLinecap="round"
              />
            );
          })}
          {ids.map((id) => {
            const p = positions[id];
            const tint = LAND[display[id]];
            const on = summit ? display[id] === "mastered" : Boolean(tint);
            if (!p || !on) return null;
            return (
              <circle key={id} cx={p.x} cy={p.y} r={summit ? 46 : 84} fill={tint} />
            );
          })}
        </g>
      ))}
    </Baked>
  );
}

/** A paper veil over what hasn't been reached, baked (see `Baked`). */
export function Fog({
  ids,
  positions,
  clear,
  bounds,
  frozen,
}: {
  ids: string[];
  positions: Record<string, Pt>;
  /** Which concepts the fog opens around. */
  clear: (id: string) => boolean;
  bounds: Bounds;
  frozen: boolean;
}) {
  const whole = region(bounds, MARGIN);
  return (
    <Baked box={whole} res={0.25} frozen={frozen}>
      <defs>
        <radialGradient id="atlas-fog-hole">
          <stop offset="0.45" stopColor="black" />
          <stop offset="1" stopColor="black" stopOpacity={0} />
        </radialGradient>
        <mask id="atlas-fog" maskUnits="userSpaceOnUse" {...whole}>
          <rect {...whole} fill="white" />
          {ids.map((id) => {
            const p = positions[id];
            if (!p || !clear(id)) return null;
            return (
              <circle key={id} cx={p.x} cy={p.y} r={220} fill="url(#atlas-fog-hole)" />
            );
          })}
        </mask>
      </defs>
      <rect {...whole} fill={map.fog} mask="url(#atlas-fog)" />
    </Baked>
  );
}

export function StageLabels({
  bounds,
  stages,
}: {
  bounds: Bounds;
  stages: { g: number; x: number; label: string }[];
}) {
  const t = useT(STRINGS);
  return (
    <>
      {stages.map((s) => (
        <text
          key={s.g}
          x={s.x}
          y={bounds.minY - 108}
          textAnchor="middle"
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fill: color.inkGhost,
          }}
        >
          {t.stage(s.label)}
        </text>
      ))}
    </>
  );
}
