"use client";

// Drill — bare reps, a live clock, and nothing else on the page.
//
// Deliberately the sparest surface in the app. Every element that is not the
// call is something to read instead of recall, and the phase measures how long
// the call takes. The clock runs visibly, because knowing it is running is
// part of what makes the rep a drill rather than a quiz.
//
// Open-ended stays available, but Drill is the one phase that defaults to the
// closed form: routing a timed rep through a judge round-trip would measure
// the network, not the learner.

import { useEffect, useState } from "react";
import {
  DRILL_COLOR,
  DRILL_TARGET_MS,
  drillAutomatic,
  drillCopy,
  drillLabored,
  drillMedianMs,
  drillPassed,
  drillScore,
  type DrillContent,
  type DrillSession,
  type PhaseId,
} from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import PhaseShell from "@/components/session/parts/PhaseShell";
import { color, font } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    right: "Right",
    wrong: "No",
    placeholder: "Answer…",
    submit: "Answer →",
    score: (a: number, b: number) => `${a} of ${b} right`,
    advance: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    right: "Certo",
    wrong: "Não",
    placeholder: "Responda…",
    submit: "Responder →",
    score: (a: number, b: number) => `${a} de ${b} certos`,
    advance: "Continuar →",
  },
} as const;

/** The live clock on the open rep. Its own component so the tick re-renders
 *  one number rather than the whole surface. */
function RepClock({ since, accent }: { since: number; accent: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [since]);
  const ms = Math.max(0, now - since);
  return (
    <span
      data-testid="rep-clock"
      style={{
        fontFamily: font.mono,
        fontSize: 11,
        color: ms > DRILL_TARGET_MS ? color.amberInk : accent,
      }}
    >
      {(ms / 1000).toFixed(1)}s
    </span>
  );
}

export default function DrillView({
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onAnswer,
  onNext,
  onAdvance,
}: {
  topic: string;
  title: string;
  plan: readonly PhaseId[];
  content: DrillContent;
  session: DrillSession;
  onExit: () => void;
  onAnswer: (index: number) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = drillCopy(lang);
  const { accent, soft } = DRILL_COLOR;
  // The one phase that opens on the closed form — see the note at the top.
  const [mode, setMode] = useState<AnswerMode>("choices");

  const rep = content.reps[session.index];
  const hit = rep ? session.hits[rep.id] : undefined;
  const answered = hit !== undefined;
  const right = rep ? hit === rep.answerIndex : false;
  const labored = drillLabored(session, content);

  return (
    <PhaseShell
      phase="drill"
      kicker={copy.kicker}
      accent={accent}
      title={title}
      plan={plan}
      lang={lang}
      onExit={onExit}
      headerRight={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {rep && !answered && !session.done && (
            <RepClock since={session.openedAt} accent={accent} />
          )}
          <span
            data-testid="phase-progress"
            style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}
          >
            {t.of(Math.min(session.index + 1, content.reps.length), content.reps.length)}
          </span>
        </div>
      }
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: color.inkFaint,
          marginBottom: 24,
        }}
      >
        {copy.lead}
      </div>

      {rep && !session.done && (
        <div key={rep.id} style={{ animation: "fadeUp .2s both" }}>
          <div
            data-testid="rep-prompt"
            style={{
              fontFamily: font.serif,
              fontSize: 22,
              lineHeight: 1.35,
              marginBottom: 20,
            }}
          >
            {rep.prompt}
          </div>

          {!answered && (
            <>
              <div style={{ marginBottom: 12 }}>
                <AnswerModeToggle mode={mode} onMode={setMode} accent={accent} />
              </div>
              {mode === "choices" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rep.answers.map((answer, i) => (
                    <button
                      key={i}
                      className="at-press"
                      data-testid={`action-pick-${i}`}
                      onClick={() => onAnswer(i)}
                      style={{
                        textAlign: "left",
                        padding: "13px 16px",
                        borderRadius: 3,
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        fontSize: 15.5,
                        color: color.ink,
                        cursor: "pointer",
                      }}
                    >
                      {answer}
                    </button>
                  ))}
                </div>
              ) : (
                <OpenAnswer
                  topic={topic}
                  nodeLabel={title}
                  question={rep.prompt}
                  options={rep.answers}
                  accent={accent}
                  rows={2}
                  placeholder={t.placeholder}
                  submitLabel={t.submit}
                  onResolve={(index) => onAnswer(index)}
                />
              )}
            </>
          )}

          {answered && (
            <div style={{ animation: "fadeUp .2s both" }}>
              <div
                data-testid={right ? "rep-right" : "rep-wrong"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontFamily: font.mono,
                  fontSize: 11,
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
                <span style={{ color: color.inkGhost, letterSpacing: "0.04em" }}>
                  · {((session.took[rep.id] ?? 0) / 1000).toFixed(1)}s
                </span>
              </div>

              {!right && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 3,
                    background: soft,
                    border: `1px solid ${accent}55`,
                    fontSize: 15,
                  }}
                >
                  {rep.answers[rep.answerIndex]}
                </div>
              )}

              <div
                style={{
                  marginTop: 12,
                  fontSize: 14,
                  lineHeight: 1.5,
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
                  {copy.rule}
                </span>
                {rep.rule}
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
            {t.score(drillScore(session, content), content.reps.length)}
          </div>
          <div
            data-testid="drill-pace"
            style={{
              fontSize: 13.5,
              color: drillAutomatic(session, content) ? color.inkMuted : color.amberInk,
            }}
          >
            {copy.pace((drillMedianMs(session, content) / 1000).toFixed(1))}
          </div>
          {labored.length > 0 && (
            <div
              data-testid="drill-labored"
              style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}
            >
              {copy.labored}
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: drillPassed(session, content) ? color.inkMuted : color.amberInk,
            }}
          >
            {drillPassed(session, content) ? copy.passed : copy.missed}
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
