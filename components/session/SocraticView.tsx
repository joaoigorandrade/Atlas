"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  HELP_COLOR,
  HELP_LABELS,
  PHASES,
  STATE_COLOR,
  type HelpLevel,
  type SocraticSession,
  type SocraticStep,
  type SocraticTurn,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";

// Socratic borrows the shared state colors: learning blue for the phase label,
// mastered green for "understanding established", the scaffolding warmth from
// HELP_COLOR, and shaky/amber for a caught wrong turn.
const BLUE = STATE_COLOR.learning;
const GREEN = STATE_COLOR.mastered;

interface SocraticViewProps {
  /** The node this session teaches — titles the view. */
  title: string;
  /** The generated questioning script for this node. */
  steps: SocraticStep[];
  session: SocraticSession;
  onExit: () => void;
  onReply: (index: number) => void;
  onSubmitScratch: () => void;
  onStuck: () => void;
  onTell: () => void;
  onClearPad: () => void;
  onAdvance: () => void;
}

/** Per-tone accent for an AI bubble: a caught error, an affirmation, teaching. */
function toneColor(tone: SocraticTurn["tone"]): string {
  switch (tone) {
    case "catch":
      return STATE_COLOR.shaky;
    case "affirm":
      return GREEN;
    case "teach":
      return BLUE;
    default:
      return color.hairlineStrong;
  }
}

export default function SocraticView({
  title,
  steps,
  session,
  onExit,
  onReply,
  onSubmitScratch,
  onStuck,
  onTell,
  onClearPad,
  onAdvance,
}: SocraticViewProps) {
  const step = steps[session.step];
  const scratchPending = !!step?.scratch && !session.scratchDone;

  // ---- the transcript scrolls to the newest turn -----------------------
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.log.length, session.padReaction]);

  // ---- the scratchpad: a real freehand canvas the AI "reads" -----------
  // Drawing state lives in refs — strokes must not trigger React renders.
  const padRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const inkedRef = useRef(false);

  const resizePad = useCallback(() => {
    const canvas = padRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Re-sizing clears the bitmap; the pad is a working surface, not a
    // document, so losing strokes on a window resize is acceptable.
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = color.ink;
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    resizePad();
    window.addEventListener("resize", resizePad);
    return () => window.removeEventListener("resize", resizePad);
  }, [resizePad]);

  const padPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = padRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const padDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    drawingRef.current = true;
    inkedRef.current = true;
    const { x, y } = padPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const padMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { x, y } = padPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const padUp = () => {
    drawingRef.current = false;
  };

  const clearPad = () => {
    const canvas = padRef.current;
    const ctx = ctxRef.current;
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    inkedRef.current = false;
    onClearPad();
  };

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
      {/* Header — ← Map · Session · Socratic · title · scaffolding dial */}
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
            color: BLUE,
          }}
        >
          Session · Socratic
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: color.inkFaint,
          }}
        >
          Scaffolding
        </span>
        <HelpDial help={session.help} />
      </div>

      {/* Body — dialogue (left) · scratchpad (right) */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        {/* Dialogue column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: `1px solid ${color.hairline}`,
            minHeight: 0,
          }}
        >
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "30px 32px" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: color.inkFaint,
                  marginBottom: 22,
                }}
              >
                Construct the idea · I catch wrong turns, I don&rsquo;t smooth them over
              </div>
              {session.log.map((m, i) => (
                <Turn key={i} turn={m} />
              ))}
            </div>
          </div>

          {/* Input dock — replies, or the "understood" advance panel */}
          <div
            style={{
              flex: "0 0 auto",
              borderTop: `1px solid ${color.hairline}`,
              padding: "16px 32px 20px",
              background: "rgba(248,246,240,0.55)",
            }}
          >
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              {session.done ? (
                <div style={{ animation: "fadeUp .4s both" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                      fontSize: 13.5,
                      color: GREEN,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: GREEN,
                      }}
                    />
                    Understanding established — you reconstructed it unaided.
                  </div>
                  <button
                    onClick={onAdvance}
                    style={{
                      width: "100%",
                      padding: 15,
                      background: color.accent,
                      color: color.accentInk,
                      border: "none",
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
                    }}
                  >
                    Teach it back · Feynman →
                  </button>
                </div>
              ) : scratchPending ? (
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: color.inkMuted,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>✎</span>
                  Work it out on the scratchpad, then submit it — I&rsquo;ll read what
                  you wrote before we go on.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: color.inkGhost,
                      marginBottom: 9,
                    }}
                  >
                    Reply
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {step.replies.map((r, i) => {
                      const spent = session.ruledOut.includes(r.label);
                      return (
                        <button
                          key={r.label}
                          disabled={spent}
                          onClick={() => onReply(i)}
                          style={{
                            textAlign: "left",
                            padding: "12px 15px",
                            borderRadius: 10,
                            fontSize: 14,
                            lineHeight: 1.4,
                            cursor: spent ? "default" : "pointer",
                            fontFamily: "inherit",
                            border: `1px solid ${color.hairlineStrong}`,
                            background: color.card,
                            color: color.ink,
                            opacity: spent ? 0.42 : 1,
                            textDecoration: spent ? "line-through" : "none",
                            transition: "border-color .15s, background .15s",
                          }}
                          onMouseEnter={(e) => {
                            if (spent) return;
                            e.currentTarget.style.borderColor = color.accent;
                            e.currentTarget.style.background = color.accentBg;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = color.hairlineStrong;
                            e.currentTarget.style.background = color.card;
                          }}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      onClick={onStuck}
                      style={{
                        padding: "9px 14px",
                        background: color.card,
                        border: "1px solid rgba(160,106,48,0.4)",
                        borderRadius: 9,
                        fontSize: 13,
                        color: color.amberInk,
                        cursor: "pointer",
                      }}
                    >
                      I&rsquo;m stuck · more help
                    </button>
                    <button
                      onClick={onTell}
                      style={{
                        padding: "9px 14px",
                        background: color.card,
                        border: `1px solid ${color.hairlineStrong}`,
                        borderRadius: 9,
                        fontSize: 13,
                        color: color.inkMuted,
                        cursor: "pointer",
                      }}
                    >
                      Just tell me
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scratchpad column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: color.card,
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 22px",
              borderBottom: `1px solid rgba(44,40,35,0.08)`,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: color.inkFaint,
              }}
            >
              Scratchpad · I read what you write here
            </span>
            <button
              onClick={clearPad}
              style={{
                background: "none",
                border: "none",
                fontSize: 12.5,
                color: color.inkGhost,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas
              ref={padRef}
              onMouseDown={padDown}
              onMouseMove={padMove}
              onMouseUp={padUp}
              onMouseLeave={padUp}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                cursor: "crosshair",
                backgroundImage:
                  "radial-gradient(rgba(44,40,35,0.06) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />

            {/* The active step's task, overlaid until the pad is submitted */}
            {scratchPending && step.scratch && (
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  right: 18,
                  bottom: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(251,249,244,0.94)",
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 12,
                  padding: "13px 16px",
                  backdropFilter: "blur(4px)",
                  animation: "fadeUp .3s both",
                }}
              >
                <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, color: color.inkSoft }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: BLUE,
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Your task
                  </span>
                  {step.scratch.prompt}
                </div>
                <button
                  onClick={onSubmitScratch}
                  style={{
                    flex: "0 0 auto",
                    padding: "10px 15px",
                    background: color.accent,
                    color: color.accentInk,
                    border: "none",
                    borderRadius: 10,
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Show my work →
                </button>
              </div>
            )}
          </div>

          {/* The AI's reaction to the pad */}
          {session.padReaction && (
            <div
              style={{
                flex: "0 0 auto",
                margin: "0 18px 18px",
                borderLeft: `3px solid ${color.accent}`,
                padding: "11px 15px",
                background: color.accentBg,
                borderRadius: "0 10px 10px 0",
                fontFamily: font.serif,
                fontSize: 15,
                lineHeight: 1.45,
                color: color.ink,
                animation: "fadeUp .3s both",
              }}
            >
              {session.padReaction}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 24,
          fontFamily: font.mono,
          fontSize: 10.5,
          color: color.inkGhost,
        }}
      >
        {breadcrumb}
      </div>
    </div>
  );
}

/** The Silent · Hint · Guide · Show me dial; the active cell warms with help. */
function HelpDial({ help }: { help: HelpLevel }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        background: color.chipBg,
        border: `1px solid rgba(44,40,35,0.09)`,
        borderRadius: 9,
        padding: 3,
      }}
    >
      {HELP_LABELS.map((label, i) => {
        const active = i === help;
        const c = HELP_COLOR[i as HelpLevel];
        return (
          <div
            key={label}
            style={{
              padding: "5px 11px",
              borderRadius: 6,
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.04em",
              background: active ? c : "transparent",
              color: active ? color.accentInk : color.inkFaint,
              fontWeight: active ? 600 : 400,
              transition: "background .25s, color .25s",
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

/** One transcript line — an AI probe with its move tag, or a learner reply. */
function Turn({ turn }: { turn: SocraticTurn }) {
  if (turn.role === "learner") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div
          style={{
            maxWidth: "82%",
            background: color.chipBg,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: "12px 12px 3px 12px",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.45,
            color: color.inkSoft,
            animation: "fadeUp .25s both",
          }}
        >
          {turn.text}
        </div>
      </div>
    );
  }
  const accent = toneColor(turn.tone);
  return (
    <div style={{ marginBottom: 18, animation: "fadeUp .3s both" }}>
      {turn.move && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: color.inkGhost,
            marginBottom: 6,
          }}
        >
          {turn.move}
        </div>
      )}
      <div
        style={{
          maxWidth: "88%",
          background: color.card,
          border: `1px solid ${color.hairline}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: "3px 12px 12px 12px",
          padding: "12px 15px",
          fontFamily: font.serif,
          fontSize: 15.5,
          lineHeight: 1.5,
          color: color.ink,
        }}
      >
        {turn.text}
      </div>
    </div>
  );
}
