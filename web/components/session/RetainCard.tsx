"use client";

import {
  CONNECT_COLOR,
  STATE_COLOR,
  reviewAside,
  reviewGrades,
  reviewTypeMeta,
  type ReviewCard,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, figures, font, kicker, motion, alpha } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import { useEffect, useState, type CSSProperties } from "react";

import Rich from "@/components/Rich";
import TurnOver from "@/components/session/retain/TurnOver";
import { Question } from "@/components/session/retain/Question";
import { CardAnswer, Suggestion } from "@/components/session/retain/CardAnswer";
import { STRINGS } from "@/components/session/retainCopy";

// The micro-Socratic aside borrows Connect's violet; the fail re-explanation
// borrows the learning-blue and the flagged node the shaky-amber, so each reads
// the same here as it does on the map.
const ASIDE_ACCENT = CONNECT_COLOR.accent;

const keycap: CSSProperties = {
  fontFamily: font.caps,
  fontSize: 10,
  lineHeight: 1,
  color: color.inkFaint,
  border: `1px solid ${color.hairlineStrong}`,
  borderBottomWidth: 2,
  borderRadius: 3,
  padding: "2px 5px 1px",
};

/** One review card, laid out the way Anki lays one out: the question stays
 *  where it is, the answer arrives beneath a rule (a cloze fills its blank in
 *  place), and the four grade buttons sit at the foot with the interval each
 *  would schedule written above its name. No flip and no toss — a grade is
 *  committed the instant it is pressed, so leaving the screen can't drop one.
 *
 *  Keyboard, as in Anki: space or Enter shows the answer (1–3 shows it with a
 *  confidence rating), then 1–4 grades and space or Enter is Good. E opens the
 *  aside; Enter continues past a miss. Held keys don't repeat into a grade. */
export default function ActiveCard({
  card,
  session,
  nodeLabel,
  compact,
  onFlip,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
}: {
  card: ReviewCard;
  session: RetainSession;
  nodeLabel: string;
  /** Phone width: tighter margins, no keycaps (there is no keyboard). */
  compact: boolean;
  /** Show the answer — with the confidence tap that showed it, if any, and
   *  the answer written before it (W4.3). */
  onFlip: (sure?: number, said?: string) => void;
  onGrade: (grade: ReviewGrade) => void;
  onToggleAside: () => void;
  onReteach: () => void;
  onContinue: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const type = reviewTypeMeta(card.type, language);
  const grades = reviewGrades(language);
  const isQuestion = session.stage === "question";
  const revealed = session.stage === "reveal" || session.stage === "aside";
  const failed = session.stage === "failed";
  const shown = revealed || failed;
  // The answer written before showing — one per dealt card.
  const [said, setSaid] = useState("");
  useEffect(() => setSaid(""), [card.id, session.idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A held key repeats; without this, holding "1" showed the answer and
      // then graded the card Again on the next repeat.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      // `preventDefault` also cancels a focused button's own space/Enter
      // click, so one key is one action.
      const pick = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (isQuestion && (e.key === " " || e.key === "Enter"))
        pick(() => onFlip(undefined, said));
      else if (isQuestion && /^[123]$/.test(e.key))
        pick(() => onFlip(Number(e.key) - 1, said));
      else if (revealed && /^[1234]$/.test(e.key))
        pick(() => onGrade(grades[Number(e.key) - 1].key));
      else if (revealed && (e.key === " " || e.key === "Enter"))
        pick(() => onGrade("good"));
      else if (revealed && e.key.toLowerCase() === "e") pick(onToggleAside);
      else if (failed && (e.key === " " || e.key === "Enter")) pick(onContinue);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isQuestion,
    revealed,
    failed,
    grades,
    onGrade,
    onFlip,
    onToggleAside,
    onContinue,
    said,
  ]);

  const pad = compact ? 18 : 36;
  const qSize = compact ? 21 : 26;
  const cap = compact ? { display: "none" } : keycap;
  const showBack = !card.cloze || card.back.trim() !== (card.answer ?? "").trim();
  const answerIn = { animation: `fadeUp .28s ${motion.ease.enter} both` };

  return (
    <>
      <div
        // Keyed by slot, not card: a card dealt again later in the pass has
        // the same id, and must arrive question-side like any other deal.
        key={`${card.id}-${session.idx}`}
        style={{
          position: "relative",
          background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
          border: "1px solid rgba(var(--ink),.26)",
          borderRadius: 4,
          boxShadow: "0 1px 0 rgba(var(--shade),.08), 0 14px 34px rgba(var(--shade),.1)",
          overflow: "hidden",
          animation: failed
            ? `nudge .42s ${motion.ease.standard} both`
            : `dealIn .32s ${motion.ease.enter} both`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: `13px ${pad}px 10px`,
            borderBottom: `1px solid ${color.hairline}`,
          }}
        >
          <span style={{ ...kicker(10.5, "0.14em", type.color), whiteSpace: "nowrap" }}>
            ◆ {type.label}
          </span>
          <span
            style={{
              ...kicker(9.5, "0.1em", color.inkGhost),
              textAlign: "right",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t.autoGenerated(card.source)}
          </span>
        </div>

        {/* The card itself — question on top, the answer under a rule. */}
        <div
          data-testid="card-body"
          style={{
            padding: `${compact ? 26 : 38}px ${pad}px ${compact ? 22 : 30}px`,
            textAlign: "center",
            minHeight: compact ? 150 : 190,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Question card={card} filled={shown} size={qSize} />
          {shown && showBack && (
            <div style={answerIn}>
              <hr
                style={{
                  border: "none",
                  borderTop: `1px solid ${color.hairlineStrong}`,
                  margin: `${compact ? 18 : 24}px 0`,
                }}
              />
              <div
                data-testid="card-back"
                style={{
                  fontFamily: font.serif,
                  fontSize: card.cloze ? qSize - 5 : qSize - 2,
                  lineHeight: 1.5,
                  color: card.cloze ? color.inkSoft : color.ink,
                }}
              >
                <Rich text={card.back} />
              </div>
            </div>
          )}
          {revealed && (
            <div style={{ ...answerIn, textAlign: "left", marginTop: 18 }}>
              <button
                className="at-press"
                onClick={onToggleAside}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: session.stage === "aside" ? alpha(ASIDE_ACCENT, 7) : "none",
                  border: `1px solid ${session.stage === "aside" ? alpha(ASIDE_ACCENT, 33) : "transparent"}`,
                  borderRadius: 3,
                  padding: "6px 10px",
                  marginLeft: -10,
                  fontFamily: font.serif,
                  fontStyle: "italic",
                  fontSize: 14,
                  color: ASIDE_ACCENT,
                  cursor: "pointer",
                }}
              >
                {t.explainAside}
                <span style={cap}>{t.asideKey}</span>
              </button>
              {session.stage === "aside" && (
                <div
                  style={{
                    marginTop: 10,
                    borderLeft: `3px solid ${ASIDE_ACCENT}`,
                    padding: "6px 0 6px 15px",
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: color.inkSoft,
                    fontFamily: font.serif,
                    animation: "fadeUp .25s both",
                  }}
                >
                  {reviewAside(language)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* The foot: "Show answer" until it's shown, then the four grades. */}
        {isQuestion && (
          <div
            style={{
              borderTop: `1px solid ${color.hairline}`,
              padding: `14px ${pad}px 16px`,
              background: "rgba(var(--ink),.025)",
            }}
          >
            {card.type !== "why" && <CardAnswer value={said} onChange={setSaid} />}
            <div
              style={{ ...kicker(10, "0.12em"), textAlign: "center", marginBottom: 9 }}
            >
              {t.showAnswer}
            </div>
            <TurnOver onFlip={(sure) => onFlip(sure, said)} keycap={cap} />
            {!compact && (
              <div
                style={{
                  fontFamily: font.serif,
                  fontStyle: "italic",
                  fontSize: 13,
                  color: color.inkFaint,
                  textAlign: "center",
                  marginTop: 10,
                }}
              >
                {t.flipHint}
              </div>
            )}
          </div>
        )}

        {revealed && (
          <div style={answerIn}>
            <Suggestion session={session} />
            {/* Anki's answer bar: interval over the name, worst to best. The
                judged answer's suggestion is ringed (W4.3), never pressed. */}
            <div
              style={{ display: "flex", borderTop: `1px solid ${color.hairlineStrong}` }}
            >
              {grades.map((g, i) => (
                <button
                  className="rt-grade"
                  key={g.key}
                  data-testid={`action-grade-${g.key}`}
                  onClick={() => onGrade(g.key)}
                  style={
                    {
                      "--g-wash": `${alpha(g.color, 14)}`,
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: compact ? "11px 2px 12px" : "12px 8px 12px",
                      cursor: "pointer",
                      border: "none",
                      borderLeft: i ? `1px solid ${color.hairline}` : "none",
                      boxShadow:
                        session.suggest?.grade === g.key
                          ? `inset 0 0 0 2px ${g.color}`
                          : undefined,
                    } as CSSProperties
                  }
                >
                  <span
                    style={{
                      ...figures,
                      fontSize: compact ? 12 : 13,
                      color: color.inkMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.fsrs?.[g.key] ?? " "}
                  </span>
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: compact ? 15.5 : 18,
                      fontWeight: 600,
                      color: g.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {g.label}
                  </span>
                  <span style={cap}>{i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Failed — the alive-loop: instant re-explain, then the map write-back. */}
      {failed && (
        <div style={{ marginTop: 22, animation: "fadeUp .3s both" }}>
          <div
            style={{
              borderLeft: `3px solid ${STATE_COLOR.learning}`,
              padding: "6px 0 6px 15px",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12.5, color: color.inkFaint, marginBottom: 6 }}>
              {t.failedReexplainLead}
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 16,
                lineHeight: 1.55,
                color: color.ink,
              }}
            >
              <Rich text={card.reExplain} />
            </div>
          </div>

          {session.wroteBack && card.fails && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 13,
                background: color.dangerBg,
                border: "1px solid rgba(var(--state-shaky),.35)",
                borderRadius: 3,
                padding: "15px 18px",
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: STATE_COLOR.shaky,
                  flex: "0 0 auto",
                  marginTop: 5,
                  animation: "markPop .5s cubic-bezier(.34,1.56,.64,1) both",
                }}
              />
              <div>
                <div style={{ fontFamily: font.serif, fontSize: 17, marginBottom: 3 }}>
                  {t.nodeFlaggedShaky(nodeLabel)}
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted, lineHeight: 1.55 }}>
                  {t.retentionFailureBody}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="at-press"
              onClick={onReteach}
              style={{
                padding: "13px 20px",
                background: color.accent,
                color: color.accentInk,
                border: "none",
                borderRadius: 3,
                fontSize: 14,
                fontFamily: font.caps,
                letterSpacing: "0.06em",
                cursor: "pointer",
                boxShadow: `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(var(--accent-ink),.34)`,
              }}
            >
              {t.reteachNow}
            </button>
            <button
              className="at-press"
              data-testid="action-continue"
              onClick={onContinue}
              style={{
                padding: "13px 20px",
                background: color.card,
                border: `1px solid ${color.hairlineStrong}`,
                borderRadius: 3,
                fontSize: 14,
                fontWeight: 600,
                color: color.ink,
                cursor: "pointer",
              }}
            >
              {t.scheduleReteach}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
