"use client";

// Provenance — one source, held open, and claims ruled against it one at a time.
//
// The source panel never leaves the screen. That is the point of the surface:
// the learner is reading and ruling at once, the way anyone working with a
// document does, rather than remembering a passage they were shown earlier.
//
// The reveal is built around the error the phase exists to catch. It does not
// only say right or wrong — where a learner ruled `proves` on something the
// source merely `asserts`, the closing panel calls that out on its own, because
// it survives a two-thirds score untouched.

import {
  PROVENANCE_COLOR,
  PROVENANCE_RULINGS,
  provenanceCopy,
  provenanceOvertrusted,
  provenancePassed,
  provenanceScore,
  type PhaseId,
  type ProvenanceContent,
  type ProvenanceRuling,
  type ProvenanceSession,
} from "@/lib/curriculum";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    right: "Right",
    wrong: "Not that",
    score: (a: number, b: number) => `${a} of ${b} ruled right`,
    advance: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    right: "Certo",
    wrong: "Não é isso",
    score: (a: number, b: number) => `${a} de ${b} corretos`,
    advance: "Continuar →",
  },
} as const;

export default function ProvenanceView({
  title,
  plan,
  content,
  session,
  onExit,
  onRule,
  onNext,
  onAdvance,
}: {
  title: string;
  plan: readonly PhaseId[];
  content: ProvenanceContent;
  session: ProvenanceSession;
  onExit: () => void;
  onRule: (ruling: ProvenanceRuling) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = provenanceCopy(lang);
  const { accent, soft, border } = PROVENANCE_COLOR;

  const item = content.claims[session.index];
  const ruled = item ? session.rulings[item.id] : undefined;
  const answered = ruled !== undefined;
  const right = item ? ruled === item.ruling : false;
  const overtrusted = provenanceOvertrusted(session, content);
  const passed = provenancePassed(session, content);

  return (
    <PhaseShell
      phase="provenance"
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
            Math.min(session.index + 1, content.claims.length),
            content.claims.length,
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

      {/* The source stays up for the whole pass — reading and ruling together
          is the thing being practised. */}
      <div
        data-testid="provenance-source"
        style={{
          padding: "16px 19px",
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
          {copy.theSource}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>
          {content.source.title}
        </div>
        <div style={{ fontSize: 13, color: color.inkMuted, marginBottom: 12 }}>
          {content.source.attribution} · {content.source.date}
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 15.5,
            lineHeight: 1.6,
            fontStyle: "italic",
            color: color.ink,
          }}
        >
          <Rich text={content.source.excerpt} />
        </div>
      </div>

      {item && !session.done && (
        <div key={item.id} style={{ marginTop: 20, animation: "fadeUp .3s both" }}>
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
            {copy.theClaim}
          </div>
          <div data-testid="provenance-claim" style={{ fontSize: 16, lineHeight: 1.5 }}>
            <Rich text={item.claim} />
          </div>

          {!answered && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {PROVENANCE_RULINGS.map((r) => (
                <button
                  key={r}
                  className="at-press"
                  data-testid={`action-rule-${r}`}
                  onClick={() => onRule(r)}
                  style={{
                    textAlign: "left",
                    padding: "12px 15px",
                    borderRadius: 3,
                    border: `1px solid ${color.hairlineStrong}`,
                    background: color.card,
                    fontSize: 14.5,
                    color: color.ink,
                    cursor: "pointer",
                  }}
                >
                  {copy[r]}
                </button>
              ))}
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
                  · {copy[item.ruling]}
                </span>
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
        <div style={{ marginTop: 22, animation: "fadeUp .4s both" }}>
          <div
            data-testid="phase-score"
            style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}
          >
            {t.score(provenanceScore(session, content), content.claims.length)}
          </div>
          {overtrusted.length > 0 && (
            <div
              data-testid="over-trusted"
              style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}
            >
              {copy.overtrusted}
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
            {passed ? copy.passed : copy.missed}
          </div>

          {/* Whose voice is missing is not a claim that can be ruled, so it is
              shown here rather than as an item. It is half the lesson. */}
          <div
            data-testid="provenance-silence"
            style={{
              marginTop: 18,
              padding: "14px 17px",
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
                marginBottom: 7,
              }}
            >
              {copy.silence}
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: color.ink }}>
              <Rich text={content.silence} />
            </div>
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
