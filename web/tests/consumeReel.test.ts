// Consume as reels: the deck is a view of `ConsumeProgress`, so every gate the
// page view has — pretest first, a check before the way on, a folded section
// as its takeaway — has to hold in the feed too.
import { describe, expect, it } from "vitest";
import {
  consumeReel,
  emptyConsumeProgress,
  reelBeats,
  reelSections,
  reelSpoken,
  type ConsumeChunk,
  type ConsumeProgress,
} from "@/lib/curriculum";

const chunk = (n: number, over: Partial<ConsumeChunk> = {}): ConsumeChunk => ({
  id: `c${n}`,
  kicker: `${n} · Part`,
  terms: [],
  body: ["First beat.", "Second beat."],
  example: { title: "Worked", steps: ["**Set up:** a", "**Solve:** b"] },
  takeaway: `Takeaway ${n}.`,
  ask: "Why?",
  check: {
    q: "Q?",
    opts: [
      { label: "a", correct: false },
      { label: "b", correct: true },
      { label: "c", correct: false },
    ],
    right: "Yes.",
    wrong: "No.",
  },
  ...over,
});
const progress = (over: Partial<ConsumeProgress> = {}): ConsumeProgress => ({
  ...emptyConsumeProgress(),
  ...over,
});
const kinds = (cards: { kind: string }[]) => cards.map((c) => c.kind);

describe("reelBeats", () => {
  it("keeps a paragraph that fits on one card whole", () => {
    expect(reelBeats("  One short idea.  ")).toEqual(["One short idea."]);
    expect(reelBeats("   ")).toEqual([]);
  });
  it("packs a long paragraph into cards at sentence ends, never mid-sentence", () => {
    const s = (n: number) => `Word ${"word ".repeat(8)}end${n}.`; // 10 words
    const para = [1, 2, 3, 4, 5].map(s).join(" ");
    const beats = reelBeats(para, 25);
    expect(beats).toHaveLength(3);
    expect(beats[0]).toBe(`${s(1)} ${s(2)}`);
    expect(beats.join(" ")).toBe(para);
  });
  it("does not split on an abbreviation or a decimal", () => {
    const para = `${"x ".repeat(30)}e.g. this and 1.5 more. Next one starts here.`;
    const beats = reelBeats(para, 20);
    expect(beats[0]).toMatch(/e\.g\. this and 1\.5 more\.$/);
    expect(beats[1]).toBe("Next one starts here.");
  });
});

describe("consumeReel", () => {
  it("opens a section on its pretest, and deals nothing past it", () => {
    const deck = consumeReel([chunk(1), chunk(2)], progress(), { streaming: false });
    expect(kinds(deck)).toEqual(["pretest"]);
  });

  it("reads a missed pretest's section in full, then stops at its check", () => {
    const deck = consumeReel([chunk(1)], progress({ pretest: { c1: false } }), {
      streaming: false,
    });
    expect(kinds(deck)).toEqual(["beat", "beat", "example", "check"]);
    expect(deck[0]).toMatchObject({ first: true });
    expect(deck.at(-1)?.next).toBeUndefined();
  });

  it("puts the way on, on the takeaway, once the check is answered", () => {
    const answered = progress({
      pretest: { c1: false },
      checks: { c1: { oi: 1, correct: true } },
    });
    const deck = consumeReel([chunk(1), chunk(2)], answered, { streaming: false });
    expect(kinds(deck)).toEqual(["beat", "beat", "example", "check", "takeaway"]);
    expect(deck.at(-1)?.next).toBe("continue");
    // The last section, the stream done: finish.
    const last = consumeReel([chunk(1)], answered, { streaming: false });
    expect(last.at(-1)?.next).toBe("finish");
    // Caught up to the writer.
    const writing = consumeReel([chunk(1)], answered, { streaming: true });
    expect(writing.at(-1)?.next).toBe("writing");
  });

  it("folds a known section to its takeaway, with the way on", () => {
    const known = progress({
      pretest: { c1: true },
      checks: { c1: { oi: 1, correct: true } },
      collapsed: { c1: true },
    });
    const deck = consumeReel([chunk(1), chunk(2)], known, { streaming: false });
    expect(deck).toHaveLength(1);
    expect(deck[0]).toMatchObject({
      kind: "takeaway",
      collapsed: true,
      next: "continue",
    });
  });

  it("keeps a section folded by hand behind its check", () => {
    const skipped = progress({ collapsed: { c1: true }, pretest: { c1: false } });
    expect(kinds(consumeReel([chunk(1)], skipped, { streaming: false }))).toEqual([
      "takeaway",
      "check",
    ]);
    const answered = { ...skipped, checks: { c1: { oi: 0, correct: false } } };
    const deck = consumeReel([chunk(1)], answered, { streaming: false });
    expect(kinds(deck)).toEqual(["takeaway", "check"]);
    expect(deck[1].next).toBe("finish");
  });

  it("deals only the sections revealed so far, in order", () => {
    const two = progress({
      idx: 1,
      pretest: { c1: true, c2: false },
      checks: { c1: { oi: 1, correct: true } },
      collapsed: { c1: true },
    });
    const deck = consumeReel([chunk(1), chunk(2), chunk(3)], two, { streaming: false });
    expect(deck.map((c) => c.section)).toEqual([0, 1, 1, 1, 1]);
    expect(deck[0].next).toBeUndefined();
    const sections = reelSections(deck);
    expect(sections.get(1)).toEqual({ start: 1, count: 4 });
  });

  it("never pretests a section read before its check landed, and shows a draft as it is written", () => {
    const bare = consumeReel([chunk(1)], progress(), {
      streaming: true,
      readBare: new Set(["c1"]),
    });
    expect(kinds(bare)[0]).toBe("beat");
    // As `draftConsumeSection` sends it: prose so far, no takeaway, no check.
    const draft = {
      ...chunk(1),
      takeaway: "",
      body: ["Being written"],
      check: undefined,
    };
    expect(kinds(consumeReel([draft], progress(), { streaming: true }))).toEqual([
      "beat",
      "writing",
    ]);
    expect(kinds(consumeReel([], progress(), { streaming: true }))).toEqual(["writing"]);
  });

  it("deals a figure when the section has one, and old sections with no check go straight on", () => {
    const figured = chunk(1, {
      figure: {
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      check: undefined,
    });
    const deck = consumeReel([figured], progress(), { streaming: false });
    expect(kinds(deck)).toEqual(["beat", "beat", "example", "figure", "takeaway"]);
    expect(deck.at(-1)?.next).toBe("finish");
  });

  it("reads aloud the prose cards only", () => {
    const deck = consumeReel(
      [chunk(1)],
      progress({ pretest: { c1: false }, checks: { c1: { oi: 1, correct: true } } }),
      { streaming: false },
    );
    expect(deck.map(reelSpoken)).toEqual([
      ["First beat."],
      ["Second beat."],
      ["Worked", "**Set up:** a", "**Solve:** b"],
      null,
      ["Takeaway 1."],
    ]);
  });
});
