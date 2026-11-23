"use client";

// The Frontier Feed's owner: which concepts a round deals from, how far into it
// the learner is, and the last card's outcome. The answers are not kept here —
// each is a Consume pretest, written straight into that reading's
// `ConsumeProgress` — so a round can be left at any card and nothing it found
// out is lost. A round itself is a sitting, not a record: reopening deals anew.

import { useCallback, useMemo, useState } from "react";
import {
  afterPretest,
  feedConcepts,
  FEED_SIZE,
  inkBalance,
  nextFeedCard,
  normaliseConsumeProgress,
  type ConceptGraph,
  type ConsumeChunk,
  type ConsumeProgress,
  type NodeState,
  type PlanEntry,
} from "@/lib/curriculum";
import type { Screen } from "@/components/atlas/screen";

/** The card just answered, held on screen until the learner moves on. */
export interface FeedOutcome {
  nodeId: string;
  chunk: ConsumeChunk;
  correct: boolean;
  stake: number;
}

interface Round {
  concepts: string[];
  answered: number;
  /** The ink when the round was dealt — the closing tally is the difference. */
  inkAt: number;
  last: FeedOutcome | null;
  /** Concepts with a miss this round: the ones the closing page sends to read. */
  missed: string[];
}

export function useFeed(deps: {
  graph: ConceptGraph;
  display: Record<string, NodeState>;
  /** The frontier in the plan's goal order — the same list the rail shows. */
  frontier: PlanEntry[];
  consumeCache: Record<string, ConsumeChunk[]>;
  consumeProgress: Record<string, ConsumeProgress>;
  setConsumeProgress: React.Dispatch<
    React.SetStateAction<Record<string, ConsumeProgress>>
  >;
  setScreen: (s: Screen) => void;
}) {
  const { graph, display, frontier, consumeCache, consumeProgress } = deps;
  const { setConsumeProgress, setScreen } = deps;
  const [round, setRound] = useState<Round | null>(null);

  // Readings already begun come first — finishing what is started — then the
  // frontier in goal order. A finished reading has no card left (`feedSection`).
  const ready = useMemo(() => {
    const begun = graph.nodes
      .filter((n) => display[n.id] === "learning" && consumeProgress[n.id])
      .map((n) => n.id);
    const order = [...begun, ...frontier.map((e) => e.node.id)];
    return feedConcepts(order, consumeCache, consumeProgress);
  }, [graph, display, frontier, consumeCache, consumeProgress]);

  const ink = useMemo(() => inkBalance(consumeProgress), [consumeProgress]);

  const card =
    round && !round.last && round.answered < FEED_SIZE
      ? nextFeedCard(round.concepts, consumeCache, consumeProgress)
      : null;

  const open = useCallback(() => {
    setRound({ concepts: ready, answered: 0, inkAt: ink, last: null, missed: [] });
    setScreen("feed");
  }, [ready, ink, setScreen]);

  const answer = useCallback(
    (nodeId: string, chunk: ConsumeChunk, oi: number, correct: boolean, stake = 0) => {
      setConsumeProgress((prev) => ({
        ...prev,
        [nodeId]: afterPretest(
          normaliseConsumeProgress(prev[nodeId]),
          chunk.id,
          oi,
          correct,
          stake,
        ),
      }));
      setRound(
        (r) =>
          r && {
            ...r,
            answered: r.answered + 1,
            last: { nodeId, chunk, correct, stake },
            missed:
              correct || r.missed.includes(nodeId) ? r.missed : [...r.missed, nodeId],
            // The answered concept goes to the back, so the next card changes subject.
            concepts: [...r.concepts.filter((id) => id !== nodeId), nodeId],
          },
      );
    },
    [setConsumeProgress],
  );

  const next = useCallback(() => setRound((r) => r && { ...r, last: null }), []);

  const close = useCallback(() => {
    setRound(null);
    setScreen("map");
  }, [setScreen]);

  return { graph, round, ready, ink, card, open, answer, next, close };
}

export type FeedState = ReturnType<typeof useFeed>;
