"use client";

import { useState } from "react";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import {
  ALT_CONTROLS,
  PHASES,
  STATE_COLOR,
  figureLayers,
  type AltKey,
  type ConsumeChunk,
  type ConsumeFigure,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

// Consume is a Learning-phase surface: its accents borrow the shared state
// colors (learning blue, plus mastered/shaky for right/wrong verdicts).
const BLUE = STATE_COLOR.learning;
const RIGHT = STATE_COLOR.mastered;
const WRONG = STATE_COLOR.shaky;

/** The live state of one Consume session — held by AtlasApp, read here. */
export interface ConsumeSession {
  nodeId: string;
  /** Deepest chunk revealed so far; content unfolds one segment at a time. */
  idx: number;
  /** The learner's prediction per chunk — presence of an entry = revealed. */
  answered: Record<string, { oi: number; correct: boolean }>;
  /** The chosen rewrite modality per chunk (adaptive modality). */
  variant: Record<string, AltKey | null>;
  /** The pre-taught term expanded inline, keyed `chunkId:term`. */
  term: string | null;
  /** The chunk whose mini-Socratic aside is open. */
  aside: string | null;
}

interface ConsumeViewProps {
  /** The node this session teaches — titles the view. */
  title: string;
  /** The subject — context for judging open-ended predictions. */
  topic: string;
  /** The generated reading pass for this node. */
  chunks: ConsumeChunk[];
  session: ConsumeSession;
  onExit: () => void;
  onAnswer: (chunkId: string, oi: number, correct: boolean) => void;
  onContinue: (chunkIndex: number) => void;
  onFinish: () => void;
  onSetVariant: (chunkId: string, key: AltKey) => void;
  onToggleTerm: (key: string) => void;
  onToggleAside: (chunkId: string) => void;
  onSkipCrucible: () => void;
  onRoutePrereq: () => void;
}

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

function Figure({ id, figure }: { id: string; figure: ConsumeFigure }) {
  const layer = figureLayers(figure);
  const rows: (typeof figure.nodes)[number][][] = [];
  for (const n of figure.nodes) {
    const l = layer.get(n.id) ?? 0;
    (rows[l] ??= []).push(n);
  }
  const box = new Map<string, { x: number; y: number; w: number; h: number; lines: string[] }>();
  let y = PAD;
  for (const row of rows) {
    if (!row) continue;
    const w = (FIG_W - 2 * PAD - GAP_X * (row.length - 1)) / row.length;
    const laid = row.map((n) => wrap(n.label, w));
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
      style={{
        width: "100%",
        height: "auto",
        borderRadius: 12,
        border: `1px solid ${color.hairline}`,
        background: color.card,
        display: "block",
      }}
    >
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
        const span = Math.abs(
          (layer.get(e.to) ?? 0) - (layer.get(e.from) ?? 0),
        );
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
                {e.label}
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
                  y={b.y + b.h / 2 - ((b.lines.length - 1) * LINE_H) / 2 + li * LINE_H + 3}
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

export default function ConsumeView({
  title,
  topic,
  chunks,
  session,
  onExit,
  onAnswer,
  onContinue,
  onFinish,
  onSetVariant,
  onToggleTerm,
  onToggleAside,
  onSkipCrucible,
  onRoutePrereq,
}: ConsumeViewProps) {
  // Predictions are open-ended by default; the switch reveals the closed form.
  const [mode, setMode] = useState<AnswerMode>("open");
  // Only chunks up to the deepest revealed one are on screen — content
  // reveals in segments, never as a wall.
  const visible = chunks.slice(0, session.idx + 1);

  let answeredCount = 0;
  let rightCount = 0;
  let simpleCount = 0;
  for (const c of chunks) {
    const ans = session.answered[c.id];
    if (ans) {
      answeredCount++;
      if (ans.correct) rightCount++;
    }
    if (session.variant[c.id] === "simpler") simpleCount++;
  }
  // Overshoot correction: every prediction right → offer to skip ahead.
  const allRight =
    answeredCount === chunks.length && rightCount === chunks.length;
  // Missing-prerequisite flag: leaning on "simpler" repeatedly.
  const simpleFlag = simpleCount >= 3;

  const breadcrumb = PHASES.slice(0, 6).join(" → ");

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
      {/* Header */}
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
        <div
          style={{ width: 1, height: 20, background: color.hairlineStrong }}
        />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: BLUE,
          }}
        >
          Session · Consume
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.inkGhost,
          }}
        >
          {breadcrumb}
        </span>
      </div>

      {/* Segment progress */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          gap: 6,
          padding: "12px 24px 0",
        }}
      >
        {chunks.map((c, i) => (
          <div
            key={c.id}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= session.idx ? color.accent : "rgba(44,40,35,0.12)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>

      {/* Reading column */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "40px 32px 120px" }}>
          <div style={{ ...kicker(11), marginBottom: 10 }}>
            Minimum, grounded, active input
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.12,
              margin: "0 0 8px",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: color.inkMuted,
              margin: "0 0 34px",
              maxWidth: 640,
              lineHeight: 1.55,
            }}
          >
            Guess before each reveal — a wrong prediction you then correct
            sticks far better than reading straight through. Rewrite any chunk
            to fit how you think, and tap a term for its meaning before it&rsquo;s
            used.
          </p>

          {visible.map((c, i) => {
            const ans = session.answered[c.id];
            const revealed = !!ans;
            const vkey = session.variant[c.id] ?? null;
            const altText = vkey ? c.alt[vkey] : null;
            const isDeepest = i === visible.length - 1;
            const isLast = i === chunks.length - 1;
            const verdict = revealed
              ? ans!.correct
                ? { text: c.right, color: RIGHT }
                : { text: c.wrong, color: WRONG }
              : null;

            return (
              <div
                key={c.id}
                style={{
                  marginBottom: 30,
                  paddingBottom: 30,
                  borderBottom: `1px solid rgba(44,40,35,0.08)`,
                }}
              >
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: BLUE,
                    marginBottom: 14,
                  }}
                >
                  {c.kicker}
                </div>

                {/* Pre-taught terms */}
                {c.terms.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 18,
                    }}
                  >
                    {c.terms.map((t) => {
                      const key = `${c.id}:${t.t}`;
                      const open = session.term === key;
                      return (
                        <div
                          key={key}
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <button
                            onClick={() => onToggleTerm(key)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "5px 11px",
                              background: color.chipBg,
                              border: `1px solid ${color.hairlineStrong}`,
                              borderRadius: 20,
                              fontSize: 12.5,
                              color: color.inkSoft,
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 9,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: color.amberInk,
                              }}
                            >
                              term
                            </span>
                            {t.t}
                          </button>
                          {open && (
                            <div
                              style={{
                                marginTop: 7,
                                maxWidth: 340,
                                fontSize: 13,
                                lineHeight: 1.5,
                                color: color.inkSoft,
                                background: color.amberBg,
                                border: "1px solid rgba(160,106,48,0.2)",
                                borderRadius: 9,
                                padding: "9px 12px",
                                animation: "fadeUp .25s both",
                              }}
                            >
                              {t.d}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Predict first */}
                <div
                  style={{
                    background: color.card,
                    border: "1px solid rgba(91,127,191,0.28)",
                    borderRadius: 13,
                    padding: "18px 20px",
                    marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: BLUE,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: BLUE,
                      }}
                    >
                      Predict first
                    </span>
                    {!revealed && (
                      <span style={{ marginLeft: "auto" }}>
                        <AnswerModeToggle
                          mode={mode}
                          onMode={setMode}
                          accent={BLUE}
                        />
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 20,
                      lineHeight: 1.32,
                      marginBottom: 16,
                    }}
                  >
                    {c.pred.q}
                  </div>
                  {mode === "open" && !revealed ? (
                    <OpenAnswer
                      topic={topic}
                      nodeLabel={title}
                      question={c.pred.q}
                      options={c.pred.opts.map((o) => o.label)}
                      onResolve={(oi) =>
                        onAnswer(c.id, oi, c.pred.opts[oi].correct)
                      }
                      placeholder="Guess before you read — a wrong guess still primes the explanation."
                      rows={2}
                      accent={BLUE}
                      submitLabel="Lock in my prediction →"
                    />
                  ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 9 }}
                  >
                    {c.pred.opts.map((o, oi) => {
                      const chosen = ans && ans.oi === oi;
                      const showCorrect = revealed && o.correct;
                      const showWrong = chosen && !o.correct;
                      return (
                        <button
                          key={o.label}
                          disabled={revealed}
                          onClick={() =>
                            revealed ? undefined : onAnswer(c.id, oi, o.correct)
                          }
                          style={{
                            textAlign: "left",
                            padding: "13px 16px",
                            borderRadius: 10,
                            fontSize: 14.5,
                            cursor: revealed ? "default" : "pointer",
                            fontFamily: "inherit",
                            border: `1px solid ${
                              showCorrect
                                ? RIGHT
                                : showWrong
                                  ? WRONG
                                  : color.hairlineStrong
                            }`,
                            background: showCorrect
                              ? "rgba(76,139,99,0.10)"
                              : showWrong
                                ? "rgba(189,112,56,0.09)"
                                : color.card,
                            color: color.ink,
                            transition: "all .15s",
                            opacity: revealed && !o.correct && !chosen ? 0.5 : 1,
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  )}
                  {verdict && (
                    <div
                      style={{
                        marginTop: 14,
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: verdict.color,
                        animation: "softIn .3s both",
                      }}
                    >
                      {verdict.text}
                    </div>
                  )}
                </div>

                {/* Reveal — dual-coded */}
                {revealed && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 300px",
                      gap: 26,
                      alignItems: "start",
                      animation: "fadeUp 0.4s both",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontFamily: font.serif,
                          fontSize: 19,
                          lineHeight: 1.62,
                          margin: "0 0 12px",
                          color: color.ink,
                        }}
                      >
                        {c.body}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 12,
                          color: color.inkFaint,
                          marginBottom: 18,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 9,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: color.amberInk,
                            border: "1px solid rgba(160,106,48,0.3)",
                            borderRadius: 5,
                            padding: "1px 6px",
                          }}
                        >
                          source
                        </span>
                        {c.cite}
                      </div>
                      {/* Adaptive-modality rewrites */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {ALT_CONTROLS.map(([key, label]) => {
                          const active = vkey === key;
                          return (
                            <button
                              key={key}
                              onClick={() => onSetVariant(c.id, key)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: font.mono,
                                border: `1px solid ${
                                  active ? color.accent : color.hairlineStrong
                                }`,
                                background: active ? color.accentBg : color.card,
                                color: active ? color.accent : color.inkMuted,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {altText && (
                        <div
                          style={{
                            marginTop: 11,
                            fontSize: 14.5,
                            lineHeight: 1.55,
                            color: color.inkSoft,
                            background: color.chipBg,
                            borderRadius: 10,
                            padding: "13px 15px",
                            animation: "fadeUp .3s both",
                          }}
                        >
                          {altText}
                        </div>
                      )}
                      {/* Highlight → ask (mini-Socratic aside) */}
                      <div style={{ marginTop: 16 }}>
                        <button
                          onClick={() => onToggleAside(c.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: 13,
                            color: color.accent,
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: 3,
                          }}
                        >
                          Ask about this passage
                        </button>
                        {session.aside === c.id && (
                          <div
                            style={{
                              marginTop: 11,
                              borderLeft: `3px solid ${color.accent}`,
                              padding: "2px 0 2px 14px",
                              animation: "fadeUp .3s both",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12.5,
                                color: color.inkFaint,
                                marginBottom: 6,
                              }}
                            >
                              A quick Socratic aside, without leaving Consume:
                            </div>
                            <div
                              style={{
                                fontFamily: font.serif,
                                fontSize: 16,
                                lineHeight: 1.45,
                                color: color.ink,
                              }}
                            >
                              {c.ask}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      {c.figure && <Figure id={c.id} figure={c.figure} />}
                      <div
                        style={{
                          marginTop: 9,
                          fontFamily: font.mono,
                          fontSize: 10.5,
                          lineHeight: 1.45,
                          color: color.inkFaint,
                        }}
                      >
                        diagram · {c.diagram}
                      </div>
                    </div>
                  </div>
                )}

                {/* Continue / finish — only on the deepest revealed chunk */}
                {revealed && isDeepest && (
                  <div style={{ marginTop: 26 }}>
                    <button
                      onClick={() => (isLast ? onFinish() : onContinue(i))}
                      style={
                        isLast
                          ? {
                              padding: "14px 24px",
                              background: color.accent,
                              color: color.accentInk,
                              border: "none",
                              borderRadius: 12,
                              fontSize: 15,
                              fontWeight: 600,
                              cursor: "pointer",
                              boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
                            }
                          : {
                              padding: "12px 20px",
                              background: color.card,
                              color: color.ink,
                              border: `1px solid ${color.hairlineStrong}`,
                              borderRadius: 11,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: "pointer",
                            }
                      }
                    >
                      {isLast ? "Finish · begin Socratic →" : "Continue ↓"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Edge case: diagnostic overshoot */}
          {allRight && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: color.successBg,
                border: "1px solid rgba(76,139,99,0.3)",
                borderRadius: 13,
                padding: "18px 22px",
                marginBottom: 16,
                animation: "fadeUp .4s both",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    marginBottom: 3,
                  }}
                >
                  You predicted every chunk correctly.
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted }}>
                  The diagnostic under-shot your level here — no need to grind
                  the basics.
                </div>
              </div>
              <button
                onClick={onSkipCrucible}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  background: color.accent,
                  color: color.accentInk,
                  border: "none",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Skip to Crucible →
              </button>
            </div>
          )}

          {/* Edge case: leaning on "simpler" — flag a missing prerequisite */}
          {simpleFlag && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: color.amberBg,
                border: "1px solid rgba(160,106,48,0.28)",
                borderRadius: 13,
                padding: "18px 22px",
                animation: "fadeUp .4s both",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    marginBottom: 3,
                  }}
                >
                  Simplifying a lot?
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted }}>
                  Repeatedly reaching for the simpler version usually means an
                  earlier concept is shaky.
                </div>
              </div>
              <button
                onClick={onRoutePrereq}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  background: color.card,
                  color: color.amberInk,
                  border: "1px solid rgba(160,106,48,0.4)",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Review prerequisite →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
