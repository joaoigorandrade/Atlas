"use client";

import { useEffect, useState } from "react";
import {
  QUEUE_COLOR,
  retainBudget,
  retainCounts,
  retainDeck,
  retainQueueLabel,
  reviewCard,
  reviewGrades,
  type AdherenceState,
  type ReviewCard,
  type ReviewQueue,
  type RetainContent,
  type ReviewGrade,
  type RetainSession,
} from "@/lib/curriculum";
import { color, figures, kicker, layout, transition } from "@/lib/theme";
import StreakFlame from "@/components/map/StreakFlame";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";

import ActiveCard from "@/components/session/RetainCard";
import CardTools from "@/components/session/retain/CardTools";
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
  onFlip: (sure?: number) => void;
  /** Grade after reveal — feeds FSRS (Again opens the alive-loop). */
  onGrade: (grade: ReviewGrade) => void;
  /** Toggle the micro-Socratic aside on a revealed card. */
  onToggleAside: () => void;
  /** Failed card → re-teach now (routes back to Consume). */
  onReteach: () => void;
  /** Failed card → schedule the re-teach and continue the queue. */
  onContinue: () => void;
  /** The dealt card with its grade buttons read off the store as of now. */
  relabel?: (card: ReviewCard) => ReviewCard;
  /** Is there a grade or suspension to take back? */
  canUndo?: boolean;
  onUndo?: () => void;
  /** Take the card on screen out of rotation. */
  onSuspend?: () => void;
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
  relabel,
  canUndo = false,
  onUndo,
  onSuspend,
}: RetainViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  // Re-read when the tab comes back, so a pass left open overnight doesn't
  // print yesterday's intervals on its buttons.
  useVisibleTick();
  const dealt = reviewCard(session, content);
  const card = relabel ? relabel(dealt) : dealt;
  const budget = retainBudget(session, content);
  const narrow = useNarrow();

  return (
    <Sheet data-testid="phase-retain" aria-label="Retain">
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
            border: "1px solid rgba(var(--accent),.22)",
            borderRadius: 20,
            padding: narrow ? "5px 10px" : "6px 14px",
            fontSize: narrow ? 12 : 13,
            color: color.accent,
            whiteSpace: "nowrap",
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

      {/* Body — scrolls; card column + retention-health sidebar, stacked under
          the card on a phone (side by side it squeezed the card to a sliver). */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: narrow ? "16px 14px 96px" : "34px 32px 120px",
            display: "grid",
            gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "minmax(0, 1fr) 268px",
            gap: narrow ? 24 : 34,
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {session.finished ? (
              <>
                <Finished
                  litNodes={litNodes}
                  adherence={adherence}
                  litToday={litToday}
                  onToggleReminder={onToggleReminder}
                  onExit={onExit}
                />
                {/* The last answer of the pass can be taken back too. */}
                {canUndo && onUndo && onSuspend && (
                  <CardTools canUndo onUndo={onUndo} onSuspend={onSuspend} />
                )}
              </>
            ) : (
              <>
                <QueueRail session={session} content={content} />
                <ActiveCard
                  card={card}
                  session={session}
                  nodeLabel={nodeLabel ?? t.thisNode}
                  compact={narrow}
                  onFlip={onFlip}
                  onGrade={onGrade}
                  onToggleAside={onToggleAside}
                  onReteach={onReteach}
                  onContinue={onContinue}
                />
                {onUndo && onSuspend && (
                  <CardTools canUndo={canUndo} onUndo={onUndo} onSuspend={onSuspend} />
                )}
              </>
            )}
          </div>

          <Sidebar content={content} budget={budget} />
        </div>
      </div>
    </Sheet>
  );
}

/** Re-render when the page becomes visible again. */
function useVisibleTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
}

/** Below the phone breakpoint — the layout stacks and the card tightens. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${layout.phone - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Anki's counts: what's left of each queue, the card on screen's underlined. */
function QueueCounts({
  session,
  content,
}: {
  session: RetainSession;
  content: RetainContent;
}) {
  const t = useT(STRINGS);
  const counts = retainCounts(session, content);
  const current = session.finished
    ? undefined
    : (reviewCard(session, content).queue ?? "review");
  const names: Record<ReviewQueue, string> = {
    new: t.queueNew,
    learning: t.queueLearning,
    review: t.queueReview,
  };
  return (
    <span data-testid="queue-counts" style={{ display: "inline-flex", gap: 12 }}>
      {(["new", "learning", "review"] as const).map((q) => (
        <span
          key={q}
          aria-label={`${names[q]}: ${counts[q]}`}
          style={{
            ...figures,
            fontSize: 14,
            fontWeight: 600,
            color: QUEUE_COLOR[q],
            textDecoration: current === q ? "underline" : undefined,
            textUnderlineOffset: 3,
          }}
        >
          {counts[q]}
        </span>
      ))}
    </span>
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
                    : "rgba(var(--ink),.12)",
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
          alignItems: "center",
          marginTop: 7,
          ...kicker(9.5, "0.1em"),
        }}
      >
        <span>{t.cardOf(Math.min(session.idx + 1, deck.length), deck.length)}</span>
        <QueueCounts session={session} content={content} />
      </div>
    </div>
  );
}
