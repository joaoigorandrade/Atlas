import { describe, expect, it } from "vitest";
import {
  afterPretest,
  CONFIDENCE_FELT,
  emptyConsumeProgress,
  FEED_CONCEPTS,
  feedConcepts,
  feedSection,
  INK_STAKES,
  inkBalance,
  inkDelta,
  nextFeedCard,
  type ConsumeChunk,
  type ConsumeProgress,
} from "@/lib/curriculum";

const check = {
  q: "?",
  opts: [
    { label: "a", correct: true },
    { label: "b", correct: false },
    { label: "c", correct: false },
  ],
  right: "r",
  wrong: "w",
};
const chunk = (id: string, withCheck = true) =>
  ({ id, ...(withCheck ? { check } : {}) }) as unknown as ConsumeChunk;
const pass = [chunk("c1"), chunk("c2"), chunk("c3")];

// The bet pays for knowing what you know: each tap is the best one exactly in
// its own band of chances, so the honest answer is also the winning one.
describe("ink stakes", () => {
  const ev = (stake: number, p: number) =>
    p * inkDelta(stake, true) + (1 - p) * inkDelta(stake, false);
  const best = (p: number) => [0, 1, 2].reduce((a, b) => (ev(b, p) > ev(a, p) ? b : a));

  it("the felt-% of each tap is a chance where that tap is the best bet", () => {
    CONFIDENCE_FELT.forEach((felt, stake) => expect(best(felt / 100)).toBe(stake));
  });

  it("not sure risks nothing; very sure risks the most", () => {
    expect(inkDelta(0, false)).toBe(0);
    expect(inkDelta(2, false)).toBe(-INK_STAKES[2].lose);
    expect(inkDelta(2, true)).toBe(INK_STAKES[2].win);
  });
});

describe("inkBalance", () => {
  it("sums every bet over every reading, and ignores guesses with none", () => {
    let a = afterPretest(emptyConsumeProgress(), "c1", 0, true, 2); // +3
    a = afterPretest(a, "c2", 1, false, 1); // −1
    const b = afterPretest(emptyConsumeProgress(), "c1", 1, false); // no bet
    expect(inkBalance({ a, b })).toBe(2);
  });

  it("reads rows saved before bets existed", () => {
    const old = { pretest: { c1: true } } as unknown as ConsumeProgress;
    expect(inkBalance({ old, gone: undefined })).toBe(0);
  });

  it("goes below zero on confident misses", () => {
    const p = afterPretest(emptyConsumeProgress(), "c1", 1, false, 2);
    expect(inkBalance({ p })).toBe(-3);
  });
});

describe("feedSection", () => {
  it("asks the first section not yet guessed", () => {
    expect(feedSection(pass, undefined)?.id).toBe("c1");
    const known = afterPretest(emptyConsumeProgress(), "c1", 0, true);
    expect(feedSection(pass, known)?.id).toBe("c2");
  });

  it("stops at an open miss — what follows it belongs to the reading", () => {
    const missed = afterPretest(emptyConsumeProgress(), "c1", 1, false);
    expect(feedSection(pass, missed)).toBeNull();
    // …until the reading's own check at the end of that section is passed.
    const read = { ...missed, checks: { c1: { oi: 0, correct: true } } };
    expect(feedSection(pass, read)?.id).toBe("c2");
  });

  it("skips a section with no check, and deals nothing from a finished reading", () => {
    expect(feedSection([chunk("c1", false), chunk("c2")], undefined)?.id).toBe("c2");
    expect(feedSection(pass, { ...emptyConsumeProgress(), finished: true })).toBeNull();
  });
});

describe("the round", () => {
  const cache = { a: pass, b: pass, c: pass, d: pass, e: undefined };

  it("deals from the first few concepts in order that have a written reading", () => {
    const dealt = feedConcepts(["e", "a", "b", "c", "d"], cache, {});
    expect(dealt).toEqual(["a", "b", "c", "d"].slice(0, FEED_CONCEPTS));
  });

  it("skips a concept whose next card is behind a miss", () => {
    const blocked = afterPretest(emptyConsumeProgress(), "c1", 1, false);
    expect(feedConcepts(["a", "b"], cache, { a: blocked })).toEqual(["b"]);
  });

  it("the next card is the first concept in the round's order with one left", () => {
    const blocked = afterPretest(emptyConsumeProgress(), "c1", 1, false);
    expect(nextFeedCard(["a", "b"], cache, { a: blocked })).toEqual({
      nodeId: "b",
      chunk: pass[0],
    });
    expect(nextFeedCard(["a"], cache, { a: blocked })).toBeNull();
  });
});
