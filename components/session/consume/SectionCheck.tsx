"use client";

import { BLUE, RIGHT, STRINGS, WRONG } from "./shared";
import { ConsumePrediction } from "@/lib/curriculum";
import { useT } from "@/lib/i18n";
import { color, font, transition } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import Rich from "@/components/Rich";

export function SectionCheck({
  check,
  answer,
  onAnswer,
}: {
  check: ConsumePrediction;
  answer?: { oi: number; correct: boolean };
  onAnswer: (oi: number, correct: boolean) => void;
}) {
  const t = useT(STRINGS);
  const slot = useRef<HTMLDivElement>(null);
  // Answered before this mounted (re-render after a scroll away) → already in.
  const [revealed, setRevealed] = useState(!!answer);
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

  return (
    <div ref={slot} style={{ minHeight: 1, marginTop: 30 }}>
      {revealed && (
        <div
          style={{
            background: color.card,
            border: `1px solid ${passed ? "rgba(76,139,99,0.4)" : "rgba(91,127,191,0.28)"}`,
            borderRadius: 13,
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
              {passed ? t.checkPassed : t.checkKicker}
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
          {!passed && (
            <div style={{ fontSize: 13, color: color.inkFaint, marginBottom: 14 }}>
              {t.checkHint}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {check.opts.map((o, oi) => {
              const picked = answer?.oi === oi;
              const shown = passed ? o.correct : picked;
              return (
                <button
                  className="at-press"
                  key={o.label}
                  onClick={passed ? undefined : () => onAnswer(oi, o.correct)}
                  disabled={passed}
                  style={{
                    textAlign: "left",
                    padding: "13px 16px",
                    borderRadius: 10,
                    fontSize: 14.5,
                    fontFamily: "inherit",
                    cursor: passed ? "default" : "pointer",
                    border: `1px solid ${shown ? (o.correct ? RIGHT : WRONG) : color.hairlineStrong}`,
                    background: shown
                      ? o.correct
                        ? color.successBg
                        : color.card
                      : color.card,
                    color: color.ink,
                    opacity: passed && !o.correct ? 0.5 : 1,
                  }}
                >
                  <Rich text={o.label} />
                </button>
              );
            })}
          </div>
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
              {passed ? check.right : `${t.checkAgain} ${check.wrong}`}
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
