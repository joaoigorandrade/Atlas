"use client";

// The deck — Discriminate now, Predict · Trace · Drill on the same surface.
//
// One item at a time: answer, then the reveal. Nothing about the answer is on
// screen before the learner commits, which is what makes a boundary call a
// boundary call rather than a recognition task.
//
// Open-ended first, per AGENTS.md: the default is the learner's own words,
// mapped onto an option index by the `choice` judge. The options exist so the
// *grading* is local — the one thing these phases must never do is make the
// learner wait on a model between items.

import { useState } from "react";
import {
  DECK_COLOR,
  DECK_SHAPE,
  deckCopy,
  deckMedianMs,
  deckPassed,
  deckScore,
  phaseLabel,
  type DeckContent,
  type DeckSession,
  type PhaseId,
} from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import Rich from "@/components/Rich";
import Sheet from "@/components/Sheet";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import type { PresenceState } from "@/lib/motion";

const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session",
    progress: (at: number, of: number) => `${at} of ${of}`,
    right: "Right",
    wrong: "Not this one",
    because: "Because",
    next: "Next →",
    reveal: "See the reveal",
    scoreLine: (got: number, total: number) => `${got} of ${total} right`,
    median: (ms: number) => `${(ms / 1000).toFixed(1)}s a call, typically`,
    advance: "Continue →",
    placeholder: "Say which it is, and what decides it…",
    submitLabel: "Commit answer →",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão",
    progress: (at: number, of: number) => `${at} de ${of}`,
    right: "Certo",
    wrong: "Não é esse",
    because: "Porque",
    next: "Próximo →",
    reveal: "Ver a resposta",
    scoreLine: (got: number, total: number) => `${got} de ${total} certos`,
    median: (ms: number) => `${(ms / 1000).toFixed(1)}s por decisão, em geral`,
    advance: "Continuar →",
    placeholder: "Diga qual é, e o que decide isso…",
    submitLabel: "Confirmar resposta →",
  },
} as const;

interface DeckViewProps {
  presence: PresenceState;
  topic: string;
  title: string;
  /** The node's own ladder — the breadcrumb draws this, not the catalogue. */
  plan: readonly PhaseId[];
  content: DeckContent;
  session: DeckSession;
  onExit: () => void;
  onAnswer: (index: number, read?: string) => void;
  onNext: () => void;
  onAdvance: () => void;
}

export default function DeckView({
  presence,
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onAnswer,
  onNext,
  onAdvance,
}: DeckViewProps) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = deckCopy(session.phase, lang);
  const { accent, soft } = DECK_COLOR[session.phase];
  const shape = DECK_SHAPE[session.phase];
  const [mode, setMode] = useState<AnswerMode>("open");

  const item = content.items[session.index];
  const picked = item ? session.picks[item.id] : undefined;
  const answered = picked !== undefined;
  const correct = item ? picked === item.answerIndex : false;
  const score = deckScore(session, content);

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
        <div style={{ flex: 1 }} />
        <span
          data-testid="deck-progress"
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}
        >
          {t.progress(
            Math.min(session.index + 1, content.items.length),
            content.items.length,
          )}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 90px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 16,
            }}
          >
            {copy.lead}
          </div>

          {/* The chain: what the answered items established, kept on screen for
              the phases where each step feeds the next. */}
          {shape.chain &&
            content.items.slice(0, session.index).map((prev) => (
              <div
                key={prev.id}
                style={{
                  marginBottom: 8,
                  padding: "9px 13px",
                  borderRadius: 9,
                  background: color.chipBg,
                  border: `1px solid ${color.hairline}`,
                  fontSize: 13,
                  color: color.inkMuted,
                }}
              >
                {prev.options[prev.answerIndex]}
              </div>
            ))}

          {item && !session.done && (
            <div key={item.id} style={{ animation: "fadeUp .3s both" }}>
              {item.context && (
                <div
                  data-testid="deck-context"
                  style={{
                    padding: "16px 19px",
                    borderRadius: 12,
                    background: soft,
                    border: `1px solid ${accent}40`,
                    fontFamily: font.serif,
                    fontSize: 16.5,
                    lineHeight: 1.5,
                  }}
                >
                  <Rich text={item.context} />
                </div>
              )}
              <div
                style={{
                  marginTop: item.context ? 16 : 0,
                  fontSize: 15.5,
                  lineHeight: 1.5,
                  fontWeight: 600,
                }}
              >
                {item.prompt}
              </div>

              {!answered && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ marginBottom: 12 }}>
                    <AnswerModeToggle mode={mode} onMode={setMode} accent={accent} />
                  </div>
                  {mode === "open" ? (
                    <OpenAnswer
                      topic={topic}
                      nodeLabel={title}
                      question={`${item.context ? `${item.context}\n\n` : ""}${item.prompt}`}
                      options={item.options}
                      accent={accent}
                      placeholder={t.placeholder}
                      submitLabel={t.submitLabel}
                      onResolve={(index, read) => onAnswer(index, read)}
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {item.options.map((option, i) => (
                        <button
                          key={i}
                          className="at-press"
                          data-testid={`action-pick-${i}`}
                          onClick={() => onAnswer(i)}
                          style={{
                            textAlign: "left",
                            padding: "12px 15px",
                            borderRadius: 11,
                            border: `1px solid ${color.hairlineStrong}`,
                            background: color.card,
                            fontSize: 14.5,
                            lineHeight: 1.45,
                            color: color.ink,
                            cursor: "pointer",
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* The reveal — only ever after a commit. */}
              {answered && (
                <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
                  <div
                    data-testid={correct ? "deck-right" : "deck-wrong"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      fontFamily: font.mono,
                      fontSize: 10.5,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: correct ? color.accent : color.amberInk,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: correct ? color.accent : color.amberInk,
                      }}
                    />
                    {correct ? t.right : t.wrong}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {item.options.map((option, i) => {
                      const isAnswer = i === item.answerIndex;
                      const isPick = i === picked;
                      return (
                        <div
                          key={i}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            fontSize: 14,
                            lineHeight: 1.45,
                            background: isAnswer ? soft : color.card,
                            border: `1px solid ${
                              isAnswer
                                ? accent
                                : isPick
                                  ? "rgba(160,106,48,0.45)"
                                  : color.hairline
                            }`,
                            color: isAnswer || isPick ? color.ink : color.inkMuted,
                          }}
                        >
                          {option}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      color: color.inkMuted,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: color.inkGhost,
                        marginRight: 8,
                      }}
                    >
                      {t.because}
                    </span>
                    <Rich text={item.why} />
                  </div>
                  {session.reads[item.id] && (
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: font.serif,
                        fontSize: 13.5,
                        fontStyle: "italic",
                        color: color.inkMuted,
                      }}
                    >
                      {session.reads[item.id]}
                    </div>
                  )}
                  <button
                    className="at-press"
                    data-testid="action-next"
                    onClick={onNext}
                    style={{
                      marginTop: 18,
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "none",
                      background: accent,
                      color: color.accentInk,
                      fontSize: 14.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {t.next}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* The close */}
          {session.done && (
            <div style={{ animation: "fadeUp .4s both" }}>
              <div
                data-testid="deck-score"
                style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}
              >
                {t.scoreLine(score, content.items.length)}
              </div>
              {shape.timed && (
                <div style={{ fontSize: 13, color: color.inkMuted }}>
                  {t.median(deckMedianMs(session, content))}
                </div>
              )}
              <div
                style={{
                  marginTop: 14,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: deckPassed(session, content) ? color.inkMuted : color.amberInk,
                }}
              >
                {deckPassed(session, content) ? copy.passed : copy.missed}
              </div>
              <button
                className="at-press"
                data-testid="action-finish"
                onClick={onAdvance}
                style={{
                  marginTop: 22,
                  width: "100%",
                  padding: 15,
                  borderRadius: 12,
                  border: "none",
                  background: color.accent,
                  color: color.accentInk,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.advance}
              </button>
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
