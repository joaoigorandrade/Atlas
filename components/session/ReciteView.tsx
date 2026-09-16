"use client";

// The blank page — Recall and Perform, on one surface.
//
// Both phases ask the learner to produce the thing from nothing and then diff
// what they produced against a rubric they never saw. The rubric is the whole
// point of not showing it: what a learner never thinks to write is the
// finding. So this view is deliberately empty until they submit — a brief, a
// box, and a scaffold they have to ask for.

import { useState } from "react";
import {
  RECITE_COLOR,
  type PhaseId,
  type ReciteContent,
  type ReciteSession,
  type TeachVerdict,
  phaseLabel,
  reciteCopy,
  recitePassed,
  reciteScore,
  verdictLabel,
  VERDICT_COLOR,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import Rich from "@/components/Rich";
import Sheet from "@/components/Sheet";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import type { PresenceState } from "@/lib/motion";

const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session",
    yourAnswer: "Your answer",
    placeholder: "Write it out — everything you can produce, in your own words…",
    placeholderJudging: "Reading what you wrote…",
    submit: "Submit →",
    stuck: "I'm stuck",
    report: "The report",
    scoreLine: (got: number, total: number) => `${got} of ${total} landed`,
    again: "Write it again →",
    advance: "Continue →",
    hint: "⌘↵ to submit",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão",
    yourAnswer: "Sua resposta",
    placeholder: "Escreva — tudo o que você conseguir produzir, com suas palavras…",
    placeholderJudging: "Lendo o que você escreveu…",
    submit: "Enviar →",
    stuck: "Travei",
    report: "O relatório",
    scoreLine: (got: number, total: number) => `${got} de ${total} chegaram`,
    again: "Escrever de novo →",
    advance: "Continuar →",
    hint: "⌘↵ para enviar",
  },
} as const;

interface ReciteViewProps {
  presence: PresenceState;
  title: string;
  /** The node's own ladder — the breadcrumb draws this, not the catalogue. */
  plan: readonly PhaseId[];
  content: ReciteContent;
  session: ReciteSession;
  /** True while the judge is reading the answer. */
  judging: boolean;
  onExit: () => void;
  onWrite: (value: string) => void;
  onScaffold: () => void;
  onSubmit: () => void;
  onAgain: () => void;
  onAdvance: () => void;
}

export default function ReciteView({
  presence,
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onWrite,
  onScaffold,
  onSubmit,
  onAgain,
  onAdvance,
}: ReciteViewProps) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = reciteCopy(session.phase, lang);
  const accent = RECITE_COLOR[session.phase].accent;
  const soft = RECITE_COLOR[session.phase].soft;
  const [showRubric, setShowRubric] = useState(false);
  const passed = recitePassed(session, content);
  const score = reciteScore(session, content);
  const busy = judging || session.pending;

  return (
    <Sheet
      presence={presence}
      data-testid={`phase-${session.phase}`}
      aria-label={`${copy.kicker} — ${title}`}
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
          className="at-press"
          data-testid="action-exit"
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {t.back}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {t.sessionLabel} · {copy.kicker}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "30px 32px 90px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 14,
            }}
          >
            {copy.lead}
          </div>

          {/* The brief — the only thing on the page before they write. */}
          <div
            style={{
              padding: "18px 20px",
              borderRadius: 12,
              background: soft,
              border: `1px solid ${accent}40`,
              fontFamily: font.serif,
              fontSize: 17.5,
              lineHeight: 1.5,
            }}
          >
            <Rich text={content.brief} />
          </div>

          {!session.reported && (
            <div style={{ marginTop: 22 }}>
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
                {t.yourAnswer}
              </div>
              <textarea
                data-testid="field-answer"
                value={session.answer}
                disabled={busy}
                onChange={(e) => onWrite(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (session.answer.trim() && !busy) onSubmit();
                  }
                }}
                placeholder={busy ? t.placeholderJudging : t.placeholder}
                rows={10}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "14px 16px",
                  borderRadius: 12,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  fontFamily: "inherit",
                  border: `1px solid ${color.hairlineStrong}`,
                  background: color.card,
                  color: color.ink,
                  opacity: busy ? 0.6 : 1,
                }}
              />
              <MicButton value={session.answer} onChange={onWrite} disabled={busy} />
              {session.scaffolded && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 15px",
                    borderRadius: 10,
                    background: color.chipBg,
                    border: `1px solid ${color.hairline}`,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: color.inkMuted,
                  }}
                >
                  <Rich text={content.scaffold} />
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                <button
                  className="at-press"
                  data-testid="action-submit"
                  onClick={onSubmit}
                  disabled={busy || !session.answer.trim()}
                  style={{
                    padding: "12px 20px",
                    background:
                      busy || !session.answer.trim() ? "rgba(44,40,35,0.07)" : accent,
                    color:
                      busy || !session.answer.trim() ? color.inkGhost : color.accentInk,
                    border: "none",
                    borderRadius: 10,
                    fontSize: 14.5,
                    fontWeight: 600,
                    cursor: busy || !session.answer.trim() ? "default" : "pointer",
                  }}
                >
                  {busy ? <InkDots size={3.5} /> : t.submit}
                </button>
                {!session.scaffolded && (
                  <button
                    className="at-press"
                    data-testid="action-scaffold"
                    onClick={onScaffold}
                    disabled={busy}
                    style={{
                      padding: "11px 15px",
                      background: color.card,
                      border: "1px solid rgba(160,106,48,0.4)",
                      borderRadius: 9,
                      fontSize: 13,
                      color: color.amberInk,
                      cursor: "pointer",
                    }}
                  >
                    {t.stuck}
                  </button>
                )}
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10.5,
                    color: color.inkGhost,
                  }}
                >
                  {t.hint}
                </span>
              </div>
            </div>
          )}

          {/* The report — every rubric row, ruled, with their own words. */}
          {session.reported && (
            <div style={{ marginTop: 26, animation: "fadeUp .4s both" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: accent,
                  }}
                >
                  {t.report}
                </span>
                <span
                  data-testid="recite-score"
                  style={{ fontSize: 13, color: color.inkMuted }}
                >
                  {t.scoreLine(score, content.rubric.length)}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {content.rubric.map((row) => {
                  const verdict: TeachVerdict = session.verdicts[row.id] ?? "skipped";
                  return (
                    <div
                      key={row.id}
                      data-testid={`recite-row-${verdict}`}
                      style={{
                        display: "flex",
                        gap: 11,
                        padding: "11px 14px",
                        borderRadius: 10,
                        background: color.card,
                        border: `1px solid ${color.hairline}`,
                      }}
                    >
                      <span
                        style={{
                          flex: "0 0 auto",
                          marginTop: 5,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: VERDICT_COLOR[verdict],
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5 }}>{row.point}</div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: VERDICT_COLOR[verdict],
                            marginTop: 3,
                          }}
                        >
                          {verdictLabel(verdict, lang)}
                        </div>
                        {session.quotes[row.id] && (
                          <div
                            style={{
                              marginTop: 6,
                              fontFamily: font.serif,
                              fontSize: 13.5,
                              fontStyle: "italic",
                              color: color.inkMuted,
                            }}
                          >
                            “{session.quotes[row.id]}”
                          </div>
                        )}
                        {showRubric && (
                          <ul
                            style={{
                              margin: "7px 0 0",
                              paddingLeft: 18,
                              fontSize: 13,
                              color: color.inkMuted,
                            }}
                          >
                            {row.mustConvey.map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="at-press"
                onClick={() => setShowRubric((v) => !v)}
                style={{
                  marginTop: 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.08em",
                  color: color.inkGhost,
                }}
              >
                {showRubric ? "▾" : "▸"} {content.rubric.length} ×
              </button>

              {(session.response || session.pending) && (
                <div
                  style={{
                    marginTop: 18,
                    padding: "14px 17px",
                    borderRadius: 12,
                    background: soft,
                    border: `1px solid ${accent}33`,
                    fontSize: 14.5,
                    lineHeight: 1.55,
                  }}
                >
                  {session.response ? (
                    <StreamingText text={session.response} writing={session.pending} />
                  ) : (
                    <InkDots size={4} />
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  className="at-press"
                  data-testid="action-finish"
                  onClick={onAdvance}
                  style={{
                    flex: 1,
                    padding: 15,
                    background: passed ? color.accent : color.card,
                    color: passed ? color.accentInk : color.ink,
                    border: passed ? "none" : `1px solid ${color.hairlineStrong}`,
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t.advance}
                </button>
                <button
                  className="at-press"
                  data-testid="action-again"
                  onClick={onAgain}
                  style={{
                    flex: "0 0 auto",
                    padding: "15px 18px",
                    background: color.card,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 12,
                    fontSize: 14,
                    color: color.inkMuted,
                    cursor: "pointer",
                  }}
                >
                  {t.again}
                </button>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: passed ? color.inkMuted : color.amberInk,
                }}
              >
                {passed ? copy.passed : copy.missed}
              </div>
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
        {plan.map(phaseLabel).join(" → ")}
      </div>
    </Sheet>
  );
}
