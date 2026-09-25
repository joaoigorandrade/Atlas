"use client";

// Predict — a situation, a confidence, then a forecast. In that order.
//
// The confidence tap is taken BEFORE the forecast and is disabled after it,
// which is what makes it a calibration reading rather than a rating of a
// result already seen. The closing panel separates the forecasts held
// confidently and still wrong, because those are the ones worth revisiting.

import { useState } from "react";
import {
  PREDICT_COLOR,
  PREDICT_CONFIDENCE,
  predictCopy,
  predictOverconfident,
  predictPassed,
  predictScore,
  type PhaseId,
  type PredictContent,
  type PredictSession,
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
    held: "Your forecast held",
    broke: "It went the other way",
    placeholder: "Say what happens, and why it has to…",
    submit: "Commit forecast →",
    score: (a: number, b: number) => `${a} of ${b} forecast right`,
    advance: "Continue →",
    rateFirst: "Commit to how sure you are first.",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    held: "Sua previsão se confirmou",
    broke: "Foi para o outro lado",
    placeholder: "Diga o que acontece, e por que tem de ser assim…",
    submit: "Confirmar previsão →",
    score: (a: number, b: number) => `${a} de ${b} previsões certas`,
    advance: "Continuar →",
    rateFirst: "Diga primeiro quanta certeza você tem.",
  },
} as const;

export default function PredictView({
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onSure,
  onCommit,
  onNext,
  onAdvance,
}: {
  topic: string;
  title: string;
  plan: readonly PhaseId[];
  content: PredictContent;
  session: PredictSession;
  onExit: () => void;
  onSure: (level: number) => void;
  onCommit: (index: number, read?: string) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = predictCopy(lang);
  const { accent, soft, border } = PREDICT_COLOR;
  const [mode, setMode] = useState<AnswerMode>("open");

  const item = content.setups[session.index];
  const forecast = item ? session.forecasts[item.id] : undefined;
  const committed = forecast !== undefined;
  const sure = item ? session.sureness[item.id] : undefined;
  const held = item ? forecast === item.answerIndex : false;
  const overconfident = predictOverconfident(session, content);

  return (
    <PhaseShell
      phase="predict"
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
            Math.min(session.index + 1, content.setups.length),
            content.setups.length,
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
          marginBottom: 16,
        }}
      >
        {copy.lead}
      </div>

      {item && !session.done && (
        <div key={item.id} style={{ animation: "fadeUp .3s both" }}>
          <div
            data-testid="setup-situation"
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
            <Rich text={item.situation} />
          </div>

          {/* The confidence tap. Before the forecast, and locked after it. */}
          <div style={{ marginTop: 16 }}>
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
              {copy.howSure}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {PREDICT_CONFIDENCE.map((_, i) => {
                const active = sure === i;
                return (
                  <button
                    key={i}
                    className="at-press"
                    data-testid={`action-sure-${i}`}
                    disabled={committed}
                    onClick={() => onSure(i)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 3,
                      border: `1px solid ${active ? accent : color.hairlineStrong}`,
                      background: active ? soft : color.card,
                      color: committed && !active ? color.inkGhost : color.ink,
                      fontSize: 13,
                      cursor: committed ? "default" : "pointer",
                      opacity: committed && !active ? 0.5 : 1,
                    }}
                  >
                    {copy.sureness[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {!committed && (
            <div style={{ marginTop: 16 }}>
              {sure === undefined ? (
                <div style={{ fontSize: 13.5, color: color.amberInk }}>{t.rateFirst}</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <AnswerModeToggle mode={mode} onMode={setMode} accent={accent} />
                  </div>
                  {mode === "open" ? (
                    <OpenAnswer
                      topic={topic}
                      nodeLabel={title}
                      question={`${item.situation}\n\nWhat happens?`}
                      options={item.outcomes}
                      accent={accent}
                      placeholder={t.placeholder}
                      submitLabel={t.submit}
                      onResolve={(index, read) => onCommit(index, read)}
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {item.outcomes.map((outcome, i) => (
                        <button
                          key={i}
                          className="at-press"
                          data-testid={`action-pick-${i}`}
                          onClick={() => onCommit(i)}
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
                          {outcome}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {committed && (
            <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
              <div
                data-testid={held ? "forecast-held" : "forecast-broke"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: held ? color.accent : color.amberInk,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: held ? color.accent : color.amberInk,
                  }}
                />
                {held ? t.held : t.broke}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {item.outcomes.map((outcome, i) => {
                  const isAnswer = i === item.answerIndex;
                  const isPick = i === forecast;
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
                            : isPick
                              ? "rgba(160,106,48,0.45)"
                              : color.hairline
                        }`,
                        color: isAnswer || isPick ? color.ink : color.inkMuted,
                      }}
                    >
                      {outcome}
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
                  {copy.because}
                </span>
                <Rich text={item.because} />
              </div>

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
            {t.score(predictScore(session, content), content.setups.length)}
          </div>
          {overconfident.length > 0 && (
            <div
              data-testid="overconfident"
              style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}
            >
              {copy.overconfident}
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: predictPassed(session, content) ? color.inkMuted : color.amberInk,
            }}
          >
            {predictPassed(session, content) ? copy.passed : copy.missed}
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
