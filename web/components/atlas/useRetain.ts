"use client";

// The daily Review queue: drafting the day's cards, turning them, grading them
// into FSRS, and the alive-loop back into the map on a miss. Lifted out of
// `useSpiral` on the `usePerform` precedent — Review is a global surface, not
// a rung the spiral hands into (it only ever opens it).

import { useCallback } from "react";
import {
  CONFIDENCE_FELT,
  earnsRetained,
  RETAIN_DRAFT_NODES,
  retainReducer,
  retainStart,
  reviewCard,
  suggestGrade,
  type ConceptNode,
  type ReviewGrade,
} from "@/lib/curriculum";
import {
  dueCards,
  gradeStoredCard,
  newStoredCard,
  retainContentFromStore,
  returnsThisPass,
  toReviewCard,
  type StoredCard,
} from "@/lib/fsrs";
import { fetchJudgeRecall, fetchRetain } from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { Generation } from "@/components/atlas/useGeneration";
import type { createWarmQueue } from "@/lib/warm";

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
    cardsRef,
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

  /**
   * What the Review queue would generate right now: the card factory only runs
   * for touched nodes that have no cards yet. Derived in one place so a warm
   * and the real entry address the same cache row. */
  const retainPlan = useCallback(() => {
    const budgetMin = Math.min(15, Math.max(5, Math.round(formRef.current.target / 2)));
    const touched = graphRef.current.nodes.filter(
      (n) =>
        !n.gap &&
        ["learning", "shaky", "mastered"].includes(statesRef.current[n.id] ?? ""),
    );
    // One draft covers one draft's worth of nodes. Sending every uncovered node
    // asked for more cards than the factory will ever return, so the surplus
    // nodes were silently dropped by whichever ones the model chose to write.
    const uncovered = touched
      .filter((n) => !cardsRef.current.some((c) => c.nodeId === n.id))
      .slice(0, RETAIN_DRAFT_NODES);
    return {
      budgetMin,
      touched,
      uncovered,
      key: `retain:${uncovered.map((n) => n.id).join(",")}`,
      params: {
        topic: formRef.current.topic,
        budgetMin,
        nodes: uncovered.map((n) => ({
          id: n.id,
          label: n.label,
          state: statesRef.current[n.id]!,
          ...(n.summary ? { summary: n.summary } : null),
        })),
        interests: formRef.current.interests,
        language: languageRef.current,
      },
    };
  }, [cardsRef, formRef, graphRef, statesRef, languageRef]);

  /** Draft the day's new cards ahead of the click. The result is discarded —
   *  its point is filling the shared cache so opening Review is a lookup. */
  const warmRetain = useCallback(() => {
    const plan = retainPlan();
    if (plan.uncovered.length === 0) return;
    warm.warm(plan.key, () => fetchRetain(plan.params, { prefetch: true }));
  }, [retainPlan, warm]);

  /**
   * Open the daily Review queue — a global surface. The day's cards are
   * generated once from the nodes the learner has actually touched; there is
   * nothing to review until at least one concept has been learned.
   */
  const enterReview = useCallback(() => {
    const { budgetMin, touched, uncovered, key, params } = retainPlan();
    // The queue reads from the real card store (#21): due cards, real
    // intervals on the grade buttons, forecast from actual due dates.
    const openFrom = (store: StoredCard[]) => {
      if (dueCards(store).length === 0) {
        showToast(tc().queueClear);
        return;
      }
      setRetainContent(
        retainContentFromStore(store, budgetMin, new Date(), languageRef.current),
      );
      setRetain(retainStart());
      setScreen("review");
    };
    if (touched.length === 0) {
      showToast(tc().nothingToReview);
      return;
    }
    // First review of a node: generate its atomic cards once, then they live
    // in the store forever (the generation is a card FACTORY, not the queue).
    if (uncovered.length === 0) {
      openFrom(cardsRef.current);
      return;
    }
    generate(
      key,
      tc().kickerRetain,
      tc().draftingCards,
      () => fetchRetain(params),
      (content) => {
        const now = new Date();
        const stamp = Date.now();
        // A node that gained cards while this draft was out (another phase
        // drafted some, or an earlier draft landed) keeps the ones it has —
        // filing these as well would deal the same fact twice.
        const carded = new Set(cardsRef.current.map((c) => c.nodeId));
        const fresh = content.cards.filter((c) => !carded.has(c.node));
        const seeded = fresh.map((c, i) =>
          newStoredCard(
            {
              id: `${c.node}-retain-${stamp}-${i}`,
              nodeId: c.node,
              type: c.type,
              source: c.source,
              cloze: c.cloze,
              answer: c.answer,
              front: c.front,
              back: c.back,
              reExplain: c.reExplain,
            },
            now,
          ),
        );
        const all = [...cardsRef.current, ...seeded];
        setCards(all);
        openFrom(all);
      },
      false,
      // A failed draft is new cards that didn't arrive, not a reason to keep
      // the learner from the ones already due: review those, and the uncovered
      // nodes are drafted again on the next open.
      () => {
        if (dueCards(cardsRef.current).length === 0) return false;
        openFrom(cardsRef.current);
        showToast(tc().draftFailedReviewing);
        return true;
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
  ]);

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
    setRetain((prev) => {
      if (!prev || !retainContentRef.current) return prev;
      return retainReducer(prev, { type: "continue" }, retainContentRef.current);
    });
  };

  /**
   * Grade a card — feeds FSRS and advances. "Again" is the alive-loop: the
   * fail stage opens and the card's node is flagged Shaky, so retention
   * failure re-enters Phase 1.
   */
  const retainGrade = (grade: ReviewGrade) => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    // Every trip is a real review, as in Anki: the store holds the card as the
    // last grade left it, so a second answer schedules from the step the first
    // one put it on. A card the scheduler brings back inside the learn-ahead
    // window is dealt again before the pass ends, with that step's intervals.
    const firstTrip = cur.idx < content.cards.length;
    const held = cardsRef.current.find((c) => c.id === card.id);
    const now = new Date();
    const next = held ? gradeStoredCard(held, grade, now) : undefined;
    const returns =
      next && returnsThisPass(next, now)
        ? toReviewCard(next, now, languageRef.current)
        : undefined;
    setRetain(retainReducer(cur, { type: "grade", grade, returns }, content));
    // Real FSRS (#21): the scheduler computes the card's next due date.
    if (next) setCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    // The flip's confidence tap, against whether it came back at all — read
    // off the judged answer when there was one (W4.3): a grade given after
    // seeing the back is the fluency this reading exists to catch.
    const cameBack = (cur.suggest?.grade ?? grade) !== "again";
    if (firstTrip && cur.sure !== undefined)
      recordCalib(card.node, CONFIDENCE_FELT[cur.sure], cameBack ? 100 : 0);
    // Real review history — what finally earns "Retained ✓" (#13) — and only
    // across a real interval: read off the card *before* this grade moved it.
    if (held && earnsRetained(grade, held.fsrs))
      setReviewedNodes((prev) =>
        prev.includes(card.node) ? prev : [...prev, card.node],
      );
    // Flag once: a card missed again on its next trip has already said so.
    if (grade === "again" && card.fails && statesRef.current[card.node] !== "shaky") {
      setStates((prev) =>
        prev[card.node] === "shaky" ? prev : { ...prev, [card.node]: "shaky" },
      );
      setShakyReason(card.node, "review-miss");
      showToast(
        tc().cardFlaggedShaky(
          graphRef.current.nodes.find((n) => n.id === card.node)?.label ?? tc().thisNode,
        ),
        tc().mapUpdated,
      );
    }
  };

  const retainReteach = () => {
    const cur = retainRef.current;
    const content = retainContentRef.current;
    if (!cur || !content) return;
    const card = reviewCard(cur, content);
    const node = graphRef.current.nodes.find((n) => n.id === card.node);
    setRetain(null);
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
  };

  return {
    retainPlan,
    warmRetain,
    enterReview,
    retainFlip,
    retainToggleAside,
    retainContinue,
    retainGrade,
    retainReteach,
    exitReview,
  };
}
