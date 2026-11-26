"use client";

// The Retain card factory's side of Review: which nodes still need cards,
// warming that draft ahead of the click, and drafting the rest behind an open
// queue so the learner never waits on a model to review what is already due.

import { useCallback, useRef } from "react";
import {
  RETAIN_DRAFT_NODES,
  reviewableNodes,
  sectionText,
  retainReducer,
  uncoveredNodes,
  type ReviewCard,
} from "@/lib/curriculum";
import { toReviewCard, type StoredCard } from "@/lib/fsrs";
import { fetchRetain } from "@/lib/api";
import { logWarning } from "@/lib/log";
import type { Language } from "@/lib/i18n";
import {
  MAX_BACKGROUND_DRAFTS,
  seedDrafted,
  withFiled,
} from "@/components/atlas/retainDraft";
import type { ToastChannel } from "@/components/atlas/useToast";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { createWarmQueue } from "@/lib/warm";

export function useRetainDraft(deps: {
  run: RunState;
  sessions: SessionState;
  warm: ReturnType<typeof createWarmQueue>;
  toast: ToastChannel;
  languageRef: React.RefObject<Language>;
  /** Cards dealt into the open pass. Must be stable. */
  onDealt: (cards: ReviewCard[]) => void;
}) {
  const { run, sessions, warm, toast, languageRef } = deps;
  const {
    formRef,
    graphRef,
    statesRef,
    consumeCacheRef,
    cardsRef,
    topicIdRef,
    setCards,
    retainContentRef,
    phasesDoneRef,
  } = run;
  const { setRetain, retainRef } = sessions;
  const { showToast, tc } = toast;
  // A ref, so a fresh closure from the caller each render costs nothing here.
  const onDealtRef = useRef(deps.onDealt);
  onDealtRef.current = deps.onDealt;
  const onDealt = useCallback((cards: ReviewCard[]) => onDealtRef.current(cards), []);
  const drafting = useRef(false);

  /**
   * What the Review queue would generate right now: the card factory only runs
   * for touched nodes that have no factory card yet (a node carded only by
   * Connect or Drill still needs the card that asks for the node itself).
   * Derived in one place so a warm and the real entry address the same cache
   * row. `store` overrides the rendered cards while a draft run is filing. */
  const retainPlan = useCallback(
    (store: readonly StoredCard[] = cardsRef.current) => {
      const budgetMin = Math.min(15, Math.max(5, Math.round(formRef.current.target / 2)));
      const touched = reviewableNodes(
        graphRef.current.nodes,
        statesRef.current,
        formRef.current.goal,
        phasesDoneRef.current,
      );
      // One draft covers one draft's worth of nodes. Sending every uncovered
      // node asked for more cards than the factory will ever return, so the
      // surplus was silently dropped; the background run drafts the rest.
      const uncovered = uncoveredNodes(touched, store).slice(0, RETAIN_DRAFT_NODES);
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
            // What the reading taught, so each key idea gets its own card.
            takeaways: consumeCacheRef.current[n.id]?.map((c) => c.takeaway),
            // And the reading itself, so a deck can cover all of it.
            reading: consumeCacheRef.current[n.id]?.map(sectionText).join("\n\n"),
          })),
          interests: formRef.current.interests,
          language: languageRef.current,
        },
      };
    },
    [cardsRef, formRef, graphRef, statesRef, consumeCacheRef, languageRef, phasesDoneRef],
  );

  /** Draft the day's new cards ahead of the click. The result is discarded —
   *  its point is filling the shared cache so opening Review is a lookup. */
  const warmRetain = useCallback(() => {
    const plan = retainPlan();
    if (plan.uncovered.length === 0) return;
    warm.warm(plan.key, () => fetchRetain(plan.params, { prefetch: true }));
  }, [retainPlan, warm]);

  /** Freshly drafted cards, dealt at the end of the open pass. */
  const dealFresh = useCallback(
    (seeded: StoredCard[]) => {
      const cur = retainRef.current;
      const content = retainContentRef.current;
      if (!cur || !content || cur.finished) return;
      const now = new Date();
      const cards = seeded.map((c) => toReviewCard(c, now, languageRef.current));
      if (cards.length === 0) return;
      setRetain((prev) =>
        prev && retainContentRef.current
          ? retainReducer(prev, { type: "deal", cards }, retainContentRef.current)
          : prev,
      );
      onDealt(cards);
      showToast(tc().cardsDealt(cards.length));
    },
    [languageRef, onDealt, retainContentRef, retainRef, setRetain, showToast, tc],
  );

  /**
   * Draft cards for the rest of the uncovered nodes behind an open queue —
   * one draft's worth at a time, never blocking the review. `filed` is cards
   * already drafted this open that React may not have rendered yet.
   */
  const draftInBackground = useCallback(
    async (filed: StoredCard[] = []) => {
      if (drafting.current) return;
      drafting.current = true;
      const topicId = topicIdRef.current;
      const known = () => withFiled(cardsRef.current, filed);
      try {
        for (let i = 0; i < MAX_BACKGROUND_DRAFTS; i++) {
          const plan = retainPlan(known());
          if (plan.uncovered.length === 0) break;
          // Through the warm queue: a warm of this same draft may be in flight,
          // and calling past it paid for the deck twice.
          const content = await warm.run(plan.key, () => fetchRetain(plan.params), true);
          // The learner opened another map meanwhile: these are not its cards.
          if (topicIdRef.current !== topicId) break;
          const seeded = seedDrafted(content, known());
          // Nothing new — the model skipped these nodes; the next open retries.
          if (seeded.length === 0) break;
          filed.push(...seeded);
          setCards((prev) => withFiled(prev, seeded));
          dealFresh(seeded);
        }
      } catch (err) {
        logWarning("retain_background_draft_failed", err);
      } finally {
        drafting.current = false;
      }
    },
    [cardsRef, dealFresh, retainPlan, setCards, topicIdRef, warm],
  );

  return { retainPlan, warmRetain, draftInBackground };
}
