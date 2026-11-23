"use client";

// Taking back what a Review pass just did — the latest grade, or a suspension
// — and the suspension itself. Split from `useRetain`, which grades.

import { useCallback, useRef, useState } from "react";
import {
  retainReducer,
  retainRewind,
  reviewCard,
  type RetainSession,
  type ReviewCard,
  type StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import { suspendCards } from "@/lib/reviewApi";
import { withRetry } from "@/lib/retry";
import { logWarning } from "@/lib/log";
import type { GradeSync } from "@/components/atlas/gradeSync";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";

export /** What the latest grade or suspension changed, so it can be taken back. */
interface UndoEntry {
  kind: "grade" | "skip";
  /** The pass before it. */
  before: RetainSession;
  /** The stored card before it. */
  card: StoredCard;
  /** Cards dealt into the pass since — the undo keeps them. */
  dealt: ReviewCard[];
  /** The node a miss flagged Shaky, and what it was before. */
  shaky?: { node: string; prev: StateMap[string] | undefined };
  /** The node this grade earned Retained ✓. */
  retained?: string;
}

export function useRetainUndo(deps: {
  run: RunState;
  sessions: SessionState;
  toast: ToastChannel;
  syncRef: React.RefObject<GradeSync | null>;
  shownAtRef: React.MutableRefObject<number>;
}) {
  const { run, sessions, toast, syncRef, shownAtRef } = deps;
  const {
    cardsRef,
    topicIdRef,
    setCards,
    setStates,
    retainContentRef,
    setReviewedNodes,
    setShakyReason,
  } = run;
  const { setRetain, retainRef } = sessions;
  const { showToast, tc } = toast;

  const undoRef = useRef<UndoEntry | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  // Stable: `enterReview` names it in a dependency array.
  const setUndo = useCallback((entry: UndoEntry | null) => {
    undoRef.current = entry;
    setCanUndo(entry !== null);
  }, []);

  /** Take the card on screen out of rotation — a wrong card, a useless one —
   *  and move on without grading it. */
  const retainSuspend = () => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content || cur.finished) return;
    const held = cardsRef.current.find((c) => c.id === reviewCard(cur, content).id);
    if (!held) return;
    setRetain(retainReducer(cur, { type: "skip" }, content));
    shownAtRef.current = Date.now();
    setCards((prev) =>
      prev.map((c) => (c.id === held.id ? { ...c, suspended: true } : c)),
    );
    const topicId = topicIdRef.current;
    if (topicId)
      withRetry(() => suspendCards(topicId, [held.id], true)).catch((err: unknown) =>
        logWarning("card_suspend_failed", err),
      );
    showToast(tc().cardSuspended);
    setUndo({ kind: "skip", before: cur, card: held, dealt: [] });
  };

  /** Take back the latest grade or suspension: the card, the pass, and what
   *  the grade wrote to the map. (A calibration sample stays — it recorded
   *  how sure the learner felt, which the undo doesn't change.) */
  const retainUndo = () => {
    const entry = undoRef.current;
    if (!entry || !retainRef.current) return;
    setUndo(null);
    setRetain(retainRewind(entry.before, entry.dealt));
    shownAtRef.current = Date.now();
    setCards((prev) => prev.map((c) => (c.id === entry.card.id ? entry.card : c)));
    const topicId = topicIdRef.current;
    if (topicId && entry.kind === "grade")
      syncRef.current?.push({ kind: "undo", topicId, cardId: entry.card.id });
    if (topicId && entry.kind === "skip")
      withRetry(() => suspendCards(topicId, [entry.card.id], false)).catch(
        (err: unknown) => logWarning("card_unsuspend_failed", err),
      );
    const { shaky, retained } = entry;
    if (shaky) {
      setStates((prev) => {
        if (prev[shaky.node] !== "shaky") return prev;
        const { [shaky.node]: _flag, ...rest } = prev;
        return shaky.prev === undefined ? rest : { ...rest, [shaky.node]: shaky.prev };
      });
      setShakyReason(shaky.node, null);
    }
    if (retained) setReviewedNodes((prev) => prev.filter((n) => n !== retained));
    showToast(tc().gradeUndone);
  };

  return { undoRef, canUndo, setUndo, retainSuspend, retainUndo };
}
