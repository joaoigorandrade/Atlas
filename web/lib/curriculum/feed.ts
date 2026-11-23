// ---- The Frontier Feed, and the ink bet on its answers ----------------------
// A short round of cards dealt from the next few readings on the map. Each card
// is a Consume pretest — the section's own check, asked before it is read — so
// the feed is not a phase and writes no mastery: its answer lands in the same
// `ConsumeProgress` the reading resumes from. A section the learner already
// had is folded to its takeaway when they open it; a missed one waits in full,
// with its check at the end.
//
// The ink is a bet placed on each pretest answer, before its verdict. It pays
// out on being right *and honest about it*, never on time spent reading.

import {
  needsPretest,
  normaliseConsumeProgress,
  type ConsumeChunk,
  type ConsumeProgress,
} from "./consume";

/**
 * What each confidence tap — `CONFIDENCE_FELT` order, least sure first — wins on
 * a right answer and loses on a wrong one.
 *
 * Lopsided so the best bet is the honest one: "fairly sure" beats "not sure"
 * once the chance of being right passes 1/2, and "very sure" beats "fairly
 * sure" past 2/3. A symmetric table (win n, lose n) would make "very sure" the
 * best bet whenever a guess is better than a coin flip — paying for bravado
 * rather than for knowing what you know.
 */
export const INK_STAKES = [
  { win: 1, lose: 0 },
  { win: 2, lose: 1 },
  { win: 3, lose: 3 },
] as const;

/** Ink won (positive) or lost (negative) on one bet. */
export function inkDelta(stake: number, correct: boolean): number {
  const s = INK_STAKES[stake] ?? INK_STAKES[0];
  // `0 -`, not unary minus: a free bet's loss would otherwise be −0.
  return correct ? s.win : 0 - s.lose;
}

/**
 * The map's ink: every pretest bet over every reading, won or lost. Derived,
 * never stored — the bets are, beside the answers they were placed on, so a
 * total can never drift from the record it sums. It can go below zero: that is
 * what a run of confident misses honestly comes to.
 */
export function inkBalance(
  progress: Record<string, Partial<ConsumeProgress> | undefined>,
): number {
  let ink = 0;
  for (const p of Object.values(progress)) {
    for (const [chunkId, stake] of Object.entries(p?.stakes ?? {})) {
      const correct = p?.pretest?.[chunkId];
      if (correct !== undefined) ink += inkDelta(stake, correct);
    }
  }
  return ink;
}

/** Concepts one round deals from. Few on purpose: answering a card begins its
 *  reading (the record now exists, and the node turns Learning), and a round
 *  should start the next few readings, not every one on the map. */
export const FEED_CONCEPTS = 3;

/** Cards in one round — a few minutes, and then it ends. */
export const FEED_SIZE = 12;

/**
 * The section a concept's next card asks about: its first section still to be
 * pretested. None while a miss is still open on it — the sections after a
 * missed one build on it, and belong to the reading, not to another guess.
 * None on a finished reading, which has nothing left to guess.
 */
export function feedSection(
  chunks: readonly ConsumeChunk[],
  saved: ConsumeProgress | undefined,
): ConsumeChunk | null {
  const p = normaliseConsumeProgress(saved);
  if (p.finished) return null;
  for (const c of chunks) {
    if (p.pretest[c.id] === false && !p.checks[c.id]?.correct) return null;
    if (needsPretest(p, c)) return c;
  }
  return null;
}

/** The concepts a round deals from: the first `FEED_CONCEPTS` of `order` whose
 *  reading is written and still has a card in it. */
export function feedConcepts(
  order: readonly string[],
  cache: Record<string, ConsumeChunk[] | undefined>,
  progress: Record<string, ConsumeProgress | undefined>,
): string[] {
  const out: string[] = [];
  for (const id of order) {
    if (out.length === FEED_CONCEPTS) break;
    const chunks = cache[id];
    if (!out.includes(id) && chunks && feedSection(chunks, progress[id])) out.push(id);
  }
  return out;
}

/** The next card: the first of the round's concepts, in order, with a card left.
 *  The round rotates an answered concept to the back, so cards change subject.
 *  Null when none has one. */
export function nextFeedCard(
  concepts: readonly string[],
  cache: Record<string, ConsumeChunk[] | undefined>,
  progress: Record<string, ConsumeProgress | undefined>,
): { nodeId: string; chunk: ConsumeChunk } | null {
  for (const nodeId of concepts) {
    const chunks = cache[nodeId];
    const chunk = chunks && feedSection(chunks, progress[nodeId]);
    if (chunk) return { nodeId, chunk };
  }
  return null;
}
