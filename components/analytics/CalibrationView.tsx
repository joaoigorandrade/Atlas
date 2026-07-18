"use client";

import {
  CALIB_COLOR,
  CALIB_TOPIC,
  CALIB_TREND_COLOR,
  CALIB_VERDICT_LABEL,
  CRUCIBLE_COLOR,
  STATE_COLOR,
  calibCoach,
  calibRows,
  calibUnderLine,
  type CalibItem,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

// Calibration owns the Shaky amber as its surface accent — overconfidence is
// the thing it exists to catch, and Shaky is that state on the map.
const OVER = STATE_COLOR.shaky;

// The curve's plotting frame, matching the design's SVG geometry exactly.
const X0 = 60;
const YB = 400;
const X1 = 438;
const YT = 26;
const W = X1 - X0;
const H = YB - YT;
const px = (c: number) => X0 + (c / 100) * W;
const py = (a: number) => YB - (a / 100) * H;

interface CalibrationViewProps {
  /** Every confidence-vs-performance reading, resolved with verdict + label. */
  items: CalibItem[];
  onExit: () => void;
  /** Tapping an overconfident node jumps to its Crucible to close the real gap. */
  onCloseGap: (nodeId: string) => void;
}

export default function CalibrationView({
  items,
  onExit,
  onCloseGap,
}: CalibrationViewProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.sans,
        fontSize: 15,
        zIndex: 30,
        animation: "softIn 0.3s both",
      }}
    >
      {/* Header — ← Map · Analytics · Calibration */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 58,
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          ← Map
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: OVER,
          }}
        >
          Analytics · Calibration
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, color: color.inkFaint }}>
          Learning to learn — do you know what you actually know?
        </div>
      </div>

      {/* Body — scrolls; curve on the left, readout on the right */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            padding: "34px 32px 120px",
            display: "grid",
            gridTemplateColumns: "512px 1fr",
            gap: 34,
            alignItems: "start",
          }}
        >
          <CurveCard items={items} />
          <Readout items={items} onCloseGap={onCloseGap} />
        </div>
      </div>
    </div>
  );
}

/** The calibration curve: predicted confidence (x) vs. actual performance (y).
 *  Points above the diagonal are underconfident, below are overconfident. */
function CurveCard({ items }: { items: CalibItem[] }) {
  const grid = [25, 50, 75].flatMap((v) => [
    { x1: px(v), y1: YT, x2: px(v), y2: YB },
    { x1: X0, y1: py(v), x2: X1, y2: py(v) },
  ]);
  // "Your tendency": a line from the low-confidence cluster to the high one, so
  // a systematic tilt (overconfident as confidence rises) reads at a glance.
  const low = items.filter((d) => d.felt < 65);
  const high = items.filter((d) => d.felt >= 65);
  const avg = (a: CalibItem[], k: "felt" | "real") =>
    a.reduce((s, d) => s + d[k], 0) / a.length;
  const trend =
    low.length && high.length
      ? {
          x1: px(avg(low, "felt")),
          y1: py(avg(low, "real")),
          x2: px(avg(high, "felt")),
          y2: py(avg(high, "real")),
        }
      : null;

  return (
    <div
      style={{
        background: color.card,
        border: `1px solid ${color.hairline}`,
        borderRadius: 18,
        padding: "26px 26px 22px",
        boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
      }}
    >
      <div style={{ ...kicker(10, "0.14em"), marginBottom: 4 }}>
        Calibration curve
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 21,
          lineHeight: 1.25,
          marginBottom: 16,
        }}
      >
        Predicted confidence vs. what actually happened
      </div>

      <svg viewBox="0 0 470 440" style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Overconfident (below diagonal) / underconfident (above) regions */}
        <polygon points={`${X0},${YB} ${X1},${YB} ${X1},${YT}`} fill="rgba(189,112,56,0.07)" />
        <polygon points={`${X0},${YB} ${X0},${YT} ${X1},${YT}`} fill="rgba(91,127,191,0.07)" />
        {grid.map((g, i) => (
          <line
            key={i}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke="rgba(44,40,35,0.07)"
            strokeWidth={1}
          />
        ))}
        {/* Perfect-calibration diagonal */}
        <line
          x1={X0}
          y1={YB}
          x2={X1}
          y2={YT}
          stroke="rgba(44,40,35,0.4)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
        <text x={126} y={70} fontFamily={font.mono} fontSize={9.5} fill={STATE_COLOR.learning} letterSpacing="0.06em">
          UNDERCONFIDENT
        </text>
        <text x={300} y={386} fontFamily={font.mono} fontSize={9.5} fill={OVER} letterSpacing="0.06em">
          OVERCONFIDENT
        </text>
        {/* Your tendency */}
        {trend && (
          <>
            <line
              x1={trend.x1}
              y1={trend.y1}
              x2={trend.x2}
              y2={trend.y2}
              stroke={CALIB_TREND_COLOR}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={trend.x1} cy={trend.y1} r={3.5} fill={CALIB_TREND_COLOR} />
            <circle cx={trend.x2} cy={trend.y2} r={3.5} fill={CALIB_TREND_COLOR} />
          </>
        )}
        {/* One dot per node; the big misses carry their label */}
        {items.map((d) => {
          const cx = px(d.felt);
          const cy = py(d.real);
          return (
            <g key={d.id}>
              <circle cx={cx} cy={cy} r={6.5} fill={CALIB_COLOR[d.verdict]} stroke={color.card} strokeWidth={2} />
              {Math.abs(d.diff) >= 20 && (
                <text x={cx + 11} y={cy + 4} fontFamily={font.mono} fontSize={10} fill={color.inkMuted}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Axes */}
        <line x1={60} y1={26} x2={60} y2={400} stroke="rgba(44,40,35,0.28)" strokeWidth={1.5} />
        <line x1={60} y1={400} x2={438} y2={400} stroke="rgba(44,40,35,0.28)" strokeWidth={1.5} />
        <text x={60} y={418} fontFamily={font.mono} fontSize={10} fill={color.inkGhost} textAnchor="middle">
          0
        </text>
        <text x={438} y={418} fontFamily={font.mono} fontSize={10} fill={color.inkGhost} textAnchor="middle">
          100
        </text>
        <text x={249} y={432} fontFamily={font.mono} fontSize={10.5} fill={color.inkMuted} textAnchor="middle">
          Predicted confidence →
        </text>
        <text x={48} y={400} fontFamily={font.mono} fontSize={10} fill={color.inkGhost} textAnchor="end">
          0
        </text>
        <text x={48} y={30} fontFamily={font.mono} fontSize={10} fill={color.inkGhost} textAnchor="end">
          100
        </text>
        <text
          transform="translate(20,213) rotate(-90)"
          fontFamily={font.mono}
          fontSize={10.5}
          fill={color.inkMuted}
          textAnchor="middle"
        >
          Actual performance →
        </text>
      </svg>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          marginTop: 6,
          paddingTop: 14,
          borderTop: `1px solid ${color.hairline}`,
          fontSize: 12,
          color: color.inkMuted,
        }}
      >
        <LegendDot color={OVER} label="Overconfident" />
        <LegendDot color={STATE_COLOR.mastered} label="Calibrated" />
        <LegendDot color={STATE_COLOR.learning} label="Underconfident" />
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 16, height: 0, borderTop: `2.5px solid ${CALIB_TREND_COLOR}` }} />
          Your tendency
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color: dot, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: dot }} />
      {label}
    </span>
  );
}

/** The right column: the coach line, the per-node breakdown, and the capture/
 *  underconfidence notes. */
function Readout({
  items,
  onCloseGap,
}: {
  items: CalibItem[];
  onCloseGap: (nodeId: string) => void;
}) {
  const rows = calibRows(items);
  const under = calibUnderLine(items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* The feeling to learn — the plain-language coach line */}
      <div
        style={{
          background: color.card,
          border: `1px solid rgba(189,112,56,0.28)`,
          borderLeft: `3px solid ${OVER}`,
          borderRadius: 14,
          padding: "20px 22px",
        }}
      >
        <div style={{ ...kicker(10, "0.12em"), color: OVER, marginBottom: 10 }}>
          The feeling to learn
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 20,
            lineHeight: 1.4,
            color: color.ink,
            marginBottom: 14,
          }}
        >
          {calibCoach(items)}
        </div>
        <div style={{ fontSize: 13.5, color: color.inkMuted, lineHeight: 1.58 }}>
          {CALIB_TOPIC}
        </div>
      </div>

      {/* Per-node breakdown */}
      <div>
        <div style={{ ...kicker(10, "0.14em"), marginBottom: 12 }}>
          Per-node breakdown · tap an overconfident node to close the real gap
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((r) => (
            <CalibRow key={r.id} item={r} onCloseGap={onCloseGap} />
          ))}
        </div>
      </div>

      {/* The other direction + where it's captured */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "#f2f4f8",
            border: `1px solid rgba(91,127,191,0.22)`,
            borderRadius: 14,
            padding: "17px 19px",
          }}
        >
          <div style={{ ...kicker(9.5, "0.1em"), color: STATE_COLOR.learning, marginBottom: 8 }}>
            The other direction
          </div>
          <div style={{ fontSize: 13.5, color: color.inkSoft, lineHeight: 1.55 }}>
            {under ||
              "Nothing underconfident right now — no readings where you deliver more than you expect."}
          </div>
        </div>
        <div
          style={{
            background: color.cardAlt,
            border: `1px solid ${color.hairline}`,
            borderRadius: 14,
            padding: "17px 19px",
          }}
        >
          <div style={{ ...kicker(9.5, "0.1em"), marginBottom: 10 }}>
            Captured · cheap hooks everywhere
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
              fontSize: 12.5,
              color: color.inkMuted,
              lineHeight: 1.4,
            }}
          >
            <CaptureHook color={CRUCIBLE_COLOR.accent} text="Confidence tap before every Crucible problem" />
            <CaptureHook color={color.accent} text="Confidence tap before flipping each review card" />
            <CaptureHook color={STATE_COLOR.frontier} text="Predictions made during the Consume phase" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptureHook({ color: dot, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: dot }}>•</span>
      {text}
    </div>
  );
}

/** One node's row: its felt vs. real bars, verdict badge, and — when
 *  overconfident — a tap target into its Crucible. */
function CalibRow({
  item,
  onCloseGap,
}: {
  item: CalibItem;
  onCloseGap: (nodeId: string) => void;
}) {
  const over = item.verdict === "over";
  const cta = over
    ? "Close the gap → Crucible"
    : item.verdict === "under"
      ? "Better than it feels"
      : "Feeling matches result";
  return (
    <div
      onClick={over ? () => onCloseGap(item.id) : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "148px 1fr auto",
        gap: 15,
        alignItems: "center",
        padding: "13px 16px",
        background: color.card,
        border: `1px solid ${color.hairline}`,
        borderRadius: 11,
        cursor: over ? "pointer" : "default",
      }}
    >
      <div>
        <div style={{ fontSize: 14, color: color.ink, marginBottom: 5 }}>
          {item.label}
        </div>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: CALIB_COLOR[item.verdict],
            border: `1px solid ${CALIB_COLOR[item.verdict]}55`,
            borderRadius: 6,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {CALIB_VERDICT_LABEL[item.verdict]}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Bar label="Felt" pct={item.felt} fill="rgba(44,40,35,0.34)" />
        <Bar label="Real" pct={item.real} fill={CALIB_COLOR[item.verdict]} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: color.inkFaint,
          whiteSpace: "nowrap",
        }}
      >
        {over && (
          <>
            <span style={{ color: OVER, fontWeight: 600 }}>{cta}</span>
            <span style={{ color: OVER }}>→</span>
          </>
        )}
        {!over && <span>{cta}</span>}
      </div>
    </div>
  );
}

function Bar({
  label,
  pct,
  fill,
}: {
  label: string;
  pct: number;
  fill: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: color.inkGhost,
          width: 34,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 7,
          background: "rgba(44,40,35,0.08)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: fill, borderRadius: 3 }} />
      </div>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.inkMuted,
          width: 34,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}
