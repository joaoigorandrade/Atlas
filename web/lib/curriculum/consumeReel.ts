// ---- Consume as reels -------------------------------------------------------
// The reading pass as a vertical feed of full-screen cards, one idea each, the
// way a phone already reads short video: a section is a run of cards —
// pretest, the beats of its prose, the worked example, the figure, the check,
// the takeaway — swiped through, never scrolled past as a wall.
//
// This is the deck alone: which cards exist, in which order, for a pass and
// the learner's progress through it. It decides nothing the reducer doesn't
// already: a pretest still comes first and is answered once, a section's
// check still gates the way on, and a collapsed section is still its
// takeaway. The feed is a view of `ConsumeProgress`, not a second state.

import { needsPretest, type ConsumeChunk, type ConsumeProgress } from "./consume";

/** Most words a beat card carries before a long paragraph is split at a
 *  sentence. About 15-20 seconds of reading: a card, not a page. Passes
 *  written before the reels were drafted in longer paragraphs. */
export const REEL_BEAT_WORDS = 60;

/** What the last card of the deepest section offers next. */
export type ReelNext = "continue" | "finish" | "writing";

interface CardBase {
  /** Stable across re-renders and stream redraws — a React key and the
   *  identity of "the card being read aloud". */
  key: string;
  /** Index of the section the card belongs to. */
  section: number;
  /** Set on the last card of the deepest section once nothing gates it. */
  next?: ReelNext;
}

export type ReelCard =
  | (CardBase & { kind: "writing" })
  | (CardBase & { kind: "pretest"; chunk: ConsumeChunk })
  | (CardBase & {
      kind: "beat";
      chunk: ConsumeChunk;
      text: string;
      /** The section's first beat — it carries the terms and the pretest note. */
      first: boolean;
    })
  | (CardBase & { kind: "example"; chunk: ConsumeChunk })
  | (CardBase & { kind: "figure"; chunk: ConsumeChunk })
  | (CardBase & { kind: "check"; chunk: ConsumeChunk })
  | (CardBase & {
      kind: "takeaway";
      chunk: ConsumeChunk;
      /** Folded to its takeaway — by a right pretest or by the learner. */
      collapsed: boolean;
    });

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * One paragraph as the beats it is read in: whole when it fits a card, else
 * packed sentence by sentence into cards of at most `max` words. A sentence is
 * never cut, so a single sentence longer than `max` is one card on its own.
 * The split is at a sentence end followed by a capital, a quote, a bracket or
 * a bold mark, which leaves "e.g. this" and "1.5" alone.
 */
export function reelBeats(paragraph: string, max = REEL_BEAT_WORDS): string[] {
  const text = paragraph.trim();
  if (!text) return [];
  if (wordCount(text) <= max) return [text];
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÝÇ"“'‘(*\d])/);
  const beats: string[] = [];
  let current = "";
  for (const s of sentences) {
    const joined = current ? `${current} ${s}` : s;
    if (current && wordCount(joined) > max) {
      beats.push(current);
      current = s;
    } else current = joined;
  }
  if (current) beats.push(current);
  return beats;
}

/**
 * The feed for a pass, given where the learner is in it.
 *
 * Only sections up to the deepest revealed one (`progress.idx`) are dealt, as
 * the page view only draws those. The deck stops at the first thing that
 * waits on the learner — an unanswered pretest, an unanswered check, a section
 * still being written — so nothing past a gate exists to be swiped to.
 *
 * `readBare` holds the sections whose prose was on screen before their check
 * landed (the stream sends a section first and its blind-solved check after):
 * those are never pretested, exactly as in the page view.
 */
export function consumeReel(
  chunks: readonly ConsumeChunk[],
  progress: ConsumeProgress,
  opts: { streaming: boolean; readBare?: ReadonlySet<string> },
): ReelCard[] {
  if (!chunks.length) return [{ kind: "writing", key: "writing:first", section: 0 }];
  const cards: ReelCard[] = [];
  const visible = chunks.slice(0, progress.idx + 1);
  for (const [i, c] of visible.entries()) {
    const base = { section: i };
    const deepest = i === visible.length - 1;
    const sectionStart = cards.length;

    if (needsPretest(progress, c) && !opts.readBare?.has(c.id)) {
      cards.push({ ...base, kind: "pretest", key: `${c.id}:pretest`, chunk: c });
      return cards;
    }

    if (progress.collapsed[c.id]) {
      cards.push({
        ...base,
        kind: "takeaway",
        key: `${c.id}:takeaway`,
        chunk: c,
        collapsed: true,
      });
      // Folded by the learner rather than by a right pretest: the check is
      // still owed, and answered it stays, so its verdict is not yanked away.
      if (c.check && !progress.pretest?.[c.id]) {
        cards.push({ ...base, kind: "check", key: `${c.id}:check`, chunk: c });
        if (!progress.checks[c.id]) return cards;
      }
    } else {
      let n = 0;
      for (const para of c.body)
        for (const text of reelBeats(para))
          cards.push({
            ...base,
            kind: "beat",
            key: `${c.id}:b${n}`,
            chunk: c,
            text,
            first: n++ === 0,
          });
      // A draft — the section the writer is still on — has prose and nothing
      // else yet; whatever follows it is still to come.
      if (!c.takeaway) {
        cards.push({ ...base, kind: "writing", key: `${c.id}:writing` });
        return cards;
      }
      if (c.example?.steps?.length)
        cards.push({ ...base, kind: "example", key: `${c.id}:example`, chunk: c });
      if (c.figure)
        cards.push({ ...base, kind: "figure", key: `${c.id}:figure`, chunk: c });
      if (c.check) {
        cards.push({ ...base, kind: "check", key: `${c.id}:check`, chunk: c });
        if (!progress.checks[c.id]) return cards;
      }
      cards.push({
        ...base,
        kind: "takeaway",
        key: `${c.id}:takeaway`,
        chunk: c,
        collapsed: false,
      });
    }

    if (deepest && cards.length > sectionStart) {
      cards[cards.length - 1] = {
        ...cards[cards.length - 1],
        next:
          i === chunks.length - 1 && !opts.streaming
            ? "finish"
            : i + 1 < chunks.length
              ? "continue"
              : "writing",
      };
    }
  }
  return cards;
}

/** Where each section's cards start and how many it has — the story bar. */
export function reelSections(
  cards: readonly ReelCard[],
): Map<number, { start: number; count: number }> {
  const out = new Map<number, { start: number; count: number }>();
  cards.forEach((card, i) => {
    const at = out.get(card.section);
    if (at) at.count++;
    else out.set(card.section, { start: i, count: 1 });
  });
  return out;
}

/** What a card says when it is read aloud, or nothing for one with no prose. */
export function reelSpoken(card: ReelCard): string[] | null {
  switch (card.kind) {
    case "beat":
      return [card.text];
    case "example":
      return [card.chunk.example.title, ...card.chunk.example.steps].filter(Boolean);
    case "takeaway":
      return card.chunk.takeaway ? [card.chunk.takeaway] : null;
    default:
      return null;
  }
}
