"use client";

// Perform — one case, kept on screen while the work is written against it.
//
// The case stays visible (unlike Recall's blank page) because this is not a
// memory test: the learner is allowed to look at what they are working on. The
// run report is ordered as a run and marks where it broke. On a first run the
// step names (never their results) are shown up front; re-runs hide them.

import { useEffect, useRef } from "react";
import KbdHint from "@/components/ui/KbdHint";
import {
  PERFORM_COLOR,
  performBroken,
  performCopy,
  performPassed,
  performSkipped,
  verdictLabel,
  VERDICT_COLOR,
  type PerformContent,
  type PerformSession,
  type PhaseId,
  type TeachVerdict,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import PerformWork from "@/components/session/perform/PerformWork";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { ExampleImage } from "@/components/session/consume/ExampleImage";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage } from "@/lib/i18n";

/** A report button: filled when it is the move the run calls for. */
const action = (strong: boolean, accent: string) =>
  ({
    flex: "1 1 auto",
    padding: "15px 18px",
    background: strong ? accent : color.card,
    color: strong ? color.accentInk : color.inkMuted,
    border: strong ? "none" : `1px solid ${color.hairlineStrong}`,
    borderRadius: 3,
    fontSize: 15,
    fontWeight: strong ? 600 : 400,
    cursor: "pointer",
  }) as const;

export default function PerformView({
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onWork,
  onSketch,
  onNudge,
  onSubmit,
  onRerun,
  onFix,
  onAdvance,
}: {
  title: string;
  plan: readonly PhaseId[];
  content: PerformContent;
  session: PerformSession;
  judging: boolean;
  onExit: () => void;
  onWork: (value: string) => void;
  onSketch: (png: string | undefined) => void;
  onNudge: () => void;
  onSubmit: () => void;
  onRerun: () => void;
  onFix: (steps: string[]) => void;
  onAdvance: () => void;
}) {
  const lang = useLanguage().language;
  const copy = performCopy(lang);
  const { accent, soft, border } = PERFORM_COLOR;
  const busy = judging || session.pending;
  const passed = performPassed(session, content);
  const broken = performBroken(session, content);
  const missed = performSkipped(session, content);
  // One fix in place per case; after that a failure gets a new case.
  const canFix = session.reported && !passed && !session.fixing;
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = busy || !(session.work.trim() || session.sketch);

  // Fixing lands on the line the report quoted — no new information, just
  // no hunting for it. Falls back to the end when the quote isn't verbatim.
  const fixingKey = session.reported ? "" : (session.fixing ?? []).join("\n");
  useEffect(() => {
    const el = field.current;
    if (!fixingKey || !el) return;
    const step = content.steps.find((s) => s.step === fixingKey.split("\n")[0]);
    const quote = (step && session.quotes[step.id]) || "";
    const at = quote ? el.value.indexOf(quote) : -1;
    el.focus({ preventScroll: true });
    if (at >= 0) el.setSelectionRange(at, at + quote.length);
    else el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Once per fix: the quote and work are read at the moment it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixingKey]);

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
      <div style={{ ...kicker(10.5, "0.14em", color.inkFaint), marginBottom: 14 }}>
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
        <div style={{ ...kicker(10, "0.12em", color.inkGhost), marginBottom: 8 }}>
          {copy.theCase}
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 17, lineHeight: 1.5 }}>
          <Rich text={content.task} />
        </div>
        <div style={{ marginTop: 12 }}>
          <ExampleImage
            example={{ title: content.task }}
            lead="Draw the figure for this problem with its given values only — never any step or result of the solution:"
          />
        </div>
        {session.previous?.length ? (
          <div style={{ marginTop: 10, fontSize: 14, color: color.inkSoft }}>
            {copy.lastBroke(session.previous.join(" · "))}
          </div>
        ) : null}
        {session.fixing?.length && !session.reported ? (
          <div
            data-testid="perform-fixing"
            style={{ marginTop: 10, fontSize: 14, color: color.amberInk }}
          >
            {copy.fixing(session.fixing.join(" · "))}
          </div>
        ) : null}
        {!session.reported && !session.previous && (
          <div data-testid="perform-steps" style={{ marginTop: 14 }}>
            <div style={{ ...kicker(10, "0.12em", color.inkGhost), marginBottom: 6 }}>
              {copy.steps}
            </div>
            <ol
              style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, color: color.inkSoft }}
            >
              {content.steps.map((s) => (
                <li key={s.id}>{s.step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {!session.reported && (
        <div style={{ marginTop: 22 }}>
          <PerformWork
            copy={copy}
            work={session.work}
            sketch={session.sketch}
            busy={busy}
            field={field}
            onWork={onWork}
            onSketch={onSketch}
            onSubmit={onSubmit}
          />

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
              disabled={empty}
              style={{
                padding: "12px 20px",
                background: empty ? color.inkWash : accent,
                color: empty ? color.inkGhost : color.accentInk,
                border: "none",
                borderRadius: 3,
                fontSize: 14.5,
                fontWeight: 600,
                cursor: empty ? "default" : "pointer",
              }}
            >
              {busy ? <InkDots size={3.5} /> : copy.submit}
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
                  border: "1px solid rgba(var(--amber-ink),.4)",
                  borderRadius: 3,
                  fontSize: 13,
                  color: color.amberInk,
                  cursor: "pointer",
                }}
              >
                {copy.stuck}
              </button>
            )}
            <KbdHint>{copy.hint}</KbdHint>
          </div>
        </div>
      )}

      {session.reported && (
        <div style={{ marginTop: 26, animation: "fadeUp .4s both" }}>
          <div style={{ ...kicker(10.5, "0.14em", accent), marginBottom: 14 }}>
            {copy.report}
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
                  <span style={{ ...kicker(12, "0", color.inkGhost), marginTop: 2 }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5 }}>
                      {step.step}
                      {step.loadBearing && (
                        <span
                          style={{
                            ...kicker(9.5, "0.1em", color.inkGhost),
                            marginLeft: 8,
                          }}
                        >
                          {copy.loadBearing}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        ...kicker(10, "0.08em", VERDICT_COLOR[verdict]),
                        marginTop: 3,
                      }}
                    >
                      {verdictLabel(verdict, lang)}
                    </div>
                    {session.quotes[step.id] && (
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: font.serif,
                          fontStyle: "italic",
                          fontSize: 14,
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

          {/* A failed run leads with fixing or re-running: staying on the
              case is the move, leaving is the alternative. Nothing is
              pressable until the checker has finished its read. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
            <button
              className="at-press"
              data-testid="action-finish"
              onClick={onAdvance}
              disabled={session.pending}
              style={action(passed, color.accent)}
            >
              {copy.advance}
            </button>
            <button
              className="at-press"
              data-testid={canFix ? "action-fix" : "action-rerun"}
              disabled={session.pending}
              onClick={() =>
                canFix
                  ? onFix((broken.length ? broken : missed).map((s) => s.step))
                  : onRerun()
              }
              style={action(!passed, accent)}
            >
              {canFix ? copy.fix : copy.rerun}
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
          {!passed && !broken.length && missed.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 13, color: color.inkGhost }}>
              {missed.map((s) => s.step).join(" · ")}
            </div>
          )}
        </div>
      )}
    </PhaseShell>
  );
}
