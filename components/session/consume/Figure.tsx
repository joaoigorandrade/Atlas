"use client";

import { BLUE, STRINGS } from "./shared";
import { ConsumeFigure, figureLayers } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

// ---- figure rendering ------------------------------------------------------
// The model describes each chunk's figure as boxes + arrows; we lay it out as
// layers (longest path from a root) and draw it. No per-chunk artwork, but the
// picture is actually about the chunk instead of one hardcoded stand-in.

const FIG_W = 300;
const PAD = 12;
const GAP_X = 12;
const GAP_Y = 34;
const LINE_H = 11;
const CHAR_W = 5.1;

// SVG <text> can't hold <Rich>'s HTML span — it renders as an unknown element
// in the SVG namespace, i.e. an empty box. Labels are short, so drop the
// markdown punctuation instead of styling it.
function plain(label: string): string {
  return label.replace(/`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, "$1$2$3$4");
}

function wrap(label: string, boxW: number): string[] {
  const max = Math.max(6, Math.floor((boxW - 10) / CHAR_W));
  const lines: string[] = [];
  let cur = "";
  for (const word of label.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  // ponytail: 3 lines max — longer labels get clipped, prompt caps at 4 words.
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2].slice(0, max - 1)}…`];
  return lines;
}

export function Figure({
  id,
  figure,
  caption,
}: {
  id: string;
  figure: ConsumeFigure;
  /** The diagram's own caption — becomes the figure's accessible name, so a
   *  screen reader gets what the picture is about rather than "graphic". */
  caption: string;
}) {
  const t = useT(STRINGS);
  const layer = figureLayers(figure);
  const rows: (typeof figure.nodes)[number][][] = [];
  for (const n of figure.nodes) {
    const l = layer.get(n.id) ?? 0;
    (rows[l] ??= []).push(n);
  }
  const box = new Map<
    string,
    { x: number; y: number; w: number; h: number; lines: string[] }
  >();
  let y = PAD;
  for (const row of rows) {
    if (!row) continue;
    const w = (FIG_W - 2 * PAD - GAP_X * (row.length - 1)) / row.length;
    const laid = row.map((n) => wrap(plain(n.label), w));
    const h = Math.max(...laid.map((l) => l.length)) * LINE_H + 14;
    row.forEach((n, i) => {
      box.set(n.id, { x: PAD + i * (w + GAP_X), y, w, h, lines: laid[i] });
    });
    y += h + GAP_Y;
  }
  const height = y - GAP_Y + PAD;

  return (
    <svg
      viewBox={`0 0 ${FIG_W} ${height}`}
      role="img"
      aria-labelledby={`figt-${id}`}
      style={{
        width: "100%",
        height: "auto",
        borderRadius: 12,
        border: `1px solid ${color.hairline}`,
        background: color.card,
        display: "block",
      }}
    >
      {/* The accessible name. Without it this is an unlabeled `role="img"` —
          announced as a graphic with nothing in it. */}
      <title id={`figt-${id}`}>{t.figureOf(caption)}</title>
      <defs>
        <marker
          id={`ah-${id}`}
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill={BLUE} />
        </marker>
      </defs>
      {figure.edges.map((e, i) => {
        const a = box.get(e.from);
        const b = box.get(e.to);
        if (!a || !b) return null;
        // Leave each box from the side that faces the other one.
        const [ax, ay] =
          b.y > a.y
            ? [a.x + a.w / 2, a.y + a.h]
            : b.y < a.y
              ? [a.x + a.w / 2, a.y]
              : [b.x > a.x ? a.x + a.w : a.x, a.y + a.h / 2];
        const [bx, by] =
          b.y > a.y
            ? [b.x + b.w / 2, b.y]
            : b.y < a.y
              ? [b.x + b.w / 2, b.y + b.h]
              : [b.x > a.x ? b.x : b.x + b.w, b.y + b.h / 2];
        // Edges that skip a layer bow out to the side so they don't hide
        // under the straight arrows of the main chain.
        const span = Math.abs((layer.get(e.to) ?? 0) - (layer.get(e.from) ?? 0));
        const cx = (ax + bx) / 2 + (span > 1 ? 34 : 0);
        const cy = (ay + by) / 2;
        return (
          <g key={`e${i}`}>
            <path
              d={`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`}
              fill="none"
              stroke={BLUE}
              strokeWidth={1.4}
              markerEnd={`url(#ah-${id})`}
            />
            {e.label && (
              <text
                x={(ax + 2 * cx + bx) / 4 - 4}
                y={(ay + 2 * cy + by) / 4 + 3}
                textAnchor="end"
                fontFamily={font.mono}
                fontSize={8}
                fill={color.inkFaint}
                stroke={color.card}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {plain(e.label)}
              </text>
            )}
          </g>
        );
      })}
      {figure.nodes.map((n) => {
        const b = box.get(n.id);
        if (!b) return null;
        return (
          <g key={n.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={7}
              fill={color.card}
              stroke={BLUE}
              strokeWidth={1.2}
            />
            <text
              textAnchor="middle"
              fontFamily={font.sans}
              fontSize={9.5}
              fill={color.ink}
            >
              {b.lines.map((line, li) => (
                <tspan
                  key={li}
                  x={b.x + b.w / 2}
                  y={
                    b.y + b.h / 2 - ((b.lines.length - 1) * LINE_H) / 2 + li * LINE_H + 3
                  }
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Kickers arrive numbered ("3 · Where it breaks"); the Continue button already
 *  implies the count, so it names the section alone. */
