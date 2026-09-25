"use client";

// Perform — one case, kept on screen while the work is written against it.
//
// The case stays visible (unlike Recall's blank page) because this is not a
// memory test: the learner is allowed to look at what they are working on. The
// run report is ordered as a run, marks where it broke, and distinguishes a
// load-bearing step that never happened from a check they skipped — which is
// exactly the distinction `performPassed` gates on.

import {
  PERFORM_COLOR,
  performBroken,
  performCopy,
  performPassed,
  verdictLabel,
  VERDICT_COLOR,
  type PerformContent,
  type PerformSession,
  type PhaseId,
  type TeachVerdict,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    submit: "Submit the run →",
    stuck: "Where do I start?",
    report: "The run",
    advance: "Continue →",
    hint: "⌘↵ to submit",
    judging: "Checking your work…",
    loadBearing: "load-bearing",
  },
  "pt-BR": {
    submit: "Enviar a execução →",
    stuck: "Por onde começo?",
    report: "A execução",
    advance: "Continuar →",
    hint: "⌘↵ para enviar",
    judging: "Conferindo sua execução…",
    loadBearing: "essencial",
  },
} as const;

export default function PerformView({
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onWork,
  onNudge,
  onSubmit,
  onRerun,
  onAdvance,
}: {
  title: string;
  plan: readonly PhaseId[];
  content: PerformContent;
  session: PerformSession;
  judging: boolean;
  onExit: () => void;
  onWork: (value: string) => void;
  onNudge: () => void;
  onSubmit: () => void;
  onRerun: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = performCopy(lang);
  const { accent, soft, border } = PERFORM_COLOR;
  const busy = judging || session.pending;
  const passed = performPassed(session, content);
  const broken = performBroken(session, content);
  const missedLoadBearing = content.steps.filter(
    (s) => s.loadBearing && session.ran[s.id] === "skipped",
  );

  return (
    <PhaseShell
      phase="perform"
      kicker={copy.kicker}
      accent={accent}
      title={title}
      plan={plan}
      lang={lang}
      onExit={onExit}
    >
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

      {/* The case stays on screen for the whole run — this is not a memory test. */}
      <div
        data-testid="perform-task"
        style={{
          padding: "18px 20px",
          borderRadius: 3,
          background: soft,
          border: `1px solid ${border}`,
        }}
      >
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
          {copy.theCase}
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 17, lineHeight: 1.5 }}>
          <Rich text={content.task} />
        </div>
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
            {copy.yourWork}
          </div>
          <textarea
            data-testid="field-answer"
            value={session.work}
            disabled={busy}
            onChange={(e) => onWork(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (session.work.trim() && !busy) onSubmit();
              }
            }}
            placeholder={busy ? t.judging : copy.placeholder}
            rows={12}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "14px 16px",
              borderRadius: 3,
              fontSize: 14.5,
              lineHeight: 1.6,
              fontFamily: font.mono,
              border: `1px solid ${color.hairlineStrong}`,
              background: color.card,
              color: color.ink,
              opacity: busy ? 0.6 : 1,
            }}
          />
          <MicButton value={session.work} onChange={onWork} disabled={busy} />

          {session.nudged && (
            <div
              data-testid="perform-nudge"
              style={{
                marginTop: 12,
                padding: "12px 15px",
                borderRadius: 3,
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

          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button
              className="at-press"
              data-testid="action-submit"
              onClick={onSubmit}
              disabled={busy || !session.work.trim()}
              style={{
                padding: "12px 20px",
                background: busy || !session.work.trim() ? "rgba(43,33,24,0.07)" : accent,
                color: busy || !session.work.trim() ? color.inkGhost : color.accentInk,
                border: "none",
                borderRadius: 3,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: busy || !session.work.trim() ? "default" : "pointer",
              }}
            >
              {busy ? <InkDots size={3.5} /> : t.submit}
            </button>
            {!session.nudged && (
              <button
                className="at-press"
                data-testid="action-nudge"
                onClick={onNudge}
                disabled={busy}
                style={{
                  padding: "11px 15px",
                  background: color.card,
                  border: "1px solid rgba(160,106,48,0.4)",
                  borderRadius: 3,
                  fontSize: 13,
                  color: color.amberInk,
                  cursor: "pointer",
                }}
              >
                {t.stuck}
              </button>
            )}
            <span
              style={{ fontFamily: font.mono, fontSize: 10.5, color: color.inkGhost }}
            >
              {t.hint}
            </span>
          </div>
        </div>
      )}

      {session.reported && (
        <div style={{ marginTop: 26, animation: "fadeUp .4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: accent,
              marginBottom: 14,
            }}
          >
            {t.report}
          </div>

          {/* Ordered as a run, numbered as a run. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {content.steps.map((step, i) => {
              const verdict: TeachVerdict = session.ran[step.id] ?? "skipped";
              return (
                <div
                  key={step.id}
                  data-testid={`perform-step-${verdict}`}
                  style={{
                    display: "flex",
                    gap: 11,
                    padding: "11px 14px",
                    borderRadius: 3,
                    background: color.card,
                    border: `1px solid ${color.hairline}`,
                    borderLeft: `3px solid ${VERDICT_COLOR[verdict]}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: color.inkGhost,
                      marginTop: 2,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5 }}>
                      {step.step}
                      {step.loadBearing && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontFamily: font.mono,
                            fontSize: 9.5,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: color.inkGhost,
                          }}
                        >
                          {t.loadBearing}
                        </span>
                      )}
                    </div>
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
                    {session.quotes[step.id] && (
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: font.mono,
                          fontSize: 13,
                          color: color.inkMuted,
                        }}
                      >
                        {session.quotes[step.id]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {(session.response || session.pending) && (
            <div
              style={{
                marginTop: 18,
                padding: "14px 17px",
                borderRadius: 3,
                background: soft,
                border: `1px solid ${border}`,
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
                borderRadius: 3,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.advance}
            </button>
            <button
              className="at-press"
              data-testid="action-rerun"
              onClick={onRerun}
              style={{
                flex: "0 0 auto",
                padding: "15px 18px",
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 3,
                fontSize: 14,
                color: color.inkMuted,
                cursor: "pointer",
              }}
            >
              {copy.rerun}
            </button>
          </div>

          <div
            data-testid="perform-verdict"
            style={{
              marginTop: 10,
              fontSize: 13.5,
              color: passed ? color.inkMuted : color.amberInk,
            }}
          >
            {passed ? copy.passed : broken.length ? copy.brokeAt : copy.thin}
          </div>
          {!passed && !broken.length && missedLoadBearing.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: color.inkGhost }}>
              {missedLoadBearing.map((s) => s.step).join(" · ")}
            </div>
          )}
        </div>
      )}
    </PhaseShell>
  );
}
