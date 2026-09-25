"use client";

// Steelman — both cases written before either is judged, then a stand taken.
//
// The surface enforces the phase's own standard structurally: neither box can
// be submitted alone, and the verdicts arrive together. A learner who could
// send their own side first would get a green mark to write the other side
// against, which is the asymmetry the phase exists to remove.
//
// The disconfirmer is a required field, not a flourish. Without something that
// could actually be found or happen, what the learner has is an allegiance.

import {
  STEELMAN_COLOR,
  steelmanCopy,
  steelmanPassed,
  steelmanReady,
  type PhaseId,
  type SteelmanContent,
  type SteelmanSession,
} from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    placeholder: "Make the case they would actually make…",
    submit: "Submit both →",
    judging: "Reading both cases…",
    advance: "Continue →",
    disconfirmerPlaceholder: "A find, a document, an event that would move you…",
  },
  "pt-BR": {
    placeholder: "Escreva o argumento que eles mesmos fariam…",
    submit: "Enviar os dois →",
    judging: "Lendo os dois argumentos…",
    advance: "Continuar →",
    disconfirmerPlaceholder: "Um achado, um documento, um fato que te moveria…",
  },
} as const;

export default function SteelmanView({
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onWrite,
  onHold,
  onSubmit,
  onAdvance,
}: {
  title: string;
  plan: readonly PhaseId[];
  content: SteelmanContent;
  session: SteelmanSession;
  judging: boolean;
  onExit: () => void;
  onWrite: (positionId: string, text: string) => void;
  onHold: (positionId: string, disconfirmer: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = steelmanCopy(lang);
  const { accent, soft, border } = STEELMAN_COLOR;

  const ready = steelmanReady(session, content);
  const passed = steelmanPassed(session, content);
  const disconfirmer = session.disconfirmer ?? "";

  return (
    <PhaseShell
      phase="steelman"
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
          marginBottom: 16,
        }}
      >
        {copy.lead}
      </div>

      <div
        data-testid="steelman-question"
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
        <Rich text={content.question} />
      </div>

      {content.positions.map((p, i) => {
        const verdict = session.verdicts[p.id];
        return (
          <div key={p.id} style={{ marginTop: 20 }}>
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
              {copy.writeFor}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{p.label}</div>
            <div style={{ fontSize: 13, color: color.inkMuted, marginTop: 2 }}>
              {copy.heldBy} {p.heldBy}
            </div>

            {session.done ? (
              <div style={{ marginTop: 10 }}>
                <div
                  data-testid={`steelman-verdict-${i}`}
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10.5,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: verdict === "strong" ? color.accent : color.amberInk,
                  }}
                >
                  {verdict ? copy[verdict] : ""}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    padding: "12px 15px",
                    borderRadius: 3,
                    border: `1px solid ${color.hairline}`,
                    background: color.card,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: color.inkMuted,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {session.cases[p.id]}
                </div>
              </div>
            ) : (
              <div style={{ position: "relative", marginTop: 10 }}>
                <textarea
                  data-testid={`field-case-${i}`}
                  value={session.cases[p.id] ?? ""}
                  onChange={(e) => onWrite(p.id, e.target.value)}
                  placeholder={t.placeholder}
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "13px 15px",
                    paddingRight: 46,
                    borderRadius: 3,
                    border: `1px solid ${color.hairlineStrong}`,
                    background: color.card,
                    fontFamily: font.sans,
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: color.ink,
                    resize: "vertical",
                  }}
                />
                <div style={{ position: "absolute", right: 10, top: 10 }}>
                  <MicButton
                    value={session.cases[p.id] ?? ""}
                    onChange={(next) => onWrite(p.id, next)}
                    accent={accent}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!session.done && (
        <div style={{ marginTop: 22 }}>
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
            {copy.whichHolds}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {content.positions.map((p, i) => (
              <button
                key={p.id}
                className="at-press"
                data-testid={`action-hold-${i}`}
                onClick={() => onHold(p.id, disconfirmer)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 3,
                  border: `1px solid ${session.holds === p.id ? accent : color.hairlineStrong}`,
                  background: session.holds === p.id ? soft : color.card,
                  fontSize: 14,
                  color: color.ink,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: color.inkGhost,
              marginBottom: 6,
            }}
          >
            {copy.disconfirmer}
          </div>
          <div style={{ fontSize: 13, color: color.inkMuted, marginBottom: 8 }}>
            {copy.disconfirmerHint}
          </div>
          <textarea
            data-testid="field-disconfirmer"
            value={disconfirmer}
            onChange={(e) => onHold(session.holds ?? "", e.target.value)}
            placeholder={t.disconfirmerPlaceholder}
            rows={2}
            style={{
              width: "100%",
              padding: "13px 15px",
              borderRadius: 3,
              border: `1px solid ${color.hairlineStrong}`,
              background: color.card,
              fontFamily: font.sans,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: color.ink,
              resize: "vertical",
            }}
          />

          <button
            className="at-press"
            data-testid="action-submit"
            disabled={!ready || judging}
            onClick={onSubmit}
            style={{
              marginTop: 18,
              width: "100%",
              padding: 15,
              borderRadius: 3,
              border: "none",
              background: ready && !judging ? accent : color.hairlineStrong,
              color: color.accentInk,
              fontSize: 15,
              fontFamily: font.caps,
              letterSpacing: "0.06em",
              cursor: ready && !judging ? "pointer" : "default",
            }}
          >
            {judging ? t.judging : t.submit}
          </button>
        </div>
      )}

      {session.done && (
        <div style={{ marginTop: 22, animation: "fadeUp .4s both" }}>
          {session.response && (
            <div
              data-testid="steelman-response"
              style={{
                fontFamily: font.serif,
                fontSize: 16,
                lineHeight: 1.6,
                color: color.ink,
              }}
            >
              <Rich text={session.response} />
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: passed ? color.inkMuted : color.amberInk,
            }}
          >
            {passed
              ? copy.passed
              : disconfirmer.trim().length < 15
                ? copy.noDisconfirmer
                : copy.missed}
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
