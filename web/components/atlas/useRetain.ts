"use client";

// The daily Review queue: drafting the day's cards, turning them, grading them
// into FSRS, and the alive-loop back into the map on a miss. Lifted out of
// `useSpiral` on the `usePerform` precedent — Review is a global surface, not
// a rung the spiral hands into (it only ever opens it).

import { useCallback, useEffect, useRef } from "react";
import {
  CONFIDENCE_FELT,
  earnsRetained,
  retainReducer,
  retainStart,
  reviewCard,
  suggestGrade,
  type ConceptNode,
  type ReviewCard,
  type ReviewGrade,
} from "@/lib/curriculum";
import {
  intervalLabels,
  returnsThisPass,
  reviewStoredCard,
  toReviewCard,
  type StoredCard,
} from "@/lib/fsrs";
import { forecastRows, hasReviewWork, retainContentFromStore } from "@/lib/fsrsQueue";
import { fetchJudgeRecall, fetchRetain } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import { createGradeSync, type GradeSync } from "@/components/atlas/gradeSync";
import { seedDrafted, withFiled } from "@/components/atlas/retainDraft";
import { useRetainDraft } from "@/components/atlas/useRetainDraft";
import { useRetainUndo, type UndoEntry } from "@/components/atlas/useRetainUndo";
import type { Screen } from "@/components/atlas/screen";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { Generation } from "@/components/atlas/useGeneration";
import type { createWarmQueue } from "@/lib/warm";

/** Time on one card past which the measurement is a phone left on a table. */
const MAX_CARD_MS = 10 * 60_000;

export function useRetain(deps: {
  run: RunState;
  sessions: SessionState;
  gen: Generation;
  toast: ToastChannel;
  warm: ReturnType<typeof createWarmQueue>;
  languageRef: React.RefObject<Language>;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  later: (fn: () => void, ms: number) => void;
  /** The reading — where a missed card's re-teach goes back into the loop. */
  enterSession: (node: ConceptNode) => void;
}) {
  const { run, sessions, gen, toast, warm, languageRef, setScreen, later, enterSession } =
    deps;
  const {
    formRef,
    graphRef,
    statesRef,
    cards,
    cardsRef,
    topicIdRef,
    setCards,
    setStates,
    setRetainContent,
    retainContentRef,
    setReviewedNodes,
    setShakyReason,
    recordCalib,
  } = run;
  const { setRetain, retainRef } = sessions;
  const { generate } = gen;
  const { showToast, tc } = toast;

  // Grades go to the server as grades (`gradeSync`); the store's copy is the
  // server's to write. When it overrules ours — a stale copy refused, an undo
  // answered — its card replaces the local one.
  const syncRef = useRef<GradeSync | null>(null);
  /** Drops an undo the server just overruled (set below, once the undo exists). */
  const forgetUndoRef = useRef<(cardId: string) => void>(() => undefined);
  useEffect(() => {
    const sync = createGradeSync((topicId, card, refused) => {
      if (topicId !== topicIdRef.current) return;
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
      // A refused grade wrote nothing: its undo would take back another's.
      if (refused) forgetUndoRef.current(card.id);
    });
    syncRef.current = sync;
    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [setCards, topicIdRef]);

  // The forecast beside an open pass follows the store: it was read once at
  // open, so a draft landing behind it, or a grade, left it counting the old
  // due cards.
  useEffect(() => {
    setRetainContent((prev) =>
      prev
        ? { ...prev, forecast: forecastRows(cards, new Date(), languageRef.current) }
        : prev,
    );
  }, [cards, setRetainContent, languageRef]);

  /** When the card on screen was dealt — the review log's duration. */
  const shownAtRef = useRef(0);
  const { undoRef, canUndo, setUndo, retainSuspend, retainUndo } = useRetainUndo({
    run,
    sessions,
    toast,
    syncRef,
    shownAtRef,
  });
  forgetUndoRef.current = (cardId) => {
    if (undoRef.current?.kind === "grade" && undoRef.current.card.id === cardId)
      setUndo(null);
  };

  const { retainPlan, warmRetain, draftInBackground } = useRetainDraft({
    run,
    sessions,
    warm,
    toast,
    languageRef,
    // Cards dealt after a grade are kept by its undo.
    onDealt: (cards) => undoRef.current?.dealt.push(...cards),
  });

  /**
   * Open the daily Review queue — a global surface. Cards already due open at
   * once; cards for newly learned concepts are drafted behind them and dealt
   * into the pass as they land. Only a learner with nothing due at all waits
   * on the first draft.
   */
  const enterReview = useCallback(() => {
    const { budgetMin, touched, uncovered, key, params } = retainPlan();
    // The queue reads from the real card store (#21): due cards, real
    // intervals on the grade buttons, forecast from actual due dates.
    const openFrom = (store: StoredCard[]): boolean => {
      if (!hasReviewWork(store)) {
        showToast(tc().queueClear);
        return false;
      }
      setRetainContent(
        retainContentFromStore(store, budgetMin, new Date(), languageRef.current),
      );
      setRetain(retainStart());
      setUndo(null);
      shownAtRef.current = Date.now();
      setScreen("review");
      return true;
    };
    if (touched.length === 0) {
      showToast(tc().nothingToReview);
      return;
    }
    if (hasReviewWork(cardsRef.current)) {
      openFrom(cardsRef.current);
      if (uncovered.length) void draftInBackground();
      return;
    }
    if (uncovered.length === 0) {
      openFrom(cardsRef.current);
      return;
    }
    // Nothing due yet: the first draft is what there is to review.
    generate(
      key,
      tc().kickerRetain,
      tc().draftingCards,
      () => fetchRetain(params),
      (content) => {
        const seeded = seedDrafted(content, cardsRef.current);
        setCards((prev) => withFiled(prev, seeded));
        if (openFrom(withFiled(cardsRef.current, seeded))) void draftInBackground(seeded);
      },
    );
  }, [
    languageRef,
    tc,
    generate,
    retainPlan,
    showToast,
    setRetain,
    cardsRef,
    setCards,
    setRetainContent,
    setScreen,
    draftInBackground,
    setUndo,
  ]);

  /** A dealt card with its grade buttons read off the store as of now. The
   *  labels were computed when the deck opened, and a pass left open for an
   *  hour showed intervals an hour stale. */
  const relabel = useCallback(
    (card: ReviewCard): ReviewCard => {
      const held = cardsRef.current.find((c) => c.id === card.id);
      return held
        ? { ...card, fsrs: intervalLabels(held, new Date(), languageRef.current) }
        : card;
    },
    [cardsRef, languageRef],
  );

  /** Turn the card — and when an answer was written or spoken first (W4.3),
   *  ask whether it came back, as a one-row retrieval (the Recall judge). The
   *  verdict is a suggestion on the grade buttons, never a grade. */
  const retainFlip = (sure?: number, said?: string) => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    setRetain(retainReducer(cur, { type: "flip", sure, said }, content));
    const answer = said?.trim();
    if (!answer || cur.stage !== "question") return;
    const card = reviewCard(cur, content);
    fetchJudgeRecall({
      topic: formRef.current.topic,
      nodeLabel: graphRef.current.nodes.find((n) => n.id === card.node)?.label ?? "",
      brief: card.cloze ? `${card.cloze[0]} ___ ${card.cloze[1]}` : (card.front ?? ""),
      rubric: [{ subPoint: "the answer", mustConvey: [card.answer ?? card.back] }],
      answer,
      language: languageRef.current,
    })
      .then((j) => {
        const verdict = j.verdicts.find((r) => r.i === 0)?.verdict ?? "skipped";
        setRetain((prev) =>
          prev && retainContentRef.current
            ? retainReducer(
                prev,
                {
                  type: "suggest",
                  idx: cur.idx,
                  grade: suggestGrade(verdict),
                  read: j.response,
                },
                retainContentRef.current,
              )
            : prev,
        );
      })
      // The flip stands without it: the grade was always the learner's.
      .catch(() => undefined);
  };

  const retainToggleAside = () => {
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "toggleAside" }, retainContentRef.current);
    });
  };

  const retainContinue = () => {
    shownAtRef.current = Date.now();
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "continue" }, retainContentRef.current);
    });
  };

  const nodeLabel = (id: string) =>
    graphRef.current.nodes.find((n) => n.id === id)?.label ?? tc().thisNode;

  /**
   * Grade a card — feeds FSRS and advances. "Again" is the alive-loop: the
   * fail stage opens and the card's node is flagged Shaky, so retention
   * failure re-enters Phase 1.
   */
  const retainGrade = (grade: ReviewGrade) => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    // Only a turned card is graded: a second press on the fail stage would
    // otherwise review the card twice.
    if (!cur || !content || (cur.stage !== "reveal" && cur.stage !== "aside")) return;
    const card = reviewCard(cur, content);
    // Every trip is a real review, as in Anki: the store holds the card as the
    // last grade left it, so a second answer schedules from the step the first
    // one put it on. A card the scheduler brings back inside the learn-ahead
    // window is dealt again before the pass ends, with that step's intervals.
    const firstTrip = cur.idx < content.cards.length;
    const held = cardsRef.current.find((c) => c.id === card.id);
    const now = new Date();
    const durationMs = Math.min(
      MAX_CARD_MS,
      Math.max(0, now.getTime() - shownAtRef.current),
    );
    const graded = held ? reviewStoredCard(held, grade, now, durationMs) : undefined;
    const next = graded?.card;
    const returns =
      next && !next.suspended && returnsThisPass(next, now)
        ? toReviewCard(next, now, languageRef.current)
        : undefined;
    const after = retainReducer(cur, { type: "grade", grade, returns }, content);
    setRetain(after);
    if (after.stage !== "failed") shownAtRef.current = Date.now();
    if (held && next) {
      // The local copy moves now, so the requeue and the next buttons read it;
      // the server's copy moves with the grade itself (`gradeSync`).
      setCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));
      const topicId = topicIdRef.current;
      if (topicId)
        syncRef.current?.push({
          kind: "grade",
          topicId,
          cardId: next.id,
          grade,
          reviewedAt: now.toISOString(),
          durationMs,
          expectReps: held.fsrs.reps ?? 0,
        });
    }
    // The flip's confidence tap, against whether it came back at all — read
    // off the judged answer when there was one (W4.3): a grade given after
    // seeing the back is the fluency this reading exists to catch.
    const cameBack = (cur.suggest?.grade ?? grade) !== "again";
    if (firstTrip && cur.sure !== undefined)
      recordCalib(card.node, CONFIDENCE_FELT[cur.sure], cameBack ? 100 : 0);
    // Real review history — what finally earns "Retained ✓" (#13) — and only
    // across a real interval: read off the card *before* this grade moved it.
    let retained: string | undefined;
    if (held && earnsRetained(grade, held.fsrs)) {
      retained = card.node;
      setReviewedNodes((prev) =>
        prev.includes(card.node) ? prev : [...prev, card.node],
      );
    }
    // Flag once: a card missed again on its next trip has already said so.
    let shaky: UndoEntry["shaky"];
    if (grade === "again" && card.fails && statesRef.current[card.node] !== "shaky") {
      shaky = { node: card.node, prev: statesRef.current[card.node] };
      setStates((prev) =>
        prev[card.node] === "shaky" ? prev : { ...prev, [card.node]: "shaky" },
      );
      setShakyReason(card.node, "review-miss");
      showToast(tc().cardFlaggedShaky(nodeLabel(card.node)), tc().mapUpdated);
    }
    // A leech is pulled from rotation by the grade itself; the fail stage's
    // re-teach is the way back to it.
    if (graded?.leech) showToast(tc().cardLeech(nodeLabel(card.node)));
    setUndo(
      held
        ? { kind: "grade", before: cur, card: held, dealt: [], shaky, retained }
        : null,
    );
  };

  const retainReteach = () => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    const node = graphRef.current.nodes.find((n) => n.id === card.node);
    setRetain(null);
    setUndo(null);
    if (node) {
      enterSession(node);
      later(() => showToast(tc().reEnteringLoop(node.label)), 420);
    } else {
      setScreen("map");
    }
  };

  const exitReview = () => {
    setScreen("map");
    setRetain(null);
    setUndo(null);
  };

  return {
    retainPlan,
    warmRetain,
    enterReview,
    /** Everything the Review sheet calls, under the props it takes them as. */
    reviewActions: {
      onExit: exitReview,
      onFlip: retainFlip,
      onGrade: retainGrade,
      onToggleAside: retainToggleAside,
      onReteach: retainReteach,
      onContinue: retainContinue,
      relabel,
      canUndo,
      onUndo: retainUndo,
      onSuspend: retainSuspend,
    },
  };
}
