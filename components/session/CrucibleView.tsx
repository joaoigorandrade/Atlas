"use client";

import {
  CONFIDENCE_LEVELS,
  CRUCIBLE_COLOR,
  STATE_COLOR,
  TRANSFER_COLOR,
  crucibleCalib,
  crucibleCurrentRung,
  crucibleProblem,
  type ConfidenceLevel,
  type CrucibleContent,
  type CrucibleSession,
} from "@/lib/curriculum";
import { InkDots } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

import Rich from "@/components/Rich";
// The Crucible owns the deep-rust accent; the transfer diagnostic borrows the
// shared mastered-green / gap-red so a carried-over sub-concept reads the same
// here as it does on the map.
const RUST = CRUCIBLE_COLOR.accent;

const STRINGS = {
  en: {
    map: "← Map",
    sessionCrucible: "Session · Crucible",
    kickerApplication: "Application · transfer under desirable difficulty",
    heading: "Prove it transfers.",
    intro: "Recognizing an idea when it’s handed to you is fluency, not mastery. The Crucible hands you the concept in a framing you’ve never seen — if it survives that, it’s yours.",
    kickerWorkspace: "Workspace · a wrong attempt is diagnostic",
    judgingAttempt: "Judging your attempt",
    submitAttempt: "Submit attempt",
    fillSample: "fill a sample attempt",
    kickerCalibration: "Calibration · before you see it",
    confidenceQuestion: "How sure are you that you can apply this in a situation you’ve never seen?",
    confidenceBody: "We record this now, then compare it to what actually happens. The gap between the two is the most useful thing here.",
    nudge: (hint: string) => `Nudge · ${hint}`,
    kickerTransferDiagnostic: "Transfer diagnostic · what carried over",
    kickerConfidenceVsResult: "Confidence vs. result",
    gapWrittenTitle: "A gap was written back to your map.",
    gapWrittenBody: (gapLabel: string) => (
      <>
        “{gapLabel}” is now a red gap under this node, and the node itself
        dropped to <b>Shaky</b>. Close it here and it lifts to Mastered.
      </>
    ),
    hideReExplain: "Hide re-explanation",
    reExplainSocratic: "Re-explain · 30-sec Socratic",
    retryRung: "Re-attempt · one rung down →",
    reExplainLead: "A 30-second Socratic re-explanation, aimed straight at the gap:",
    transferConfirmedTitle: "Transfer confirmed.",
    transferConfirmedBody: (
      <>
        You applied it in a framing you were never handed. The gap is closed
        and this node lifts to <b>Mastered</b> — it now feeds Review on a
        spaced schedule.
      </>
    ),
    markMastered: "Mark Mastered · back to map →",
    difficultyLadder: "Difficulty ladder",
    drawnFromMap: "Drawn from your map",
    interleaveNote: "The problem interleaves mastered nodes so retrieval isn’t blocked on one idea.",
    youSaid: "You said",
    heldAgainst: "held against the result below",
  },
  "pt-BR": {
    map: "← Mapa",
    sessionCrucible: "Sessão · Crucible",
    kickerApplication: "Aplicação · transferência sob dificuldade desejável",
    heading: "Prove que isso transfere.",
    intro: "Reconhecer uma ideia quando ela é entregue de bandeja é fluência, não domínio. O Crucible entrega o conceito numa moldura que você nunca viu — se sobreviver a isso, é seu.",
    kickerWorkspace: "Espaço de trabalho · uma tentativa errada é diagnóstica",
    judgingAttempt: "Julgando sua tentativa",
    submitAttempt: "Enviar tentativa",
    fillSample: "preencher uma tentativa de exemplo",
    kickerCalibration: "Calibração · antes de ver",
    confidenceQuestion: "Quão seguro você está de que consegue aplicar isso numa situação que nunca viu?",
    confidenceBody: "Registramos isso agora e depois comparamos com o que realmente acontece. A distância entre os dois é a coisa mais útil aqui.",
    nudge: (hint: string) => `Dica · ${hint}`,
    kickerTransferDiagnostic: "Diagnóstico de transferência · o que se transferiu",
    kickerConfidenceVsResult: "Confiança vs. resultado",
    gapWrittenTitle: "Uma lacuna foi registrada no seu mapa.",
    gapWrittenBody: (gapLabel: string) => (
      <>
        “{gapLabel}” agora é uma lacuna vermelha sob este nó, e o próprio nó
        caiu para <b>Instável</b>. Feche-a aqui e ele sobe para Dominado.
      </>
    ),
    hideReExplain: "Ocultar reexplicação",
    reExplainSocratic: "Reexplicar · Socrático de 30s",
    retryRung: "Tentar de novo · um degrau abaixo →",
    reExplainLead: "Uma reexplicação Socrática de 30 segundos, direto na lacuna:",
    transferConfirmedTitle: "Transferência confirmada.",
    transferConfirmedBody: (
      <>
        Você aplicou isso numa moldura que nunca tinha recebido. A lacuna está
        fechada e este nó sobe para <b>Dominado</b> — agora ele entra na
        Revisão em um cronograma espaçado.
      </>
    ),
    markMastered: "Marcar como Dominado · voltar ao mapa →",
    difficultyLadder: "Escada de dificuldade",
    drawnFromMap: "Puxado do seu mapa",
    interleaveNote: "O problema intercala nós dominados para que a recuperação não fique presa a uma única ideia.",
    youSaid: "Você disse",
    heldAgainst: "comparado ao resultado abaixo",
  },
} as const;

interface CrucibleViewProps {
  /** The transfer content for this node (problem ladder, interleaved draws, gap). */
  content: CrucibleContent;
  session: CrucibleSession;
  /** True while the server judge grades the actual attempt (#27). */
  judging: boolean;
  onExit: () => void;
  /** State confidence before the problem is revealed — the calibration hook. */
  onConfidence: (level: ConfidenceLevel) => void;
  /** Edit the workspace attempt. */
  onAttempt: (value: string) => void;
  /** Drop a sample attempt into the workspace (a demo affordance). */
  onSample: () => void;
  /** Submit the attempt — a wrong one is still diagnostic. */
  onSubmit: () => void;
  /** Toggle the 30-second Socratic re-explanation aimed at the gap. */
  onToggleReExplain: () => void;
  /** Re-attempt one rung down, recalibrated. */
  onRetry: () => void;
  /** Transfer confirmed — close the gap and lift the node to Mastered. */
  onFinish: () => void;
}

export default function CrucibleView({
  content,
  session,
  judging,
  onExit,
  onConfidence,
  onAttempt,
  onSample,
  onSubmit,
  onToggleReExplain,
  onRetry,
  onFinish,
}: CrucibleViewProps) {
  const t = useT(STRINGS);
  const problem = crucibleProblem(session, content);
  const isConfidence = session.stage === "confidence";
  const isWork = session.stage === "work";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.sans,
        fontSize: 15,
        zIndex: 30,
        animation: "softIn 0.3s both",
      }}
    >
      {/* Header — ← Map · Session · Crucible · title · phase breadcrumb */}
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
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {t.map}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: RUST,
          }}
        >
          {t.sessionCrucible}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>
          <Rich text={content.centerLabel} />
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkGhost }}
        >
          Consume → Socratic → Feynman → Connect →{" "}
          <b style={{ color: RUST }}>Crucible</b> → Retain
        </span>
      </div>

      {/* Body — scrolls; centered 1040 column */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 32px 120px" }}>
          <div style={{ ...kicker(11), marginBottom: 10 }}>
            {t.kickerApplication}
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.12,
              margin: "0 0 10px",
            }}
          >
            {t.heading}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: color.inkMuted,
              margin: "0 0 34px",
              maxWidth: 660,
              lineHeight: 1.55,
            }}
          >
            {t.intro}
          </p>

          {isConfidence && <ConfidenceGate session={session} onConfidence={onConfidence} />}

          {isWork && problem && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 288px",
                gap: 32,
                alignItems: "start",
              }}
            >
              {/* Problem + workspace + diagnostic */}
              <div>
                <Problem problem={problem} />

                <div style={{ ...kicker(10, "0.12em"), marginBottom: 9 }}>
                  {t.kickerWorkspace}
                </div>
                <div
                  style={{
                    background: color.card,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 12,
                    padding: 5,
                    marginBottom: 12,
                  }}
                >
                  <textarea
                    value={session.attempt}
                    onChange={(e) => onAttempt(e.target.value)}
                    placeholder={problem.placeholder}
                    disabled={session.submitted}
                    style={{
                      width: "100%",
                      minHeight: 140,
                      resize: "vertical",
                      border: "none",
                      background: "transparent",
                      fontFamily: font.serif,
                      fontSize: 16,
                      lineHeight: 1.6,
                      color: color.ink,
                      padding: "13px 14px",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 12, marginTop: -4 }}>
                  <MicButton
                    value={session.attempt}
                    onChange={onAttempt}
                    disabled={session.submitted}
                    accent={RUST}
                  />
                </div>

                {session.submitted ? (
                  <Diagnostic
                    content={content}
                    session={session}
                    onToggleReExplain={onToggleReExplain}
                    onRetry={onRetry}
                    onFinish={onFinish}
                  />
                ) : (
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button
                      onClick={onSubmit}
                      disabled={judging}
                      style={{
                        padding: "14px 26px",
                        background: judging ? "rgba(44,40,35,0.07)" : RUST,
                        color: judging ? color.inkGhost : color.accentInk,
                        border: "none",
                        borderRadius: 12,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: judging ? "default" : "pointer",
                        boxShadow: judging ? "none" : `0 8px 22px ${CRUCIBLE_COLOR.glow}`,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {judging ? (
                        <>
                          {t.judgingAttempt}
                          <InkDots size={4} />
                        </>
                      ) : (
                        t.submitAttempt
                      )}
                    </button>
                    <button
                      onClick={onSample}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 13,
                        color: color.inkGhost,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      {t.fillSample}
                    </button>
                  </div>
                )}
              </div>

              {/* Sidebar — ladder, interleaved draws, stated confidence */}
              <Sidebar content={content} session={session} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The calibration gate — stated confidence captured before the problem shows. */
function ConfidenceGate({
  session,
  onConfidence,
}: {
  session: CrucibleSession;
  onConfidence: (level: ConfidenceLevel) => void;
}) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        maxWidth: 600,
        background: color.card,
        border: `1px solid ${CRUCIBLE_COLOR.border}`,
        borderRadius: 16,
        padding: "30px 30px 26px",
        animation: "fadeUp .3s both",
      }}
    >
      <div style={{ ...kicker(10, "0.12em"), color: RUST, marginBottom: 12 }}>
        {t.kickerCalibration}
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 23,
          lineHeight: 1.3,
          marginBottom: 6,
        }}
      >
        {t.confidenceQuestion}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: color.inkFaint,
          lineHeight: 1.55,
          marginBottom: 20,
        }}
      >
        {t.confidenceBody}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {CONFIDENCE_LEVELS.map((label, i) => {
          const active = session.conf === i;
          return (
            <button
              key={label}
              onClick={() => onConfidence(i as ConfidenceLevel)}
              style={{
                flex: 1,
                padding: "15px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 15,
                textAlign: "center",
                fontFamily: font.serif,
                background: active ? CRUCIBLE_COLOR.soft : color.cardAlt,
                border: `1px solid ${active ? RUST : color.hairlineStrong}`,
                color: active ? RUST : color.inkSoft,
                transition: "border-color .15s, background .15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The problem card — the framing pill, the question, and the reframing nudge. */
function Problem({ problem }: { problem: NonNullable<ReturnType<typeof crucibleProblem>> }) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        background: color.card,
        border: `1px solid ${color.hairlineStrong}`,
        borderRadius: 16,
        padding: "24px 26px",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "inline-block",
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: RUST,
          background: CRUCIBLE_COLOR.soft,
          border: `1px solid ${CRUCIBLE_COLOR.border}`,
          borderRadius: 7,
          padding: "4px 9px",
          marginBottom: 14,
        }}
      >
        {problem.tag}
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 21,
          lineHeight: 1.4,
          color: color.ink,
          marginBottom: 16,
        }}
      >
        <Rich text={problem.q} />
      </div>
      <div
        style={{
          borderLeft: `3px solid ${CRUCIBLE_COLOR.border}`,
          padding: "3px 0 3px 14px",
          fontSize: 13.5,
          color: color.inkFaint,
          lineHeight: 1.5,
        }}
      >
        {t.nudge(problem.hint)}
      </div>
    </div>
  );
}

/** The post-submission diagnostic: what carried over, the calibration read-back,
 *  and the write-back panel (a partial gap + re-attempt, or a confirmed pass). */
function Diagnostic({
  content,
  session,
  onToggleReExplain,
  onRetry,
  onFinish,
}: {
  content: CrucibleContent;
  session: CrucibleSession;
  onToggleReExplain: () => void;
  onRetry: () => void;
  onFinish: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const calib = crucibleCalib(session, language);
  return (
    <div style={{ animation: "fadeUp .3s both" }}>
      <div style={{ ...kicker(10, "0.12em"), margin: "6px 0 12px" }}>
        {t.kickerTransferDiagnostic}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          marginBottom: 18,
        }}
      >
        {/* Graded, but the rows that diagnose the attempt are still being
            written — the panel is already open on the earned verdict. */}
        {session.transfer?.length === 0 && (
          <div
            style={{
              padding: "13px 16px",
              background: color.card,
              border: `1px solid ${color.hairline}`,
              borderLeft: `3px solid ${color.hairlineStrong}`,
              borderRadius: 10,
            }}
          >
            <InkDots size={4} />
          </div>
        )}
        {(session.transfer ?? content.transfer).map((row, i) => {
          const col = TRANSFER_COLOR[row.verdict];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "13px 16px",
                background: color.card,
                border: `1px solid ${color.hairline}`,
                borderLeft: `3px solid ${col}`,
                borderRadius: 10,
                fontSize: 14,
                lineHeight: 1.55,
                color: color.inkSoft,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: col,
                  flex: "0 0 auto",
                  marginTop: 6,
                }}
              />
              <span>{row.text}</span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairline}`,
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 16,
        }}
      >
        <div style={{ ...kicker(9.5, "0.1em"), color: RUST, marginBottom: 8 }}>
          {t.kickerConfidenceVsResult}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: color.inkSoft }}>
          <Rich text={calib} />
        </div>
      </div>

      {session.outcome === "partial" ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 13,
              background: "#fbeeeb",
              border: `1px solid rgba(193,87,74,0.32)`,
              borderRadius: 12,
              padding: "15px 18px",
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: TRANSFER_COLOR.red,
                flex: "0 0 auto",
                marginTop: 5,
              }}
            />
            <div>
              <div
                style={{ fontFamily: font.serif, fontSize: 17, marginBottom: 3 }}
              >
                {t.gapWrittenTitle}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                {t.gapWrittenBody(content.gap.label)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={onToggleReExplain}
              style={{
                padding: "13px 20px",
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                color: color.ink,
                cursor: "pointer",
              }}
            >
              {session.reExplain ? t.hideReExplain : t.reExplainSocratic}
            </button>
            <button
              onClick={onRetry}
              style={{
                padding: "13px 22px",
                background: RUST,
                color: color.accentInk,
                border: "none",
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: `0 8px 20px ${CRUCIBLE_COLOR.glow}`,
              }}
            >
              {t.retryRung}
            </button>
          </div>

          {session.reExplain && (
            <div
              style={{
                marginTop: 14,
                borderLeft: `3px solid ${STATE_COLOR.learning}`,
                padding: "4px 0 4px 15px",
                animation: "fadeUp .3s both",
              }}
            >
              <div
                style={{ fontSize: 12.5, color: color.inkFaint, marginBottom: 6 }}
              >
                {t.reExplainLead}
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: color.ink,
                }}
              >
                <Rich text={content.reExplain} />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 13,
              background: color.successBg,
              border: `1px solid rgba(76,139,99,0.34)`,
              borderRadius: 12,
              padding: "15px 18px",
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 11,
                height: 11,
                borderRadius: "50%",
                background: TRANSFER_COLOR.good,
                flex: "0 0 auto",
                marginTop: 5,
              }}
            />
            <div>
              <div
                style={{ fontFamily: font.serif, fontSize: 17, marginBottom: 3 }}
              >
                {t.transferConfirmedTitle}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                {t.transferConfirmedBody}
              </div>
            </div>
          </div>
          <button
            onClick={onFinish}
            style={{
              padding: "15px 26px",
              background: color.accent,
              color: color.accentInk,
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
            }}
          >
            {t.markMastered}
          </button>
        </>
      )}
    </div>
  );
}

/** The right rail — the difficulty ladder, the interleaved draws, and the
 *  learner's stated confidence held against the result. */
function Sidebar({
  content,
  session,
}: {
  content: CrucibleContent;
  session: CrucibleSession;
}) {
  const t = useT(STRINGS);
  const current = crucibleCurrentRung(session);
  const confLabel =
    session.conf != null ? CONFIDENCE_LEVELS[session.conf] : "—";
  return (
    <div>
      {/* Difficulty ladder */}
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 14,
          padding: "18px 18px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 14 }}>
          {t.difficultyLadder}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {content.rungs.map((rung, i) => {
            const status =
              i < current ? "done" : i === current ? "current" : "locked";
            const col =
              status === "done"
                ? TRANSFER_COLOR.good
                : status === "current"
                  ? RUST
                  : "#c3bdb2";
            return (
              <div
                key={rung.label}
                style={{ display: "flex", alignItems: "center", gap: 11 }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    background:
                      status === "done"
                        ? "rgba(76,139,99,0.14)"
                        : status === "current"
                          ? CRUCIBLE_COLOR.soft
                          : "transparent",
                    border: `1px solid ${
                      status === "locked" ? color.hairlineStrong : col
                    }`,
                    color: col,
                  }}
                >
                  {status === "done" ? "✓" : status === "current" ? "→" : "·"}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontFamily: font.serif,
                    color: status === "locked" ? color.inkGhost : color.ink,
                    fontWeight: status === "current" ? 600 : 400,
                  }}
                >
                  {rung.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interleaved draws — retrieval isn't blocked on one idea */}
      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairline}`,
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: 16,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 11 }}>
          {t.drawnFromMap}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {content.draws.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: color.inkSoft,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: TRANSFER_COLOR.good,
                  flex: "0 0 auto",
                }}
              />
              {label}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 11,
            fontSize: 12,
            color: color.inkFaint,
            lineHeight: 1.5,
          }}
        >
          {t.interleaveNote}
        </div>
      </div>

      {/* Stated confidence — held against the result below */}
      <div
        style={{
          background: color.card,
          border: `1px solid ${CRUCIBLE_COLOR.border}`,
          borderRadius: 14,
          padding: "15px 18px",
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), color: RUST, marginBottom: 7 }}>
          {t.youSaid}
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 18, color: color.ink }}>
          <Rich text={confLabel} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: color.inkFaint,
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {t.heldAgainst}
        </div>
      </div>
    </div>
  );
}
