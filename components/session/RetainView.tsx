"use client";

import {
  CONNECT_COLOR,
  CRUCIBLE_COLOR,
  FORECAST_COLOR,
  REVIEW_ASIDE,
  REVIEW_CONFIDENCE,
  REVIEW_GRADES,
  REVIEW_TYPE_META,
  STATE_COLOR,
  STREAK_COLOR,
  reminderCopy,
  retainBudget,
  retainCalib,
  retainQueueLabel,
  reviewCard,
  type AdherenceState,
  type RetainContent,
  type ReviewCard,
  type ReviewConfidence,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import StreakFlame from "@/components/map/StreakFlame";

// The micro-Socratic aside borrows Connect's violet; the fail re-explanation
// borrows the learning-blue and the flagged node the shaky-amber, so each reads
// the same here as it does on the map.
const ASIDE_ACCENT = CONNECT_COLOR.accent;

interface RetainViewProps {
  /** The generated review queue (cards + forecast + budget). */
  content: RetainContent;
  session: RetainSession;
  /** Label of the current card's node — the fail write-back names it. */
  nodeLabel: string;
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
}: RetainViewProps) {
  const card = reviewCard(session, content);
  const budget = retainBudget(session, content);

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
            color: color.accent,
          }}
        >
          Retain · Review
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
              <ActiveCard
                card={card}
                session={session}
                nodeLabel={nodeLabel}
                onConfidence={onConfidence}
                onGrade={onGrade}
                onToggleAside={onToggleAside}
                onReteach={onReteach}
                onContinue={onContinue}
              />
            )}
          </div>

          <Sidebar content={content} budget={budget} />
        </div>
      </div>
    </div>
  );
}

/** The done-for-today surface: short, winnable, ending on a lit node — and the
 *  streak ticking forward, so the last thing the learner sees is a good feeling. */
function Finished({
  litNodes,
  adherence,
  litToday,
  onToggleReminder,
  onExit,
}: {
  litNodes: number;
  adherence: AdherenceState;
  litToday: string[];
  onToggleReminder: () => void;
  onExit: () => void;
}) {
  return (
    <div
      style={{
        background: color.card,
        border: "1px solid rgba(76,139,99,0.3)",
        borderRadius: 18,
        padding: "40px 40px 32px",
        textAlign: "center",
        animation: "fadeUp .4s both",
      }}
    >
      <div style={{ ...kicker(11), color: color.accent, marginBottom: 14 }}>
        Done for today
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontWeight: 500,
          fontSize: 32,
          lineHeight: 1.15,
          marginBottom: 12,
        }}
      >
        Queue clear. You ended on a green node.
      </div>
      <div
        style={{
          fontSize: 14.5,
          color: color.inkMuted,
          lineHeight: 1.55,
          maxWidth: 440,
          margin: "0 auto 24px",
        }}
      >
        Short, winnable, and it lit something up — the feeling that pulls you
        back tomorrow. FSRS has already scheduled every card for its next optimal
        moment.
      </div>

      {/* What lit up — the concrete "you moved the territory" line, when a node
          reached green this run. */}
      {litToday.length > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            background: color.successBg,
            border: "1px solid rgba(76,139,99,0.32)",
            borderRadius: 10,
            padding: "9px 15px",
            margin: "0 auto 24px",
            fontSize: 13.5,
            color: color.accent,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATE_COLOR.mastered,
              boxShadow: `0 0 6px ${STATE_COLOR.mastered}`,
              flex: "0 0 auto",
            }}
          />
          Lit up today · {litToday.join(" · ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <div
          style={{
            background: "rgba(201,154,46,0.1)",
            border: `1px solid ${STREAK_COLOR.flame}44`,
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              color: STREAK_COLOR.flame,
            }}
          >
            {adherence.streak}
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>day streak</div>
        </div>
        <div
          style={{
            background: color.accentBg,
            border: "1px solid rgba(47,107,79,0.22)",
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div
            style={{ fontFamily: font.serif, fontSize: 26, color: color.accent }}
          >
            +1
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>today, in</div>
        </div>
        <div
          style={{
            background: color.cardAlt,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div style={{ fontFamily: font.serif, fontSize: 26, color: color.ink }}>
            {litNodes}
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>nodes alive</div>
        </div>
      </div>

      {/* The forgiving-streak reassurance — the banked freezes, so tomorrow's
          miss never feels like ruin. */}
      {adherence.freezes > 0 && (
        <div
          style={{
            marginTop: 18,
            fontSize: 12.5,
            color: color.inkFaint,
            lineHeight: 1.5,
          }}
        >
          {adherence.freezes} freeze
          {adherence.freezes === 1 ? "" : "s"} banked — miss a day and the streak
          still holds.
        </div>
      )}

      {/* Right-moment reminder — set the nudge for the learner's actual rhythm. */}
      <button
        onClick={onToggleReminder}
        style={{
          marginTop: 8,
          background: "none",
          border: "none",
          fontSize: 12.5,
          color: color.accent,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {reminderCopy(adherence)}
      </button>

      <div>
        <button
          onClick={onExit}
          style={{
            marginTop: 22,
            padding: "14px 26px",
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
          Back to the map →
        </button>
      </div>
    </div>
  );
}

/** One card: type tag, the question, then the confidence tap / reveal / fail. */
function ActiveCard({
  card,
  session,
  nodeLabel,
  onConfidence,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
}: {
  card: ReviewCard;
  session: RetainSession;
  nodeLabel: string;
  onConfidence: (level: ReviewConfidence) => void;
  onGrade: (grade: ReviewGrade) => void;
  onToggleAside: () => void;
  onReteach: () => void;
  onContinue: () => void;
}) {
  const type = REVIEW_TYPE_META[card.type];
  const isConfidence = session.stage === "confidence";
  const revealed = session.stage === "reveal" || session.stage === "aside";
  const failed = session.stage === "failed";
  // Both the reveal and the fail stage show the filled cloze answer.
  const answerShown = revealed || failed;

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
        <span
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkGhost }}
        >
          auto-generated · from your {card.source} session
        </span>
      </div>

      {/* The card itself — question always up top, confidence/reveal below */}
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 18,
          padding: "36px 34px 30px",
          boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
          minHeight: 230,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {card.cloze ? (
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              lineHeight: 1.4,
              color: color.ink,
            }}
          >
            {card.cloze[0]}
            <span
              style={{
                display: "inline-block",
                minWidth: 96,
                borderBottom: "2px solid rgba(44,40,35,0.28)",
                textAlign: "center",
                color: "#c99a2e",
              }}
            >
              {answerShown ? (
                <span style={{ color: STATE_COLOR.mastered }}>{card.answer}</span>
              ) : (
                " "
              )}
            </span>
            {card.cloze[1]}
          </div>
        ) : (
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              lineHeight: 1.36,
              color: color.ink,
            }}
          >
            {card.front}
          </div>
        )}

        {isConfidence && (
          <div style={{ marginTop: "auto", paddingTop: 28 }}>
            <div style={{ ...kicker(10, "0.12em"), marginBottom: 11 }}>
              Before you flip · how solid is this?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {REVIEW_CONFIDENCE.map((label, i) => {
                const active = session.conf === i;
                return (
                  <button
                    key={label}
                    onClick={() => onConfidence(i as ReviewConfidence)}
                    style={{
                      flex: 1,
                      padding: "13px 12px",
                      borderRadius: 11,
                      cursor: "pointer",
                      fontSize: 15,
                      textAlign: "center",
                      fontFamily: font.serif,
                      background: active ? "rgba(47,107,79,0.08)" : color.cardAlt,
                      border: `1px solid ${
                        active ? color.accent : color.hairlineStrong
                      }`,
                      color: active ? color.accent : color.inkSoft,
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {revealed && (
          <div
            style={{
              marginTop: 22,
              paddingTop: 22,
              borderTop: `1px solid ${color.hairline}`,
              animation: "fadeUp .25s both",
            }}
          >
            <div style={{ ...kicker(10, "0.12em"), color: color.accent, marginBottom: 9 }}>
              Answer
            </div>
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.62,
                color: color.ink,
                fontFamily: font.serif,
              }}
            >
              {card.back}
            </div>
            <button
              onClick={onToggleAside}
              style={{
                marginTop: 14,
                background: "none",
                border: "none",
                fontSize: 13,
                color: ASIDE_ACCENT,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Explain · micro-Socratic aside
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
                {REVIEW_ASIDE}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grade — after reveal, feeds FSRS */}
      {revealed && (
        <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
          <div style={{ ...kicker(10, "0.12em"), marginBottom: 9 }}>
            Grade · sets the next interval (FSRS)
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {REVIEW_GRADES.map((g) => (
              <button
                key={g.key}
                onClick={() => onGrade(g.key)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "13px 8px 11px",
                  borderRadius: 12,
                  cursor: "pointer",
                  background: color.card,
                  border: `1px solid ${g.color}55`,
                  transition: "border-color .15s, background .15s",
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
                  {card.fsrs[g.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
              Confidence vs. result
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.58, color: color.inkSoft }}>
              {retainCalib(session)}
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
              A failed card doesn&rsquo;t just reschedule — a 30-second Socratic
              re-explanation, right here:
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 16,
                lineHeight: 1.55,
                color: color.ink,
              }}
            >
              {card.reExplain}
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
                }}
              />
              <div>
                <div
                  style={{ fontFamily: font.serif, fontSize: 17, marginBottom: 3 }}
                >
                  &ldquo;{nodeLabel}&rdquo; flagged Shaky on your map.
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: color.inkMuted,
                    lineHeight: 1.55,
                  }}
                >
                  Retention failure re-enters the loop — the node pulls attention
                  back until it&rsquo;s re-taught. This is what separates the app
                  from Anki plus a chatbot.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
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
              Re-teach now →
            </button>
            <button
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
              Schedule re-teach · continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The right rail — the honest budget bar and the FSRS retention forecast. */
function Sidebar({
  content,
  budget,
}: {
  content: RetainContent;
  budget: ReturnType<typeof retainBudget>;
}) {
  return (
    <div>
      {/* Today's budget — minutes, never a wall of cards */}
      <div
        style={{
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 14,
          padding: "18px 18px 8px",
          marginBottom: 16,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 6 }}>
          Today&rsquo;s budget
        </div>
        <div style={{ fontSize: 13, color: color.inkMuted, marginBottom: 11 }}>
          Daily target · {content.budgetMin} min
        </div>
        <div
          style={{
            height: 8,
            background: "rgba(44,40,35,0.1)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${budget.pct}%`,
              height: "100%",
              background: color.accent,
              borderRadius: 4,
              transition: "width .5s",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 12,
            color: color.inkFaint,
            marginTop: 9,
            lineHeight: 1.5,
            paddingBottom: 8,
          }}
        >
          Framed in minutes, never a wall of cards. When the target&rsquo;s met,
          you&rsquo;re done — guilt-free.
        </div>
      </div>

      {/* Retention health · FSRS forecast */}
      <div
        style={{
          background: color.cardAlt,
          border: `1px solid ${color.hairline}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ ...kicker(9.5, "0.12em"), marginBottom: 14 }}>
          Retention health · FSRS forecast
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {content.forecast.map((f) => (
            <div key={f.label} style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  width: 8,
                  alignSelf: "stretch",
                  borderRadius: 4,
                  background: FORECAST_COLOR[f.tone],
                  flex: "0 0 auto",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ fontSize: 13.5, color: color.ink }}>
                    {f.label}
                  </span>
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: 15,
                      color: color.ink,
                    }}
                  >
                    {f.count}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: color.inkFaint,
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  {f.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 15,
            paddingTop: 13,
            borderTop: `1px solid ${color.hairline}`,
            fontSize: 12,
            color: color.inkFaint,
            lineHeight: 1.5,
          }}
        >
          FSRS predicts recall per card and surfaces each at its optimal spacing —
          not fixed SM-2 steps.
        </div>
      </div>
    </div>
  );
}
