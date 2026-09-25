"use client";

// The map's instruments, in the corner the way a printed map keeps its scale
// and its compass: zoom in and out, a compass rose that frames the whole map,
// an overview of every concept with the part on screen outlined (click or drag
// it to move there), and a scale ruler. The "how to drive this" line that
// used to run along the bottom of the canvas lives behind the "?".

import { useRef } from "react";
import { STATE_COLOR, type ConceptEdge, type NodeState } from "@/lib/curriculum";
import { color, figures, map, motion, transition } from "@/lib/theme";
import { plateStyle } from "@/components/ui/Plate";
import { CompassRose, ScaleBar } from "@/components/ui/Ornaments";
import { useT } from "@/lib/i18n";
import HoverHint from "@/components/HoverHint";
import {
  fitView,
  mapBounds,
  zoomAt,
  type Pt,
  type ViewTransform,
} from "@/components/map/mapGeometry";

const STRINGS = {
  en: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Frame the whole map",
    overview: "Overview — click or drag to move there",
    hint: "Scroll to zoom · drag the paper to pan · drag a concept to move it · double-click a lit concept to begin",
  },
  "pt-BR": {
    zoomIn: "Aproximar",
    zoomOut: "Afastar",
    fit: "Enquadrar o mapa todo",
    overview: "Visão geral — clique ou arraste para ir até lá",
    hint: "Role para dar zoom · arraste o papel para mover · arraste um conceito para reposicioná-lo · dê dois cliques num conceito aceso para começar",
  },
} as const;

const MINI = { w: 176, h: 108, pad: 70 } as const;

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export default function MapControls({
  ids,
  edges,
  positions,
  display,
  view,
  box,
  insets,
  onView,
}: {
  ids: string[];
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  view: ViewTransform;
  box: { w: number; h: number };
  /** The rails and bars laid over the canvas — the visible part is inside. */
  insets: Insets;
  onView: (view: ViewTransform) => void;
}) {
  const t = useT(STRINGS);
  const bounds = mapBounds(positions, ids);
  const free = {
    x: insets.left + (box.w - insets.left - insets.right) / 2,
    y: insets.top + (box.h - insets.top - insets.bottom) / 2,
  };
  const zoom = (factor: number) => onView(zoomAt(view, factor, free.x, free.y));
  const fit = () => bounds && onView(fitView(bounds, box, insets));

  // The overview maps the concepts' box, padded, into a fixed frame.
  const b = bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const k = Math.min(
    MINI.w / (b.maxX - b.minX + MINI.pad * 2),
    MINI.h / (b.maxY - b.minY + MINI.pad * 2),
  );
  const ox = (MINI.w - (b.maxX - b.minX) * k) / 2 - b.minX * k;
  const oy = (MINI.h - (b.maxY - b.minY) * k) / 2 - b.minY * k;
  const mx = (x: number) => ox + x * k;
  const my = (y: number) => oy + y * k;
  const port = {
    x: mx((insets.left - view.x) / view.scale),
    y: my((insets.top - view.y) / view.scale),
    w: ((box.w - insets.left - insets.right) / view.scale) * k,
    h: ((box.h - insets.top - insets.bottom) / view.scale) * k,
  };

  const dragging = useRef(false);
  const moveTo = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left - ox) / k;
    const y = (e.clientY - r.top - oy) / k;
    onView({ x: free.x - x * view.scale, y: free.y - y * view.scale, scale: view.scale });
  };

  const button = (label: string, onClick: () => void, glyph: React.ReactNode) => (
    <button
      className="at-press at-tint"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "transparent",
        color: color.inkSoft,
        fontSize: 18,
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      {glyph}
    </button>
  );

  // A plate pasted over the chart. Opaque: a blurred glass here was re-blurred
  // on every frame of every pan.
  const panel = {
    ...plateStyle,
    boxShadow: "0 8px 22px rgba(43,33,24,0.16)",
  } as const;

  return (
    <div
      data-testid="map-controls"
      // A press here is not a press on the paper: it must not pan the map or
      // drop the selection.
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        right: 18,
        // Slides clear of the detail rail on the compositor, not by `right`.
        transform: `translateX(${-insets.right}px)`,
        // Clear of the session timer that sits in the corner.
        bottom: 58,
        zIndex: 12,
        display: "flex",
        alignItems: "flex-end",
        gap: 10,
        transition: transition("transform", "slow", "enter"),
        animation: `softIn ${motion.duration.slow}ms ${motion.ease.enter} both`,
      }}
    >
      <div style={{ ...panel, padding: "9px 10px 7px" }}>
        <svg
          role="img"
          aria-label={t.overview}
          width={MINI.w}
          height={MINI.h}
          style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            moveTo(e);
          }}
          onPointerMove={(e) => dragging.current && moveTo(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          {edges.map(([a, z], i) =>
            positions[a] && positions[z] ? (
              <line
                key={i}
                x1={mx(positions[a].x)}
                y1={my(positions[a].y)}
                x2={mx(positions[z].x)}
                y2={my(positions[z].y)}
                stroke={map.track}
                strokeWidth={1}
              />
            ) : null,
          )}
          {ids.map((id) =>
            positions[id] ? (
              <circle
                key={id}
                cx={mx(positions[id].x)}
                cy={my(positions[id].y)}
                r={display[id] === "frontier" ? 3.4 : 2.6}
                fill={STATE_COLOR[display[id] ?? "unknown"]}
              />
            ) : null,
          )}
          <rect
            x={port.x}
            y={port.y}
            width={Math.max(port.w, 4)}
            height={Math.max(port.h, 4)}
            rx={3}
            fill="rgba(43,33,24,0.05)"
            stroke={color.ink}
            strokeOpacity={0.55}
            strokeWidth={1.2}
          />
        </svg>
        {/* The ruler: a hundred map units at the current zoom. */}
        <div
          aria-hidden
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...figures,
            fontSize: 12,
            color: color.inkFaint,
          }}
        >
          <ScaleBar scale={view.scale} />
          {Math.round(view.scale * 100)}%
          <span style={{ flex: 1 }} />
          <HoverHint place="top" hint={t.hint}>
            <span
              style={{
                display: "inline-flex",
                width: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: `1px solid ${color.hairlineStrong}`,
                color: color.inkMuted,
                cursor: "help",
              }}
            >
              ?
            </span>
          </HoverHint>
        </div>
      </div>

      <div style={{ ...panel, display: "flex", flexDirection: "column", padding: 3 }}>
        {button(t.fit, fit, <CompassRose size={22} />)}
        <span style={{ height: 1, margin: "2px 6px", background: color.hairline }} />
        {button(t.zoomIn, () => zoom(1.2), "+")}
        {button(t.zoomOut, () => zoom(1 / 1.2), "−")}
      </div>
    </div>
  );
}
