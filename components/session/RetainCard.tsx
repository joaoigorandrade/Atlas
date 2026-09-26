"use client";

import {
  CONNECT_COLOR,
  STATE_COLOR,
  retainDeck,
  reviewAside,
  reviewGrades,
  reviewTypeMeta,
  type RetainContent,
  type ReviewCard,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, figures, font, kicker, motion } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import { useReducedMotion } from "@/lib/motion";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import Rich from "@/components/Rich";
import { STRINGS } from "@/components/session/retainCopy";

// The micro-Socratic aside borrows Connect's violet; the fail re-explanation
// borrows the learning-blue and the flagged node the shaky-amber, so each reads
// the same here as it does on the map.
const ASIDE_ACCENT = CONNECT_COLOR.accent;

/** How long the card takes to turn over. The faces swap `visibility` at the
 *  half-way point so the hidden face can never be clicked mid-turn. */
const FLIP_MS = motion.duration.deliberate;

/** The grade is inked onto the card, then the card is tossed onto the pile. */
const STAMP_MS = 260;
const TOSS_MS = 220;

/** The question, filled or blank — shared by both faces of the card so the
 *  answer lands *in* the sentence it belongs to rather than beside it. */
function Question({
  card,
  filled,
  size,
  ink = color.ink,
}: {
  card: ReviewCard;
  filled: boolean;
  size: number;
  ink?: string;
}) {
  const text = { fontFamily: font.serif, fontSize: size, lineHeight: 1.4, color: ink };
  if (!card.cloze)
    return (
      <div style={text}>
        <Rich text={card.front} />
      </div>
    );
  return (
    <div style={text}>
      <Rich text={card.cloze[0]} />
      <span
        style={{
          display: "inline-block",
          minWidth: 96,
          borderBottom: `2px solid ${filled ? STATE_COLOR.mastered : "rgba(43,33,24,0.28)"}`,
          textAlign: "center",
        }}
      >
        {filled ? (
          <span
            style={{
              color: STATE_COLOR.mastered,
              display: "inline-block",
              animation: `clozeReveal .34s ${motion.ease.spring} both ${FLIP_MS / 2}ms`,
            }}
          >
            {card.answer}
          </span>
        ) : (
          " "
        )}
      </span>
      <Rich text={card.cloze[1]} />
    </div>
  );
}

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

/** One card, as a catalogue card from the atlas: dealt off the deck, lifted and
 *  turned over, stamped with its grade and tossed onto the pile. Everything the
 *  card is — its kind, its number, where it came from — is written on it. The
 *  whole loop is keyboard-drivable (space to turn, 1–4 to grade, E for the
 *  aside, Enter to continue). */
export default function ActiveCard({
  card,
  session,
  content,
  nodeLabel,
  onFlip,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
}: {
  card: ReviewCard;
  session: RetainSession;
  content: RetainContent;
  nodeLabel: string;
  onFlip: () => void;
  onGrade: (grade: ReviewGrade) => void;
  onToggleAside: () => void;
  onReteach: () => void;
  onContinue: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const reduced = useReducedMotion();
  const type = reviewTypeMeta(card.type, language);
  const grades = reviewGrades(language);
  const isQuestion = session.stage === "question";
  const revealed = session.stage === "reveal" || session.stage === "aside";
  const failed = session.stage === "failed";
  const flipped = revealed || failed;

  // The toss: a graded card is stamped, then leaves before the next one is
  // dealt. "Again" keeps the card on screen — the fail panel opens underneath
  // it — so it never tosses.
  const [tossing, setTossing] = useState<ReviewGrade | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const grade = useCallback(
    (g: ReviewGrade) => {
      if (tossing) return;
      if (g === "again" || reduced) return onGrade(g);
      setTossing(g);
      timer.current = setTimeout(() => {
        setTossing(null);
        onGrade(g);
      }, STAMP_MS + TOSS_MS);
    },
    [tossing, reduced, onGrade],
  );

  // Anki muscle memory: the whole card is drivable without the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (isQuestion && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        onFlip();
      } else if (revealed && "1234".includes(e.key)) {
        e.preventDefault();
        grade(grades[Number(e.key) - 1].key);
      } else if (revealed && e.key.toLowerCase() === "e") {
        e.preventDefault();
        onToggleAside();
      } else if (failed && e.key === "Enter") {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isQuestion, revealed, failed, grades, grade, onFlip, onToggleAside, onContinue]);

  const deck = retainDeck(session, content).length;
  const remaining = deck - session.idx - 1;
  const stamped = grades.find((g) => g.key === tossing);
  // The back's blocks ink in one after another once the card is past its edge.
  const inkIn = (i: number) =>
    flipped
      ? { animation: `fadeUp .36s ${motion.ease.enter} both ${FLIP_MS / 2 + i * 70}ms` }
      : undefined;

  const face: CSSProperties = {
    gridArea: "1 / 1",
    position: "relative",
    // An index card cut from the atlas's own stock, faintly ruled.
    background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
    border: "1px solid rgba(43,33,24,0.26)",
    borderRadius: 3,
    display: "flex",
    flexDirection: "column",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    boxShadow: "0 1px 0 rgba(43,33,24,0.08), 0 14px 34px rgba(43,33,24,0.1)",
    overflow: "hidden",
    // Each face carries its own rotation rather than riding a rotated parent:
    // a preserve-3d container leaves hit-testing pointing at the container, so
    // the back face's buttons become unclickable. The face that has turned away
    // also drops out at the half-way point — `backface-visibility` hides it,
    // but hit-testing still finds it.
    transition: `visibility 0s linear ${FLIP_MS / 2}ms`,
  };
  const turn = (name: string) => `${name} ${FLIP_MS}ms ${motion.ease.standard} both`;

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "15px 26px 11px",
        borderBottom: `1px solid ${color.rubric}59`,
        boxShadow: `0 3px 0 -2px ${color.rubric}33`,
      }}
    >
      <span style={{ ...kicker(10.5, "0.14em", type.color) }}>◆ {type.label}</span>
      <span style={kicker(10.5, "0.12em")}>{t.cardNo(session.idx + 1)}</span>
    </div>
  );

  return (
    <>
      {/* The deck. Two ghosts sit under the live card so the queue has depth —
          they slide up as it empties, and vanish on the last card. */}
      <div style={{ position: "relative", perspective: 1800 }}>
        {[2, 1].map((depth) =>
          remaining >= depth ? (
            <div
              key={depth}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 3,
                pointerEvents: "none",
                background: color.cardAlt,
                border: `1px solid ${color.hairlineStrong}`,
                transform: `translateY(${depth * 9}px) scale(${1 - depth * 0.022}) rotate(${depth === 2 ? 0.6 : -0.4}deg)`,
                transition: "transform 380ms cubic-bezier(.2,.8,.3,1)",
                opacity: 1 - depth * 0.25,
              }}
            />
          ) : null,
        )}

        <div
          // Keyed by slot, not card: a missed card is dealt again with the same
          // id, and must arrive face-up-question like any other deal.
          key={`${card.id}-${session.idx}`}
          style={{
            position: "relative",
            display: "grid",
            minHeight: 300,
            perspective: 1800,
            animation: tossing
              ? `cardToss ${TOSS_MS}ms ${motion.ease.exit} both ${STAMP_MS}ms`
              : failed
                ? `nudge .42s ${motion.ease.standard} both`
                : `dealIn .42s ${motion.ease.enter} both`,
          }}
        >
          {/* Front — the question, and the one thing to do with it: turn it
              over. The whole card is the control; the line at its foot says so. */}
          <div
            className="rt-front"
            onClick={isQuestion ? onFlip : undefined}
            style={{
              ...face,
              // `.rt-front` carries the visibility swap alongside its hover lift.
              transition: undefined,
              cursor: isQuestion ? "pointer" : undefined,
              animation: flipped ? turn("faceOut") : undefined,
              visibility: flipped ? "hidden" : "visible",
              pointerEvents: flipped ? "none" : "auto",
              background: `repeating-linear-gradient(transparent 0 35px, rgba(58,106,85,0.09) 35px 36px), url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
            }}
          >
            {header}
            <div style={{ margin: "auto 0", padding: "30px 34px 10px" }}>
              <Question card={card} filled={false} size={27} />
            </div>
            <div style={{ textAlign: "center", padding: "6px 34px 18px" }}>
              <div
                style={{
                  fontFamily: font.serif,
                  fontStyle: "italic",
                  fontSize: 13.5,
                  color: color.inkFaint,
                  marginBottom: 10,
                }}
              >
                {t.flipHint}
              </div>
              <button
                className="at-press"
                data-testid="action-flip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 16px",
                  borderRadius: 3,
                  cursor: "pointer",
                  ...kicker(12.5, "0.12em", color.accent),
                  background: "none",
                  border: `1px solid ${color.accent}47`,
                }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>
                  ↻
                </span>
                {t.showAnswer}
                <span style={keycap}>{t.flipKey}</span>
              </button>
            </div>
            <div
              style={{
                ...kicker(9.5, "0.1em", color.inkGhost),
                padding: "9px 26px 11px",
                borderTop: `1px solid ${color.hairline}`,
              }}
            >
              {t.autoGenerated(card.source)}
            </div>
          </div>

          {/* Back — the answer set in its question, the aside and the grades. */}
          <div
            style={{
              ...face,
              transform: flipped ? undefined : "rotateY(180deg)",
              animation: flipped ? turn("faceIn") : undefined,
              visibility: flipped ? "visible" : "hidden",
              pointerEvents: flipped && !tossing ? "auto" : "none",
            }}
          >
            {header}
            <div style={{ padding: "24px 34px 22px", flex: 1 }}>
              {card.cloze ? (
                <div style={inkIn(0)}>
                  <Question card={card} filled size={24} />
                  {card.back.trim() !== (card.answer ?? "").trim() && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: `1px solid ${color.hairline}`,
                        fontFamily: font.serif,
                        fontSize: 16.5,
                        lineHeight: 1.6,
                        color: color.inkSoft,
                      }}
                    >
                      <Rich text={card.back} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={kicker(11, "0.08em", color.inkGhost)}>
                      {t.questionEcho}
                    </span>
                    <Question card={card} filled size={16} ink={color.inkMuted} />
                  </div>
                  <div
                    style={{
                      ...inkIn(0),
                      marginTop: 16,
                      fontFamily: font.serif,
                      fontSize: 21,
                      lineHeight: 1.5,
                      color: color.ink,
                    }}
                  >
                    <Rich text={card.back} />
                  </div>
                </>
              )}

              <div style={inkIn(1)}>
                <button
                  className="at-press"
                  onClick={onToggleAside}
                  style={{
                    marginTop: 16,
                    marginLeft: -10,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: session.stage === "aside" ? `${ASIDE_ACCENT}12` : "none",
                    border: `1px solid ${session.stage === "aside" ? `${ASIDE_ACCENT}55` : "transparent"}`,
                    borderRadius: 3,
                    padding: "6px 10px",
                    fontFamily: font.serif,
                    fontStyle: "italic",
                    fontSize: 14,
                    color: ASIDE_ACCENT,
                    cursor: "pointer",
                  }}
                >
                  {t.explainAside}
                  <span style={keycap}>{t.asideKey}</span>
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
            </div>

            {/* Grade — tabs fused to the card's foot, where Anki puts them.
                Each carries the interval FSRS would hand it. */}
            <div
              style={{
                ...inkIn(2),
                display: "flex",
                borderTop: `1px solid ${color.hairlineStrong}`,
              }}
            >
              {grades.map((g, i) => (
                <button
                  className="rt-grade"
                  key={g.key}
                  data-testid={`action-grade-${g.key}`}
                  data-on={tossing === g.key || undefined}
                  onClick={() => grade(g.key)}
                  style={
                    {
                      "--g-wash": `${g.color}24`,
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      padding: "14px 8px 12px",
                      cursor: "pointer",
                      border: "none",
                      borderLeft: i ? `1px solid ${color.hairline}` : "none",
                    } as CSSProperties
                  }
                >
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: 18,
                      fontWeight: 600,
                      color: g.color,
                    }}
                  >
                    {g.label}
                  </span>
                  <span style={{ ...figures, fontSize: 14, color: color.inkSoft }}>
                    {card.fsrs?.[g.key] ?? " "}
                  </span>
                  <span style={keycap}>{i + 1}</span>
                </button>
              ))}
            </div>

            {/* The grade, inked onto the card before it's tossed. */}
            {stamped && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  pointerEvents: "none",
                }}
              >
                <div style={{ transform: "rotate(-7deg)" }}>
                  <div
                    style={{
                      ...kicker(24, "0.16em", stamped.color),
                      border: `4px double ${stamped.color}`,
                      borderRadius: 5,
                      padding: "8px 20px 6px",
                      background: `${color.card}e0`,
                      animation: `stamp ${STAMP_MS}ms ${motion.ease.spring} both`,
                    }}
                  >
                    {stamped.label}
                    {card.fsrs?.[stamped.key] ? ` · ${card.fsrs[stamped.key]}` : ""}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Failed — the alive-loop: calibration read, instant re-explain, writeback */}
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
                background: "#fbeeeb",
                border: "1px solid rgba(169,96,46,0.35)",
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
                boxShadow: `inset 0 0 0 3px ${color.accent}, inset 0 0 0 4px rgba(246,239,223,0.34)`,
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
