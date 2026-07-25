"use client";

import { useEffect, useRef, useState } from "react";
import {
  HELP_COLOR,
  HELP_LABELS,
  PHASES,
  STATE_COLOR,
  type HelpLevel,
  type SocraticSession,
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
  session: SocraticSession;
  /** True while the server judge is classifying the typed answer (#25). */
  judging: boolean;
  /** A targeted pass on a red gap node (#12) — completing it closes the gap. */
  gapMode: boolean;
  onExit: () => void;
  /** Submit the learner's own typed answer for judging. */
  onAnswer: (text: string) => void;
  onStuck: () => void;
  onTell: () => void;
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
  session,
  judging,
  gapMode,
  onExit,
  onAnswer,
  onStuck,
  onTell,
  onAdvance,
}: SocraticViewProps) {
  // The learner's own answer, typed — cleared whenever a new turn lands.
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [session.log.length]);
  const submitDraft = () => {
    const text = draft.trim();
    if (text && !judging) onAnswer(text);
  };

  // ---- the transcript scrolls to the newest turn -----------------------
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.log.length]);

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

      {/* Body — the dialogue */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
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
                    {gapMode
                      ? "Sub-point rebuilt — this gap can close."
                      : "Understanding established — you reconstructed it unaided."}
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
                    {gapMode ? "Close the gap · back to the map →" : "Teach it back · Feynman →"}
                  </button>
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
                    Your answer — in your own words
                  </div>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                    <textarea
                      value={draft}
                      disabled={judging}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitDraft();
                        }
                      }}
                      placeholder={
                        judging
                          ? "Reading your answer…"
                          : "Type what you think — wrong turns get caught, not judged"
                      }
                      rows={2}
                      style={{
                        flex: 1,
                        resize: "none",
                        padding: "12px 15px",
                        borderRadius: 10,
                        fontSize: 14,
                        lineHeight: 1.45,
                        fontFamily: "inherit",
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        color: color.ink,
                        opacity: judging ? 0.6 : 1,
                      }}
                    />
                    <button
                      onClick={submitDraft}
                      disabled={judging || !draft.trim()}
                      style={{
                        flex: "0 0 auto",
                        padding: "12px 17px",
                        background:
                          judging || !draft.trim() ? "rgba(44,40,35,0.07)" : color.accent,
                        color:
                          judging || !draft.trim() ? color.inkGhost : color.accentInk,
                        border: "none",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: judging || !draft.trim() ? "default" : "pointer",
                      }}
                    >
                      {judging ? "…" : "Send"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      onClick={onStuck}
                      disabled={judging}
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
                      disabled={judging}
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
