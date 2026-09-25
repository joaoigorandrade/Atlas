"use client";

// The ground the map is drawn on, as SVG layers inside the canvas's transformed
// layer — so all of it pans and zooms with the concepts on it.
//
// - `Terrain`: the graticule, one meridian per depth stage, and the learned
//   territory. Every concept the learner has worked on puts down a disc of its
//   mastery colour, every road between two of them a broad stroke, and one
//   blur-then-threshold filter melts them into land masses with a contour line
//   round the coast. Mastered ground gets a second, higher level on top. It is
//   the "territory mastered" number drawn as a place.
// - `Fog`: a paper veil over whatever hasn't been reached. Holes open around
//   every lit concept, and — transiently — around whatever the learner is
//   looking at: the hovered chain, the locked path, the search matches.

import { STATE_COLOR, type ConceptEdge, type NodeState } from "@/lib/curriculum";
import { color, font, map, motion } from "@/lib/theme";
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

export function Terrain({
  ids,
  edges,
  positions,
  display,
  bounds,
  stages,
  land,
}: {
  ids: string[];
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  bounds: Bounds;
  stages: { g: number; x: number }[];
  /** Off while the map is still being drawn — nothing has been learned yet. */
  land: boolean;
}) {
  const r = region(bounds, 600);
  const grow = `r ${motion.duration.deliberate}ms ${motion.ease.spring}, opacity ${motion.duration.slow}ms ${motion.ease.standard}`;
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
          <feMorphology in="mass" operator="dilate" radius={9} result="outer" />
          <feMorphology in="mass" operator="dilate" radius={7.6} result="inner" />
          <feComposite in="outer" in2="inner" operator="out" result="line" />
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

      {land &&
        // Two levels: everything worked on, then mastered ground on top of it —
        // the second contour is what makes it read as elevation.
        [false, true].map((summit) => (
          <g key={String(summit)} filter="url(#atlas-land)">
            {edges.map(([a, b, dashed], i) => {
              const pa = positions[a];
              const pb = positions[b];
              const on = summit
                ? display[a] === "mastered" && display[b] === "mastered"
                : !dashed && LAND[display[a]] && LAND[display[b]];
              if (!pa || !pb) return null;
              return (
                <path
                  key={i}
                  d={edgePath(pa, pb)}
                  fill="none"
                  stroke={LAND[display[b]] ?? STATE_COLOR.mastered}
                  strokeWidth={summit ? 30 : 64}
                  strokeLinecap="round"
                  opacity={on ? 1 : 0}
                  style={{ transition: grow }}
                />
              );
            })}
            {ids.map((id) => {
              const p = positions[id];
              const tint = LAND[display[id]];
              const on = summit ? display[id] === "mastered" : Boolean(tint);
              if (!p) return null;
              return (
                <circle
                  key={id}
                  cx={p.x}
                  cy={p.y}
                  r={on ? (summit ? 46 : 84) : 0}
                  fill={tint ?? STATE_COLOR.mastered}
                  style={{ transition: grow }}
                />
              );
            })}
          </g>
        ))}
    </>
  );
}

export function Fog({
  ids,
  positions,
  clear,
  bounds,
  stages,
  on,
}: {
  ids: string[];
  positions: Record<string, Pt>;
  /** Which concepts the fog opens around. */
  clear: (id: string) => boolean;
  bounds: Bounds;
  stages: { g: number; x: number; label: string }[];
  /** Only on the map itself: while building, nothing is charted *or* uncharted. */
  on: boolean;
}) {
  const t = useT(STRINGS);
  const whole = region(bounds, MARGIN);
  return (
    <>
      {on && (
        <>
          <defs>
            <filter
              id="atlas-fog-soft"
              filterUnits="userSpaceOnUse"
              {...region(bounds, 600)}
            >
              <feGaussianBlur stdDeviation={46} />
            </filter>
            <mask id="atlas-fog" maskUnits="userSpaceOnUse" {...whole}>
              <rect {...whole} fill="white" />
              <g filter="url(#atlas-fog-soft)">
                {ids.map((id) => {
                  const p = positions[id];
                  if (!p) return null;
                  return (
                    <circle
                      key={id}
                      cx={p.x}
                      cy={p.y}
                      r={clear(id) ? 150 : 0}
                      fill="black"
                      style={{
                        transition: `r ${motion.duration.slow}ms ${motion.ease.enter}`,
                      }}
                    />
                  );
                })}
              </g>
            </mask>
          </defs>
          <rect {...whole} fill={map.fog} mask="url(#atlas-fog)" />
        </>
      )}
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
