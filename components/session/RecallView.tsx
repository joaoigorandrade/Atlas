"use client";

// Recall — a brief, a blank box, and nothing else until they submit.
//
// The emptiness is the design. Anything on this page that could be read
// instead of retrieved defeats the phase, so the rubric is withheld, the cue
// has to be asked for, and asking for it is recorded: a cued retrieval is a
// different reading and the report says so rather than quietly counting it the
// same.

import { useState } from "react";
import {
  RECALL_COLOR,
  recallCopy,
  recallPassed,
  recallScore,
  verdictLabel,
  VERDICT_COLOR,
  type PhaseId,
  type RecallContent,
  type RecallSession,
  type TeachVerdict,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import type { PresenceState } from "@/lib/motion";

const STRINGS = {
  en: {
    submit: "Submit →",
    stuck: "I'm stuck",
    report: "What came back",
    score: (a: number, b: number) => `${a} of ${b} retrieved`,
    advance: "Continue →",
    hint: "⌘↵ to submit",
    judging: "Reading what you wrote…",
    showRubric: "what each row wanted",
  },
  "pt-BR": {
    submit: "Enviar →",
    stuck: "Travei",
    report: "O que voltou",
    score: (a: number, b: number) => `${a} de ${b} recuperados`,
    advance: "Continuar →",
    hint: "⌘↵ para enviar",
    judging: "Lendo o que você escreveu…",
    showRubric: "o que cada linha pedia",
  },
} as const;

export default function RecallView({
  presence,
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onWrite,
  onCue,
  onSubmit,
  onAgain,
  onAdvance,
}: {
  presence: PresenceState;
  title: string;
  plan: readonly PhaseId[];
  content: RecallContent;
  session: RecallSession;
  judging: boolean;
  onExit: () => void;
  onWrite: (value: string) => void;
  onCue: () => void;
  onSubmit: () => void;
  onAgain: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = recallCopy(lang);
  const { accent, soft, border } = RECALL_COLOR;
  const [showRubric, setShowRubric] = useState(false);
  const busy = judging || session.pending;
  const passed = recallPassed(session, content);

  return (
    <PhaseShell
      presence={presence}
      phase="recall"
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

      <div
        data-testid="recall-brief"
        style={{
          padding: "18px 20px",
          borderRadius: 12,
          background: soft,
          border: `1px solid ${border}`,
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
            {copy.yourAnswer}
          </div>
          <textarea
            data-testid="field-answer"
            value={session.written}
            disabled={busy}
            onChange={(e) => onWrite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (session.written.trim() && !busy) onSubmit();
              }
            }}
            placeholder={busy ? t.judging : copy.placeholder}
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
          <MicButton value={session.written} onChange={onWrite} disabled={busy} />

          {session.cued && (
            <div
              data-testid="recall-cue"
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

          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button
              className="at-press"
              data-testid="action-submit"
              onClick={onSubmit}
              disabled={busy || !session.written.trim()}
              style={{
                padding: "12px 20px",
                background:
                  busy || !session.written.trim() ? "rgba(44,40,35,0.07)" : accent,
                color: busy || !session.written.trim() ? color.inkGhost : color.accentInk,
                border: "none",
                borderRadius: 10,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: busy || !session.written.trim() ? "default" : "pointer",
              }}
            >
              {busy ? <InkDots size={3.5} /> : t.submit}
            </button>
            {!session.cued && (
              <button
                className="at-press"
                data-testid="action-cue"
                onClick={onCue}
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
            style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}
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
              data-testid="phase-score"
              style={{ fontSize: 13, color: color.inkMuted }}
            >
              {t.score(recallScore(session, content), content.rubric.length)}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {content.rubric.map((row) => {
              const verdict: TeachVerdict = session.retrieved[row.id] ?? "skipped";
              return (
                <div
                  key={row.id}
                  data-testid={`recall-row-${verdict}`}
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
                        {row.mustRetrieve.map((m, i) => (
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
            {showRubric ? "▾" : "▸"} {t.showRubric}
          </button>

          {(session.response || session.pending) && (
            <div
              style={{
                marginTop: 18,
                padding: "14px 17px",
                borderRadius: 12,
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
              {copy.again}
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
          {session.cued && (
            <div
              data-testid="recall-was-cued"
              style={{ marginTop: 6, fontSize: 13, color: color.inkGhost }}
            >
              {copy.cuedNote}
            </div>
          )}
        </div>
      )}
    </PhaseShell>
  );
}
