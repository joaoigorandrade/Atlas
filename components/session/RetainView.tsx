"use client";

import {
  retainBudget,
  retainDeck,
  retainQueueLabel,
  reviewCard,
  reviewGrades,
  type AdherenceState,
  type RetainContent,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, kicker, transition } from "@/lib/theme";
import StreakFlame from "@/components/map/StreakFlame";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";

import ActiveCard from "@/components/session/RetainCard";
import { STRINGS } from "@/components/session/retainCopy";
import Finished from "@/components/session/RetainFinished";
import Sidebar from "@/components/session/RetainSidebar";

interface RetainViewProps {
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
  /** Turn the card over. */
  onFlip: () => void;
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
  onFlip,
  onGrade,
  onToggleAside,
  onReteach,
  onContinue,
}: RetainViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const card = reviewCard(session, content);
  const budget = retainBudget(session, content);

  return (
    <Sheet data-testid="phase-retain" aria-label="Retain — {title}">
      <Masthead
        back={t.map}
        onBack={onExit}
        kicker={t.retainReview}
        accent={color.accent}
      >
        <StreakFlame adherence={adherence} onToggleReminder={onToggleReminder} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: color.accentBg,
            border: "1px solid rgba(58,106,85,0.22)",
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
          {retainQueueLabel(session, content, language)}
        </div>
      </Masthead>

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
                remaining={content.remaining ?? 0}
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
                  onFlip={onFlip}
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
  // The deck, not the content: a missed card is on the rail twice, and its
  // second slot stays unanswered until it has actually been answered again.
  const deck = retainDeck(session, content);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {deck.map((c, i) => {
          const graded = session.done[i];
          const current = i === session.idx && !session.finished;
          return (
            <div
              key={`${c.id}-${i}`}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: graded
                  ? grades[graded]
                  : current
                    ? color.accent
                    : "rgba(43,33,24,0.12)",
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
        <span>{t.cardOf(Math.min(session.idx + 1, deck.length), deck.length)}</span>
        <span>{t.deckLeft(Math.max(0, deck.length - session.idx - 1))}</span>
      </div>
    </div>
  );
}
