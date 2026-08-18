"use client";

import {
  CONNECT_COLOR,
  CRUCIBLE_COLOR,
  STATE_COLOR,
  retainBudget,
  retainCalib,
  retainQueueLabel,
  reviewAside,
  reviewCard,
  reviewConfidenceLabels,
  reviewGrades,
  reviewTypeMeta,
  type AdherenceState,
  type RetainContent,
  type ReviewCard,
  type ReviewConfidence,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, font, kicker, motion, transition } from "@/lib/theme";
import StreakFlame from "@/components/map/StreakFlame";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import { useReducedMotion, type PresenceState } from "@/lib/motion";
import { useCallback, useEffect, useRef, useState } from "react";

import Rich from "@/components/Rich";
import { STRINGS } from "@/components/session/retainCopy";
import Finished from "@/components/session/RetainFinished";
import Sidebar from "@/components/session/RetainSidebar";
// The micro-Socratic aside borrows Connect's violet; the fail re-explanation
// borrows the learning-blue and the flagged node the shaky-amber, so each reads
// the same here as it does on the map.
const ASIDE_ACCENT = CONNECT_COLOR.accent;

interface RetainViewProps {
  /** Enter/leave state for the shared `Sheet` root — AtlasApp holds this
   *  screen mounted through its exit. */
  presence: PresenceState;
  /** The generated review queue (cards + forecast + budget). */
  content: RetainContent;
  session: RetainSession;
  /** Label of the current card's node — the fail write-back names it. Absent
   *  when the card outlived its node; the copy carries the fallback. */
  nodeLabel?: string;
  /** Mastered nodes still alive — shown on the done-for-today surface. */
  litNodes: number;
  /** Adherence state — the flame in the header and the streak on the done surface. */
  adherence: AdherenceState;
  /** Labels of nodes that lit up (reached mastered) this session run — "what lit up". */
  litToday: string[];
  /** Arm / disarm the right-moment reminder from the flame + done surface. */
  onToggleReminder: () => void;
  onExit: () => void;
  /** Tap confidence before the flip — the calibration hook. */
  onConfidence: (level: ReviewConfidence) => void;
  /** Grade after reveal — feeds FSRS (Again opens the alive-loop). */
  onGrade: (grade: ReviewGrade) => void;
  /** Toggle the micro-Socratic aside on a revealed card. */
  onToggleAside: () => void;
  /** Failed card → re-teach now (routes back to Consume). */
  onReteach: () => void;
  /** Failed card → schedule the re-teach and continue the queue. */
  onContinue: () => void;
}

export default function RetainView({
  content,
  session,
  nodeLabel,
  litNodes,
  adherence,
  litToday,
  onToggleReminder,
  onExit,
  onConfidence,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
  presence,
}: RetainViewProps) {
  const t = useT(STRINGS);
  const card = reviewCard(session, content);
  const budget = retainBudget(session, content);

  return (
    <Sheet presence={presence} data-testid="phase-retain" aria-label="Retain — {title}">
      {/* Header — ← Map · Retain · Review · honest queue chip */}
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
          className="at-press"
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
            color: color.accent,
          }}
        >
          {t.retainReview}
        </span>
        <div style={{ flex: 1 }} />
        <StreakFlame adherence={adherence} onToggleReminder={onToggleReminder} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: color.accentBg,
            border: "1px solid rgba(47,107,79,0.22)",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 13,
            color: color.accent,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: color.accent,
            }}
          />
          {retainQueueLabel(session, content)}
        </div>
      </div>

      {/* Body — scrolls; card column + retention-health sidebar */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "34px 32px 120px",
            display: "grid",
            gridTemplateColumns: "1fr 268px",
            gap: 34,
            alignItems: "start",
          }}
        >
          <div>
            {session.finished ? (
              <Finished
                litNodes={litNodes}
                adherence={adherence}
                litToday={litToday}
                onToggleReminder={onToggleReminder}
                onExit={onExit}
              />
            ) : (
              <>
                <QueueRail session={session} content={content} />
                <ActiveCard
                  card={card}
                  session={session}
                  content={content}
                  nodeLabel={nodeLabel ?? t.thisNode}
                  onConfidence={onConfidence}
                  onGrade={onGrade}
                  onToggleAside={onToggleAside}
                  onReteach={onReteach}
                  onContinue={onContinue}
                />
              </>
            )}
          </div>

          <Sidebar content={content} budget={budget} />
        </div>
      </div>
    </Sheet>
  );
}

/** How long the card takes to turn over. The faces swap `visibility` at the
 *  half-way point so the hidden face can never be clicked mid-turn. */
const FLIP_MS = motion.duration.deliberate;

/** The queue as a physical rail: one segment per card, tinted by the grade it
 *  was given, so the deck's shape is visible without counting cards. */
function QueueRail({
  session,
  content,
}: {
  session: RetainSession;
  content: RetainContent;
}) {
  const t = useT(STRINGS);
  const grades = Object.fromEntries(reviewGrades().map((g) => [g.key, g.color]));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {content.cards.map((c, i) => {
          const graded = session.done[c.id];
          const current = i === session.idx && !session.finished;
          return (
            <div
              key={c.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: graded
                  ? grades[graded]
                  : current
                    ? color.accent
                    : "rgba(44,40,35,0.12)",
                transition: transition(["background", "opacity"], "slow", "enter"),
                animation: current ? "railPulse 2.2s ease-in-out infinite" : undefined,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 7,
          ...kicker(9.5, "0.1em"),
        }}
      >
        <span>
          {t.cardOf(
            Math.min(session.idx + 1, content.cards.length),
            content.cards.length,
          )}
        </span>
        <span>{t.deckLeft(Math.max(0, content.cards.length - session.idx - 1))}</span>
      </div>
    </div>
  );
}

/** The question, filled or blank — shared by both faces of the card so the
 *  answer lands *in* the sentence it belongs to rather than beside it. */
function Question({
  card,
  filled,
  size,
}: {
  card: ReviewCard;
  filled: boolean;
  size: number;
}) {
  if (!card.cloze)
    return (
      <div
        style={{
          fontFamily: font.serif,
          fontSize: size,
          lineHeight: 1.36,
          color: color.ink,
        }}
      >
        <Rich text={card.front} />
      </div>
    );
  return (
    <div
      style={{
        fontFamily: font.serif,
        fontSize: size,
        lineHeight: 1.4,
        color: color.ink,
      }}
    >
      <Rich text={card.cloze[0]} />
      <span
        style={{
          display: "inline-block",
          minWidth: 96,
          borderBottom: `2px solid ${filled ? STATE_COLOR.mastered : "rgba(44,40,35,0.28)"}`,
          textAlign: "center",
          transition: transition("border-color", "slow", "enter"),
        }}
      >
        {filled ? (
          <span
            style={{
              color: STATE_COLOR.mastered,
              display: "inline-block",
              animation: "clozeReveal .34s cubic-bezier(.34,1.56,.64,1) both .3s",
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

/** One card, as an object: dealt off the deck, turned over on its own axis,
 *  tossed aside once graded. Confidence lives on the front, the answer and the
 *  FSRS grades on the back — the whole loop is keyboard-drivable (1–3 to feel,
 *  1–4 to grade, E for the aside, Enter to continue). */
function ActiveCard({
  card,
  session,
  content,
  nodeLabel,
  onConfidence,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
}: {
  card: ReviewCard;
  session: RetainSession;
  content: RetainContent;
  nodeLabel: string;
  onConfidence: (level: ReviewConfidence) => void;
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
  const isConfidence = session.stage === "confidence";
  const revealed = session.stage === "reveal" || session.stage === "aside";
  const failed = session.stage === "failed";
  const flipped = revealed || failed;

  // The toss: a graded card leaves before the next one is dealt. "Again" keeps
  // the card on screen — the fail panel opens underneath it — so it never
  // tosses.
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
      }, 220);
    },
    [tossing, reduced, onGrade],
  );

  // Anki muscle memory: the whole card is drivable without the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (isConfidence && "123".includes(e.key)) {
        e.preventDefault();
        onConfidence((Number(e.key) - 1) as ReviewConfidence);
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
  }, [
    isConfidence,
    revealed,
    failed,
    grades,
    grade,
    onConfidence,
    onToggleAside,
    onContinue,
  ]);

  const remaining = content.cards.length - session.idx - 1;
  const face = {
    gridArea: "1 / 1",
    background: color.card,
    border: `1px solid ${color.hairlineStrong}`,
    borderRadius: 18,
    padding: "32px 34px 28px",
    display: "flex",
    flexDirection: "column" as const,
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    boxShadow: "0 10px 30px rgba(44,40,35,0.07)",
    // Each face carries its own rotation rather than riding a rotated parent:
    // a preserve-3d container leaves hit-testing pointing at the container, so
    // the back face's buttons become unclickable. The face that has turned away
    // also drops out at the half-way point — `backface-visibility` hides it,
    // but hit-testing still finds it.
    transition: `transform ${FLIP_MS}ms ${motion.ease.enter}, visibility 0s linear ${FLIP_MS / 2}ms`,
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: type.color,
            background: `${type.color}14`,
            border: `1px solid ${type.color}44`,
            borderRadius: 7,
            padding: "4px 9px",
          }}
        >
          {type.label}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkGhost }}>
          {t.autoGenerated(card.source)}
        </span>
      </div>

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
                borderRadius: 18,
                pointerEvents: "none",
                background: color.cardAlt,
                border: `1px solid ${color.hairline}`,
                transform: `translateY(${depth * 9}px) scale(${1 - depth * 0.022})`,
                transition: transition(["transform", "opacity"], "slow", "enter"),
                opacity: 1 - depth * 0.25,
              }}
            />
          ) : null,
        )}

        <div
          key={card.id}
          style={{
            position: "relative",
            display: "grid",
            minHeight: 250,
            perspective: 1800,
            animation: tossing
              ? `cardToss .22s ${motion.ease.exit} both`
              : "dealIn .42s cubic-bezier(.2,.8,.3,1) both",
          }}
        >
          {/* Front — the question and the pre-flip confidence tap. */}
          <div
            style={{
              ...face,
              transform: flipped ? "rotateY(-180deg)" : "rotateY(0deg)",
              visibility: flipped ? "hidden" : "visible",
              pointerEvents: flipped ? "none" : "auto",
            }}
          >
            <Question card={card} filled={false} size={26} />

            <div style={{ marginTop: "auto", paddingTop: 28 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 11,
                }}
              >
                <span style={kicker(10, "0.12em")}>{t.beforeFlip}</span>
                <span style={{ ...kicker(9, "0.08em"), color: color.inkGhost }}>
                  {t.confHint}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {reviewConfidenceLabels(language).map((label, i) => {
                  const active = session.conf === i;
                  // Blank → shaky-amber, Solid → mastered-green: the tap is
                  // read on the same scale the map uses.
                  const tone = [STATE_COLOR.gap, STATE_COLOR.shaky, STATE_COLOR.mastered][
                    i
                  ];
                  return (
                    <button
                      className="at-press at-lift"
                      key={label}
                      data-testid={`action-confidence-${i}`}
                      onClick={() => onConfidence(i as ReviewConfidence)}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 7,
                        padding: "14px 12px 12px",
                        borderRadius: 12,
                        cursor: "pointer",
                        fontSize: 15,
                        fontFamily: font.serif,
                        background: active ? `${tone}14` : color.cardAlt,
                        border: `1px solid ${active ? tone : color.hairlineStrong}`,
                        color: active ? tone : color.inkSoft,
                      }}
                    >
                      {/* Three bars filling left to right: blank, shaky, solid. */}
                      <span style={{ display: "flex", gap: 3 }}>
                        {[0, 1, 2].map((b) => (
                          <span
                            key={b}
                            style={{
                              width: 12,
                              height: 4,
                              borderRadius: 2,
                              background: b <= i ? tone : "rgba(44,40,35,0.14)",
                              opacity: b <= i ? 1 : 1,
                              transition: transition("background", "fast"),
                            }}
                          />
                        ))}
                      </span>
                      {label}
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 9.5,
                          color: color.inkGhost,
                        }}
                      >
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 9,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  color: color.inkGhost,
                  textAlign: "center",
                }}
              >
                {t.flipHint}
              </div>
            </div>
          </div>

          {/* Back — the question echoed with its blank filled, the answer, the
              micro-Socratic aside and the FSRS grades. */}
          <div
            style={{
              ...face,
              transform: flipped ? "rotateY(0deg)" : "rotateY(180deg)",
              visibility: flipped ? "visible" : "hidden",
              pointerEvents: flipped ? "auto" : "none",
              borderColor: "rgba(47,107,79,0.28)",
            }}
          >
            <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 8 }}>
              {t.questionEcho}
            </div>
            <div style={{ opacity: 0.66 }}>
              <Question card={card} filled size={19} />
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: `1px solid ${color.hairline}`,
              }}
            >
              <div
                style={{ ...kicker(10, "0.12em"), color: color.accent, marginBottom: 9 }}
              >
                {t.answer}
              </div>
              <div
                style={{
                  fontSize: 16.5,
                  lineHeight: 1.62,
                  color: color.ink,
                  fontFamily: font.serif,
                }}
              >
                <Rich text={card.back} />
              </div>
              <button
                className="at-press"
                onClick={onToggleAside}
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: session.stage === "aside" ? `${ASIDE_ACCENT}12` : "none",
                  border: `1px solid ${session.stage === "aside" ? `${ASIDE_ACCENT}55` : "transparent"}`,
                  borderRadius: 9,
                  padding: "6px 10px",
                  fontSize: 13,
                  color: ASIDE_ACCENT,
                  cursor: "pointer",
                }}
              >
                {t.explainAside}
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 9.5,
                    color: color.inkGhost,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 4,
                    padding: "1px 4px",
                  }}
                >
                  {t.asideKey}
                </span>
              </button>
              {session.stage === "aside" && (
                <div
                  style={{
                    marginTop: 12,
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

            {/* Grade — lives on the card's back, where Anki puts it. Each button
                carries the interval FSRS would hand it. */}
            <div style={{ marginTop: "auto", paddingTop: 26 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 9,
                }}
              >
                <span style={kicker(10, "0.12em")}>{t.gradeInterval}</span>
                <span style={{ ...kicker(9, "0.08em"), color: color.inkGhost }}>
                  {t.gradeHint}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {grades.map((g, i) => (
                  <button
                    className="at-press at-lift"
                    key={g.key}
                    data-testid={`action-grade-${g.key}`}
                    onClick={() => grade(g.key)}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "12px 8px 10px",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: `${g.color}0d`,
                      border: `1px solid ${g.color}55`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.serif,
                        fontSize: 16,
                        color: g.color,
                        fontWeight: 600,
                      }}
                    >
                      {g.label}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.inkFaint,
                      }}
                    >
                      {card.fsrs?.[g.key] ?? ""}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 9.5,
                        color: color.inkGhost,
                      }}
                    >
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Failed — the alive-loop: calibration read, instant re-explain, writeback */}
      {failed && (
        <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
          <div
            style={{
              background: color.cardAlt,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 12,
              padding: "15px 18px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                ...kicker(9.5, "0.1em"),
                color: CRUCIBLE_COLOR.accent,
                marginBottom: 7,
              }}
            >
              {t.confidenceVsResult}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.58, color: color.inkSoft }}>
              {retainCalib(session, language)}
            </div>
          </div>

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
                border: "1px solid rgba(189,112,56,0.35)",
                borderRadius: 12,
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
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 8px 20px rgba(47,107,79,0.24)",
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
                borderRadius: 11,
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
