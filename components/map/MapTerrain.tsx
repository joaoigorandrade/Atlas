"use client";

// The ground the map is drawn on, as SVG layers inside the canvas's transformed
// layer — so all of it pans and zooms with the concepts on it.
//
// - `Terrain`: the graticule and one meridian per depth stage.
// - `Land`: the concepts as a hand-coloured war map — each one a territory,
//   grouped into countries named in spaced capitals, washed in as the learner
//   wins them (`atlasTerrain.ts`).
// - `Fog`: a paper veil over whatever hasn't been reached. Holes open around
//   every lit concept, and — transiently — around whatever the learner is
//   looking at: the hovered chain, the locked path, the search matches.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { color, font, map } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { type AtlasInput, type Spot } from "@/components/map/atlasTerrain";
import { type Bounds, type Pt } from "@/components/map/mapGeometry";
import type { Territory } from "@/components/map/useMapPointer";

const STRINGS = {
  en: { stage: (n: string) => `Stage ${n}` },
  "pt-BR": { stage: (n: string) => `Etapa ${n}` },
} as const;

/** How far past the outermost concepts the ground and the fog extend. */
const MARGIN = 2400;
/** Bitmap pixels per map unit for the atlas — soft ground needs few. */
const LAND_RES = 0.5;

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

/**
 * The concepts' territories as a generated atlas (`atlasTerrain.ts`), baked
 * in a worker into a canvas — repainted only when its inputs change and never
 * mid-drag, the same bargain as `Baked`, without an SVG filter. Each country's
 * name is set where the bake found open country for it; `territory` is kept
 * pointed at the last bake, so a click resolves to the territory drawn.
 */
export function Land({
  frozen,
  bounds,
  territory,
  ...input
}: AtlasInput & {
  bounds: Bounds;
  frozen: boolean;
  territory: React.RefObject<Territory | null>;
}) {
  const { names } = input;
  const r = region(bounds, 600);
  const out = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker>(null);
  const sent = useRef("");
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const w = Math.round(r.width * LAND_RES);
  const h = Math.round(r.height * LAND_RES);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
      sent.current = ""; // a remount (StrictMode) must bake again
    },
    [],
  );
  useEffect(() => {
    if (frozen) return;
    const key = JSON.stringify([
      r,
      input.positions,
      input.display,
      input.edges,
      input.region,
      names,
    ]);
    if (key === sent.current) return;
    sent.current = key;
    worker.current ??= new Worker(new URL("./atlas.worker.ts", import.meta.url));
    worker.current.onmessage = ({ data }) => {
      const ctx = out.current?.getContext("2d");
      if (!ctx || data.key !== sent.current) return; // a newer bake is on its way
      ctx.putImageData(data.img, 0, 0);
      setSpots(data.spots);
      const { prov, lit } = data as { prov: Int16Array; lit: string[] };
      territory.current = (p) => {
        const i = Math.floor((p.x - r.x) * LAND_RES);
        const j = Math.floor((p.y - r.y) * LAND_RES);
        return i < 0 || j < 0 || i >= w || j >= h ? undefined : lit[prov[j * w + i]];
      };
    };
    worker.current.postMessage({ key, input, x0: r.x, y0: r.y, w, h, res: LAND_RES });
  });
  return (
    <>
      <canvas
        ref={out}
        width={w}
        height={h}
        style={{
          position: "absolute",
          left: r.x,
          top: r.y,
          width: r.width,
          height: r.height,
          pointerEvents: "none",
        }}
      />
      {Object.entries(spots).map(([k, p]) => (
        // Set like a country on an engraved atlas (laid out by `labelFor`).
        <div
          key={k}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            transform: "translate(-50%, -50%)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            fontFamily: font.serif,
            fontSize: p.size,
            fontWeight: 600,
            letterSpacing: p.spacing,
            textTransform: "uppercase",
            color: map.countryInk,
          }}
        >
          {names[k]}
        </div>
      ))}
    </>
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
