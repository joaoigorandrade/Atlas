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
import { color, font, kicker } from "@/lib/theme";

// The Crucible owns the deep-rust accent; the transfer diagnostic borrows the
// shared mastered-green / gap-red so a carried-over sub-concept reads the same
// here as it does on the map.
const RUST = CRUCIBLE_COLOR.accent;

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
          ← Map
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
          Session · Crucible
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>
          {content.centerLabel}
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
            Application · transfer under desirable difficulty
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
            Prove it transfers.
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
            Recognizing an idea when it&rsquo;s handed to you is fluency, not
            mastery. The Crucible hands you the concept in a framing you&rsquo;ve
            never seen &mdash; if it survives that, it&rsquo;s yours.
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
                  Workspace · a wrong attempt is diagnostic
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
                      }}
                    >
                      {judging ? "Judging your attempt…" : "Submit attempt"}
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
                      fill a sample attempt
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
        Calibration · before you see it
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 23,
          lineHeight: 1.3,
          marginBottom: 6,
        }}
      >
        How sure are you that you can apply this in a situation you&rsquo;ve
        never seen?
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: color.inkFaint,
          lineHeight: 1.55,
          marginBottom: 20,
        }}
      >
        We record this now, then compare it to what actually happens. The gap
        between the two is the most useful thing here.
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
        {problem.q}
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
        Nudge · {problem.hint}
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
  const calib = crucibleCalib(session);
  return (
    <div style={{ animation: "fadeUp .3s both" }}>
      <div style={{ ...kicker(10, "0.12em"), margin: "6px 0 12px" }}>
        Transfer diagnostic · what carried over
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          marginBottom: 18,
        }}
      >
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
          Confidence vs. result
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: color.inkSoft }}>
          {calib}
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
                A gap was written back to your map.
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                &ldquo;{content.gap.label}&rdquo; is now a red gap under this
                node, and the node itself dropped to <b>Shaky</b>. Close it here
                and it lifts to Mastered.
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
              {session.reExplain
                ? "Hide re-explanation"
                : "Re-explain · 30-sec Socratic"}
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
              Re-attempt · one rung down →
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
                A 30-second Socratic re-explanation, aimed straight at the gap:
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: color.ink,
                }}
              >
                {content.reExplain}
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
                Transfer confirmed.
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                You applied it in a framing you were never handed. The gap is
                closed and this node lifts to <b>Mastered</b> &mdash; it now
                feeds Review on a spaced schedule.
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
            Mark Mastered · back to map →
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
          Difficulty ladder
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
          Drawn from your map
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
          The problem interleaves mastered nodes so retrieval isn&rsquo;t blocked
          on one idea.
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
          You said
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 18, color: color.ink }}>
          {confLabel}
        </div>
        <div
          style={{
            fontSize: 12,
            color: color.inkFaint,
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          held against the result below
        </div>
      </div>
    </div>
  );
}
