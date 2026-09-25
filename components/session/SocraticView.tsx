"use client";

import { useEffect, useRef, useState } from "react";
import {
  type PhaseId,
  phaseLabel,
  primaryPhase,
  STATE_COLOR,
  socraticOutcome,
  type SocraticAction,
  type SocraticSession,
  type SocraticTurn,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { InlineError } from "@/components/ErrorState";
import { MicButton } from "@/components/VoiceInput";
import { color, font, kicker } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";

import Rich from "@/components/Rich";
import { HelpDial, Ledger } from "@/components/session/socraticChrome";
import { STRINGS } from "@/components/session/socraticCopy";

// Socratic borrows the shared state colors: learning blue for the phase label,
// mastered green for "understanding established", the scaffolding warmth from
// HELP_COLOR, and shaky/amber for a caught wrong turn.
const BLUE = STATE_COLOR.learning;
const GREEN = STATE_COLOR.mastered;

interface SocraticViewProps {
  /** The node this session teaches — titles the view. */
  title: string;
  /** The node's own ladder — the breadcrumb draws this, not the catalogue,
   *  since a `fact` and a `principle` no longer run the same rungs. */
  plan: readonly PhaseId[];
  /** What the node has finished: the hand-off opens the first rung still owed. */
  done?: readonly PhaseId[];
  session: SocraticSession;
  /** True while the server judge is classifying the typed answer (#25). */
  judging: boolean;
  /** A targeted pass on a red gap node (#12) — completing it closes the gap. */
  gapMode: boolean;
  onExit: () => void;
  /** Submit the learner's own typed answer for judging. */
  onAnswer: (text: string) => void;
  /** "I'm stuck", "Show me" and the scaffolding dial (#B) — reducer actions. */
  dispatch: (action: SocraticAction) => void;
  onAdvance: () => void;
  /** Re-run the judge on the answer already in the transcript, for a turn whose
   *  grading failed. Absent when there is nothing to retry. */
  onRetryJudge?: () => void;
}

/** Per-tone accent for an AI bubble: a caught error, an affirmation, teaching. */
function toneColor(tone: SocraticTurn["tone"]): string {
  switch (tone) {
    case "catch":
      return STATE_COLOR.shaky;
    case "affirm":
      return GREEN;
    case "teach":
      return BLUE;
    default:
      return color.hairlineStrong;
  }
}

export default function SocraticView({
  title,
  plan,
  session,
  judging,
  gapMode,
  onExit,
  onAnswer,
  done = [],
  dispatch,
  onAdvance,
  onRetryJudge,
}: SocraticViewProps) {
  const t = useT(STRINGS);
  // The pass streams its probes in one at a time. While the next one is still
  // being written there is nothing to answer, so the surface locks exactly the
  // way it does while an answer is being judged.
  const writing = session.awaitingNext;
  const busy = judging || writing;
  // The learner's own answer, typed. Cleared on submit, and again whenever a
  // new step opens — but NOT on "I'm stuck" or a failed judge call, either of
  // which used to wipe a still-relevant draft out from under the learner.
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [session.step]);
  const submitDraft = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onAnswer(text);
  };

  // ---- the transcript scrolls to the newest turn, including as a pending
  // bubble is typed into (not just when a whole new turn lands) -----------
  const logRef = useRef<HTMLDivElement | null>(null);
  const lastText = session.log.at(-1)?.text;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.log.length, lastText]);

  const breadcrumb = plan.map(phaseLabel).join(" → ");
  // What the pass earned (#C) — only meaningful once it's done.
  const outcome = session.done ? socraticOutcome(session, gapMode) : null;
  const doneColor = outcome === "flagged" ? STATE_COLOR.shaky : GREEN;
  const doneText =
    outcome === "flagged"
      ? t.doneFlagged
      : outcome === "assisted"
        ? t.doneAssisted
        : gapMode
          ? t.doneGap
          : t.doneUnderstood;
  // A flagged pass hands *back* — to the reading, or the map for a gap. Any
  // other names what `enterOwedPhase` opens, not the plan's successor.
  const owed = primaryPhase(plan, [...done, "socratic"]) ?? "retain";
  const advanceLabel =
    outcome === "flagged"
      ? gapMode
        ? t.advanceBack
        : t.advanceReread
      : gapMode
        ? t.advanceGap
        : t.advanceTeach(phaseLabel(owed));

  return (
    <Sheet data-testid="phase-socratic" aria-label="Socratic — {title}">
      <Masthead
        back={t.back}
        onBack={onExit}
        kicker={t.sessionLabel}
        accent={BLUE}
        title={title}
        meta={
          // How far through the pass. Both numbers were already in state and
          // neither was ever drawn, so a learner mid-probe had no way to tell
          // a pass that was nearly over from one that had barely started.
          !session.done && (
            <span data-testid="socratic-progress" style={kicker(12)}>
              {t.probeCount(Math.min(session.step + 1, session.total), session.total)}
            </span>
          )
        }
      >
        <span style={kicker(11.5)}>{t.scaffolding}</span>
        <HelpDial help={session.help} dispatch={dispatch} />
      </Masthead>

      {/* Body — the dialogue */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "30px 32px" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: color.inkFaint,
                  marginBottom: 22,
                }}
              >
                {t.breadcrumbLead}
              </div>
              {session.log.map((m, i) => (
                <Turn
                  key={i}
                  turn={m}
                  failedMessage={t.judgeFailed}
                  retryLabel={t.judgeRetry}
                  onRetry={onRetryJudge}
                />
              ))}
            </div>
          </div>

          {/* Input dock — replies, or the "understood" advance panel */}
          <div
            style={{
              flex: "0 0 auto",
              borderTop: `1px solid ${color.hairline}`,
              padding: "16px 32px 38px",
              background: "rgba(246,239,223,0.55)",
            }}
          >
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              {session.done ? (
                <div style={{ animation: "fadeUp .4s both" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                      fontSize: 13.5,
                      color: doneColor,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: doneColor,
                      }}
                    />
                    {doneText}
                  </div>
                  <Button
                    onClick={onAdvance}
                    style={{
                      boxShadow: `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(246,239,223,0.34)`,
                    }}
                  >
                    {advanceLabel}
                  </Button>
                </div>
              ) : (
                <>
                  <Ledger
                    sufficient={session.bar}
                    covered={session.covered}
                    banked={t.banked}
                    stillOpen={t.stillOpen}
                  />
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
                    {t.yourAnswer}
                  </div>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                    <textarea
                      data-testid="field-answer"
                      value={draft}
                      disabled={busy}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitDraft();
                        }
                      }}
                      placeholder={
                        writing
                          ? t.placeholderWriting
                          : judging
                            ? t.placeholderJudging
                            : t.placeholderAnswer
                      }
                      rows={2}
                      style={{
                        flex: 1,
                        resize: "none",
                        padding: "12px 15px",
                        borderRadius: 3,
                        fontSize: 14,
                        lineHeight: 1.45,
                        fontFamily: "inherit",
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        color: color.ink,
                        opacity: busy ? 0.6 : 1,
                      }}
                    />
                    <button
                      className="at-press"
                      data-testid="action-submit"
                      onClick={submitDraft}
                      disabled={busy || !draft.trim()}
                      style={{
                        flex: "0 0 auto",
                        padding: "12px 17px",
                        background:
                          busy || !draft.trim() ? "rgba(43,33,24,0.07)" : color.accent,
                        color: busy || !draft.trim() ? color.inkGhost : color.accentInk,
                        border: "none",
                        borderRadius: 3,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: busy || !draft.trim() ? "default" : "pointer",
                      }}
                    >
                      {busy ? <InkDots size={3.5} /> : t.send}
                    </button>
                  </div>
                  <MicButton value={draft} onChange={setDraft} disabled={busy} />
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      className="at-press"
                      onClick={() => dispatch({ type: "stuck" })}
                      disabled={busy}
                      style={{
                        padding: "9px 14px",
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
                    <button
                      className="at-press"
                      onClick={() => dispatch({ type: "tell" })}
                      disabled={busy}
                      style={{
                        padding: "9px 14px",
                        background: color.card,
                        border: `1px solid ${color.hairlineStrong}`,
                        borderRadius: 3,
                        fontSize: 13,
                        color: color.inkMuted,
                        cursor: "pointer",
                      }}
                    >
                      {t.tellMe}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 24,
          fontFamily: font.mono,
          fontSize: 10.5,
          color: color.inkGhost,
        }}
      >
        {breadcrumb}
      </div>
    </Sheet>
  );
}

/** One transcript line — an AI probe with its move tag, or a learner reply. */
function Turn({
  turn,
  failedMessage,
  retryLabel,
  onRetry,
}: {
  turn: SocraticTurn;
  failedMessage: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  const t = useT(STRINGS);
  if (turn.role === "learner") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            maxWidth: "82%",
            background: color.chipBg,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: "12px 12px 3px 12px",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.45,
            color: color.inkSoft,
            animation: "fadeUp .25s both",
          }}
        >
          <Rich text={turn.text} />
        </div>
      </div>
    );
  }
  const accent = toneColor(turn.tone);
  return (
    <div style={{ marginBottom: 18, animation: "fadeUp .3s both" }}>
      {turn.move && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            // inkMuted, not inkGhost: this names the move the probe is making,
            // which is content, and ghost at 9.5px sat around 2.3:1.
            color: color.inkMuted,
            marginBottom: 6,
          }}
        >
          {t.move[turn.move]}
        </div>
      )}
      <div
        style={{
          maxWidth: "88%",
          background: color.card,
          border: `1px solid ${color.hairline}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: "3px 12px 12px 12px",
          padding: "12px 15px",
          fontFamily: font.serif,
          fontSize: 15.5,
          lineHeight: 1.5,
          color: color.ink,
        }}
      >
        {/* A judge call that never came back. The failure used to be written
            in here as the tutor's own words; now the bubble says plainly that
            nothing was graded, and offers to try again. */}
        {turn.failed ? (
          <InlineError
            message={failedMessage}
            retryLabel={retryLabel}
            onRetry={onRetry}
          />
        ) : (
          /* The verdict has landed and the tutor's wording is still arriving —
             it types itself into the bubble rather than swapping in whole. */
          <StreamingText text={turn.text} writing={!!turn.pending} />
        )}
      </div>
    </div>
  );
}
