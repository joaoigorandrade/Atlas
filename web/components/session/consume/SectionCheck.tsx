"use client";

// The comprehension check that closes a section: asked in the learner's own
// words first (the judge maps them onto the options), answered once. A second
// pick after a wrong one was elimination, not comprehension — so a miss shows
// the right answer, is kept for the recap to name, and the reading goes on.
//
// The same card is also the pretest (W3.3): the check asked *before* its
// section, on screen at once, and never revealing the answer — a right guess
// passes the check, a miss opens the reading and the check waits at its end.
//
// A pretest answer is held for an ink bet before it counts (`INK_STAKES`): the
// confidence is placed on *this* answer, after it is given and before anything
// says whether it was right — the order that makes a confident miss the one
// that sticks.

import { BLUE, RIGHT, STRINGS, WRONG } from "./shared";
import { ConsumePrediction } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font, kicker, transition } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import Rich from "@/components/Rich";
import ConfidenceGate from "@/components/session/parts/ConfidenceGate";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";

export function SectionCheck({
  topic,
  nodeLabel,
  check,
  answer,
  onAnswer,
  pretest = false,
  guessMissed = false,
}: {
  topic: string;
  nodeLabel: string;
  check: ConsumePrediction;
  answer?: { oi: number; correct: boolean };
  /** `stake` is the ink bet — a pretest's answer only, an index into `INK_STAKES`. */
  onAnswer: (oi: number, correct: boolean, stake?: number) => void;
  /** Asked before the section is read: shown at once, answer never revealed. */
  pretest?: boolean;
  /** The pretest guess on this section missed — the hint says so. */
  guessMissed?: boolean;
}) {
  const [mode, setMode] = useState<AnswerMode>("open");
  const t = useT(STRINGS);
  const slot = useRef<HTMLDivElement>(null);
  // Answered before this mounted (re-render after a scroll away) → already in.
  const [revealed, setRevealed] = useState(!!answer || pretest);
  useEffect(() => {
    if (revealed || !slot.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setRevealed(true);
      },
      // Not merely peeking over the fold — the end of the section has to be
      // properly on screen.
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(slot.current);
    return () => io.disconnect();
  }, [revealed]);

  const passed = !!answer?.correct;
  const missed = !!answer && !passed;
  // A pretest guess waiting on its bet; the end-of-section check takes none.
  // `said` is what they typed: the bet shows their words, not the option the
  // judge mapped them onto (which read as words put in their mouth).
  const [held, setHeld] = useState<{
    oi: number;
    correct: boolean;
    said?: string;
  } | null>(null);
  const resolve = (oi: number, correct: boolean, said?: string) =>
    pretest ? setHeld({ oi, correct, said }) : onAnswer(oi, correct);

  return (
    <div ref={slot} style={{ minHeight: 1, marginTop: 30 }}>
      {revealed && (
        <div
          style={{
            background: color.card,
            border: `1px solid ${passed ? "rgba(var(--state-mastered),.4)" : "rgba(var(--state-learning),.28)"}`,
            borderRadius: 3,
            padding: "18px 20px",
            animation: "fadeUp .45s both",
            transition: transition("border-color"),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: passed ? RIGHT : BLUE,
              }}
            />
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: passed ? RIGHT : BLUE,
              }}
            >
              {passed
                ? t.checkPassed
                : missed
                  ? t.checkMissed
                  : pretest
                    ? t.pretestKicker
                    : t.checkKicker}
            </span>
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 20,
              lineHeight: 1.32,
              marginBottom: 6,
            }}
          >
            <Rich text={check.q} />
          </div>
          {!answer && !held && (
            <div style={{ fontSize: 13, color: color.inkFaint, marginBottom: 14 }}>
              {pretest ? t.pretestHint : guessMissed ? t.pretestAgain : t.checkHint}
              <div style={{ marginTop: 10 }}>
                <AnswerModeToggle mode={mode} onMode={setMode} accent={BLUE} />
              </div>
            </div>
          )}
          {held ? (
            <div data-testid="consume-bet" style={{ animation: "softIn .3s both" }}>
              <div style={{ ...kicker(9.5, "0.12em", BLUE), margin: "10px 0 4px" }}>
                {t.yourAnswer}
              </div>
              <div style={{ fontFamily: font.serif, fontSize: 16, color: color.inkSoft }}>
                {held.said ?? <Rich text={check.opts[held.oi]?.label ?? ""} />}
              </div>
              <ConfidenceGate
                question={t.betQuestion}
                onPick={(stake) => onAnswer(held.oi, held.correct, stake)}
              />
              <div style={{ fontSize: 12, color: color.inkFaint, marginTop: 10 }}>
                {t.betLegend}
              </div>
            </div>
          ) : !answer && mode === "open" ? (
            <OpenAnswer
              topic={topic}
              nodeLabel={nodeLabel}
              question={check.q}
              options={check.opts.map((o) => o.label)}
              accent={BLUE}
              rows={2}
              onResolve={(oi, _r, said) => resolve(oi, !!check.opts[oi]?.correct, said)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {check.opts.map((o, oi) => {
                const picked = answer?.oi === oi;
                // Once answered, the right option is marked either way.
                const shown = answer ? o.correct || picked : false;
                return (
                  <button
                    className="at-press"
                    key={o.label}
                    // Only the live check is addressable: an answered section
                    // keeps its options on screen, and carrying the same testid
                    // there made every `action-check-N` match twice.
                    data-testid={answer ? undefined : `action-check-${oi}`}
                    onClick={answer ? undefined : () => resolve(oi, o.correct)}
                    disabled={!!answer}
                    style={{
                      textAlign: "left",
                      padding: "13px 16px",
                      borderRadius: 3,
                      fontSize: 14.5,
                      fontFamily: "inherit",
                      cursor: answer ? "default" : "pointer",
                      border: `1px solid ${shown ? (o.correct ? RIGHT : WRONG) : color.hairlineStrong}`,
                      background: shown && o.correct ? color.successBg : color.card,
                      color: color.ink,
                      opacity: answer && !shown ? 0.5 : 1,
                    }}
                  >
                    <Rich text={o.label} />
                  </button>
                );
              })}
            </div>
          )}
          {answer && (
            <div
              style={{
                marginTop: 14,
                paddingLeft: 13,
                borderLeft: `3px solid ${passed ? RIGHT : WRONG}`,
                fontSize: 14,
                lineHeight: 1.55,
                color: color.inkSoft,
                animation: "softIn .3s both",
              }}
            >
              {passed ? check.right : `${check.wrong} ${t.checkAgain}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** How long one beat holds the floor before the next reveals itself. Long
 *  enough to read a couple of sentences, short enough that nobody sits waiting
 *  — and skippable either way ("Next beat", "Show all"). */
