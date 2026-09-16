"use client";

// Trace — one case, walked a stage at a time, with the chain kept on screen.
//
// The chain above the open stage is not decoration: what each answered stage
// established is the input to the next one, and seeing it is how the learner
// knows where they are standing. When the chain breaks, the closing panel says
// at which stage rather than giving a bare score, because everything after a
// wrong link was answered from a position they had already left.

import { useState } from "react";
import {
  TRACE_COLOR,
  traceBreak,
  traceCopy,
  tracePassed,
  traceScore,
  type PhaseId,
  type TraceContent,
  type TraceSession,
} from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import type { PresenceState } from "@/lib/motion";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    follows: "That follows",
    breaks: "The chain breaks here",
    placeholder: "Say what this stage hands the next, and why…",
    submit: "Commit stage →",
    score: (a: number, b: number) => `${a} of ${b} stages walked`,
    advance: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    follows: "Segue",
    breaks: "A cadeia quebra aqui",
    placeholder: "Diga o que este estágio entrega ao próximo, e por quê…",
    submit: "Confirmar estágio →",
    score: (a: number, b: number) => `${a} de ${b} estágios percorridos`,
    advance: "Continuar →",
  },
} as const;

export default function TraceView({
  presence,
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onStep,
  onNext,
  onAdvance,
}: {
  presence: PresenceState;
  topic: string;
  title: string;
  plan: readonly PhaseId[];
  content: TraceContent;
  session: TraceSession;
  onExit: () => void;
  onStep: (index: number, read?: string) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = traceCopy(lang);
  const { accent, soft, border } = TRACE_COLOR;
  const [mode, setMode] = useState<AnswerMode>("open");

  const item = content.stages[session.index];
  const walked = item ? session.walked[item.id] : undefined;
  const stepped = walked !== undefined;
  const follows = item ? walked === item.answerIndex : false;
  const brokeAt = traceBreak(session, content);

  return (
    <PhaseShell
      presence={presence}
      phase="trace"
      kicker={copy.kicker}
      accent={accent}
      title={title}
      plan={plan}
      lang={lang}
      onExit={onExit}
      headerRight={
        <span
          data-testid="phase-progress"
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}
        >
          {t.of(
            Math.min(session.index + 1, content.stages.length),
            content.stages.length,
          )}
        </span>
      }
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: color.inkFaint,
          marginBottom: 12,
        }}
      >
        {copy.lead}
      </div>

      {/* The one case the whole chain walks — always on screen. */}
      <div
        data-testid="trace-scenario"
        style={{
          padding: "14px 17px",
          borderRadius: 12,
          background: soft,
          border: `1px solid ${border}`,
          fontFamily: font.serif,
          fontSize: 15.5,
          lineHeight: 1.5,
        }}
      >
        <Rich text={content.scenario} />
      </div>

      {/* The chain so far: each answered stage's true next, in order. */}
      {session.index > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: color.inkGhost,
              marginBottom: 8,
            }}
          >
            {copy.soFar}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {content.stages.slice(0, session.index).map((prev, i) => {
              const ok = session.walked[prev.id] === prev.answerIndex;
              return (
                <div
                  key={prev.id}
                  data-testid={`chain-link-${i}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "9px 13px",
                    borderRadius: 9,
                    background: color.chipBg,
                    borderLeft: `2px solid ${ok ? accent : color.amberInk}`,
                    fontSize: 13,
                    color: color.inkMuted,
                  }}
                >
                  <span style={{ fontFamily: font.mono, color: color.inkGhost }}>
                    {i + 1}
                  </span>
                  <span>{prev.nexts[prev.answerIndex]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {item && !session.done && (
        <div key={item.id} style={{ marginTop: 18, animation: "fadeUp .3s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: color.inkGhost,
              marginBottom: 6,
            }}
          >
            {copy.reached}
          </div>
          <div
            data-testid="stage-reached"
            style={{ fontSize: 15.5, lineHeight: 1.5, fontWeight: 600 }}
          >
            <Rich text={item.reached} />
          </div>

          {!stepped && (
            <div style={{ marginTop: 14 }}>
              <div style={{ marginBottom: 12 }}>
                <AnswerModeToggle mode={mode} onMode={setMode} accent={accent} />
              </div>
              {mode === "open" ? (
                <OpenAnswer
                  topic={topic}
                  nodeLabel={title}
                  question={`${content.scenario}\n\n${item.reached}\n\nWhat happens next?`}
                  options={item.nexts}
                  accent={accent}
                  placeholder={t.placeholder}
                  submitLabel={t.submit}
                  onResolve={(index, read) => onStep(index, read)}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {item.nexts.map((next, i) => (
                    <button
                      key={i}
                      className="at-press"
                      data-testid={`action-pick-${i}`}
                      onClick={() => onStep(i)}
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
                      {next}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {stepped && (
            <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
              <div
                data-testid={follows ? "stage-follows" : "stage-breaks"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: follows ? color.accent : color.amberInk,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: follows ? color.accent : color.amberInk,
                  }}
                />
                {follows ? t.follows : t.breaks}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {item.nexts.map((next, i) => {
                  const isAnswer = i === item.answerIndex;
                  const isPick = i === walked;
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
                      {next}
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
                  {copy.handsOn}
                </span>
                <Rich text={item.handsOn} />
              </div>

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
                {copy.next}
              </button>
            </div>
          )}
        </div>
      )}

      {session.done && (
        <div style={{ marginTop: 20, animation: "fadeUp .4s both" }}>
          <div
            data-testid="phase-score"
            style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}
          >
            {t.score(traceScore(session, content), content.stages.length)}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: tracePassed(session, content) ? color.inkMuted : color.amberInk,
            }}
          >
            {tracePassed(session, content) ? copy.passed : copy.brokeAt(brokeAt + 1)}
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
    </PhaseShell>
  );
}
