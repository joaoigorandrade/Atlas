"use client";

// Discriminate — one candidate case at a time, called before it is revealed.
//
// The surface is built around the error the phase exists to catch: waving a
// near-miss through. So the reveal does not just say right/wrong, it says
// which side of the boundary the case was on, and the closing panel calls out
// over-inclusion separately from a plain miss.

import { useState } from "react";
import {
  DISCRIMINATE_COLOR,
  discriminateCopy,
  discriminateFalsePositives,
  discriminatePassed,
  discriminateScore,
  type DiscriminateContent,
  type DiscriminateSession,
  type PhaseId,
} from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    right: "Right",
    wrong: "Not this one",
    isInstance: "This one genuinely is",
    isNot: "This one only looks like it",
    placeholder: "Say which it is, and what decides it…",
    submit: "Commit call →",
    score: (a: number, b: number) => `${a} of ${b} called right`,
    advance: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    right: "Certo",
    wrong: "Não é esse",
    isInstance: "Este é de verdade",
    isNot: "Este só parece",
    placeholder: "Diga qual é, e o que decide isso…",
    submit: "Confirmar decisão →",
    score: (a: number, b: number) => `${a} de ${b} corretos`,
    advance: "Continuar →",
  },
} as const;

export default function DiscriminateView({
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onCall,
  onNext,
  onAdvance,
}: {
  topic: string;
  title: string;
  plan: readonly PhaseId[];
  content: DiscriminateContent;
  session: DiscriminateSession;
  onExit: () => void;
  onCall: (index: number, read?: string) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = discriminateCopy(lang);
  const { accent, soft, border } = DISCRIMINATE_COLOR;
  const [mode, setMode] = useState<AnswerMode>("open");

  const item = content.cases[session.index];
  const called = item ? session.calls[item.id] : undefined;
  const answered = called !== undefined;
  const right = item ? called === item.answerIndex : false;
  const waved = discriminateFalsePositives(session, content);

  return (
    <PhaseShell
      phase="discriminate"
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
          {t.of(Math.min(session.index + 1, content.cases.length), content.cases.length)}
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
          marginBottom: 16,
        }}
      >
        {copy.lead}
      </div>

      {item && !session.done && (
        <div key={item.id} style={{ animation: "fadeUp .3s both" }}>
          <div
            data-testid="case-candidate"
            style={{
              padding: "16px 19px",
              borderRadius: 3,
              background: soft,
              border: `1px solid ${border}`,
              fontFamily: font.serif,
              fontSize: 16.5,
              lineHeight: 1.5,
            }}
          >
            <Rich text={item.candidate} />
          </div>
          <div style={{ marginTop: 16, fontSize: 15.5, fontWeight: 600 }}>
            {content.ask}
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
                  question={`${item.candidate}\n\n${content.ask}`}
                  options={item.readings}
                  accent={accent}
                  placeholder={t.placeholder}
                  submitLabel={t.submit}
                  onResolve={(index, read) => onCall(index, read)}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {item.readings.map((reading, i) => (
                    <button
                      key={i}
                      className="at-press"
                      data-testid={`action-pick-${i}`}
                      onClick={() => onCall(i)}
                      style={{
                        textAlign: "left",
                        padding: "12px 15px",
                        borderRadius: 3,
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        fontSize: 14.5,
                        lineHeight: 1.45,
                        color: color.ink,
                        cursor: "pointer",
                      }}
                    >
                      {reading}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {answered && (
            <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
              <div
                data-testid={right ? "call-right" : "call-wrong"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: right ? color.accent : color.amberInk,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: right ? color.accent : color.amberInk,
                  }}
                />
                {right ? t.right : t.wrong}
                <span style={{ color: color.inkGhost, letterSpacing: "0.06em" }}>
                  · {item.isInstance ? t.isInstance : t.isNot}
                </span>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {item.readings.map((reading, i) => {
                  const isAnswer = i === item.answerIndex;
                  const isCall = i === called;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 3,
                        fontSize: 14,
                        lineHeight: 1.45,
                        background: isAnswer ? soft : color.card,
                        border: `1px solid ${
                          isAnswer
                            ? accent
                            : isCall
                              ? "rgba(160,106,48,0.45)"
                              : color.hairline
                        }`,
                        color: isAnswer || isCall ? color.ink : color.inkMuted,
                      }}
                    >
                      {reading}
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
                  {copy.decidedBy}
                </span>
                <Rich text={item.decidedBy} />
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

              <Button
                data-testid="action-next"
                onClick={onNext}
                accent={accent}
                style={{ marginTop: 18 }}
              >
                {copy.next}
              </Button>
            </div>
          )}
        </div>
      )}

      {session.done && (
        <div style={{ animation: "fadeUp .4s both" }}>
          <div
            data-testid="phase-score"
            style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}
          >
            {t.score(discriminateScore(session, content), content.cases.length)}
          </div>
          {waved.length > 0 && (
            <div
              data-testid="over-included"
              style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}
            >
              {copy.overIncluded}
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: discriminatePassed(session, content)
                ? color.inkMuted
                : color.amberInk,
            }}
          >
            {discriminatePassed(session, content) ? copy.passed : copy.missed}
          </div>
          <Button
            data-testid="action-finish"
            onClick={onAdvance}
            style={{ marginTop: 22 }}
          >
            {t.advance}
          </Button>
        </div>
      )}
    </PhaseShell>
  );
}
