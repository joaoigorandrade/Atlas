// The review queue's rules beyond the scheduler itself: fuzz that stays
// honest on the buttons, leeches, the review log, Anki's queue order and its
// daily new-card cap, which nodes still need a factory card, and the pass
// actions that are not grades (skip, deal, undo).

import { describe, expect, it } from "vitest";
import {
  isFactoryCard,
  retainDeck,
  retainReducer,
  retainRewind,
  retainStart,
  uncoveredNodes,
  type RetainContent,
  type ReviewCard,
} from "@/lib/curriculum";
import {
  dueCards,
  gradeStoredCard,
  intervalLabels,
  fmtInterval,
  LEECH_LAPSES,
  newStoredCard,
  reviewStoredCard,
  toReviewCard,
  type StoredCard,
} from "@/lib/fsrs";
import {
  dealableCount,
  hasReviewWork,
  introducedToday,
  NEW_PER_DAY,
  todaysQueue,
} from "@/lib/fsrsQueue";
import { seedDrafted } from "@/components/atlas/retainDraft";
import { cardProblem } from "@/lib/server/cardShape";

const now = new Date("2026-07-20T12:00:00Z");
const DAY = 86_400_000;

const fresh = (id: string, nodeId = "n1", source = "Consume", at = now): StoredCard =>
  newStoredCard({ id, nodeId, type: "why", source, front: "q?", back: "a." }, at);

/** A graduated card, `days` past due, that has lapsed `lapses` times. */
const reviewCard = (id: string, days = 1, lapses = 0): StoredCard => ({
  ...fresh(id),
  fsrs: {
    due: new Date(now.getTime() - days * DAY).toISOString(),
    last_review: new Date(now.getTime() - (days + 10) * DAY).toISOString(),
    stability: 10,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 10,
    learning_steps: 0,
    reps: 12,
    lapses,
    state: 2,
  },
});

describe("fuzz", () => {
  it("prints on each button the interval that grade really schedules", () => {
    const c = reviewCard("fz", 2);
    const labels = intervalLabels(c, now);
    for (const g of ["hard", "good", "easy"] as const) {
      const next = gradeStoredCard(c, g, now);
      expect(labels[g]).toBe(fmtInterval(Date.parse(next.fsrs.due) - now.getTime()));
    }
  });

  it("spreads cards graded alike instead of keeping them due together", () => {
    const dues = new Set(
      ["a", "b", "c", "d", "e", "f"].map(
        (id) => gradeStoredCard(reviewCard(id, 0), "good", now).fsrs.due,
      ),
    );
    expect(dues.size).toBeGreaterThan(1);
  });

  it("keeps the seed's id out of storage", () => {
    expect(gradeStoredCard(fresh("x"), "good", now).fsrs).not.toHaveProperty("cid");
  });
});

describe("the review log and leeches", () => {
  it("logs the state before, for the optimizer and for an exact undo", () => {
    const c = fresh("c1");
    const { card, review, leech } = reviewStoredCard(c, "good", now, 3000);
    expect(leech).toBe(false);
    expect(review).toMatchObject({
      cardId: "c1",
      rating: "good",
      durationMs: 3000,
      reps: 1,
    });
    expect(review.before).toEqual({ fsrs: c.fsrs, suspended: false });
    expect(card.fsrs.introduced).toBe(now.toISOString());
  });

  it("dates a card's introduction once, at its first review", () => {
    const first = gradeStoredCard(fresh("c1"), "good", now);
    const later = new Date(now.getTime() + 2 * DAY);
    expect(gradeStoredCard(first, "good", later).fsrs.introduced).toBe(now.toISOString());
  });

  it("suspends a card the moment it lapses into a leech", () => {
    const { card, leech } = reviewStoredCard(
      reviewCard("l", 1, LEECH_LAPSES - 1),
      "again",
      now,
    );
    expect(leech).toBe(true);
    expect(card.suspended).toBe(true);
    expect(dueCards([card], new Date(now.getTime() + 365 * DAY))).toEqual([]);
  });

  it("does not call a forgotten-once card a leech", () => {
    expect(reviewStoredCard(reviewCard("l", 1, 0), "again", now).leech).toBe(false);
  });
});

describe("today's queue", () => {
  const learning = () => ({
    ...gradeStoredCard(
      fresh("learn", "n1", "Consume", new Date(now.getTime() - DAY)),
      "again",
      new Date(now.getTime() - DAY),
    ),
  });

  it("deals learning, then reviews most overdue first, then new", () => {
    const cards = [
      fresh("new1"),
      reviewCard("r-late", 1),
      reviewCard("r-later", 5),
      learning(),
    ];
    const { deck } = todaysQueue(cards, 60, now);
    expect(deck.map((c) => c.id)).toEqual(["learn", "r-later", "r-late", "new1"]);
  });

  it("brings in at most NEW_PER_DAY new cards, and says the rest are waiting", () => {
    const cards = Array.from({ length: NEW_PER_DAY + 3 }, (_, i) => fresh(`n${i}`));
    const { deck, remaining } = todaysQueue(cards, 600, now);
    expect(deck).toHaveLength(NEW_PER_DAY);
    expect(remaining).toBe(3);
    expect(dealableCount(cards, now)).toBe(NEW_PER_DAY);
  });

  it("counts the day's allowance against cards already introduced", () => {
    const seen = Array.from({ length: NEW_PER_DAY }, (_, i) =>
      gradeStoredCard(fresh(`s${i}`), "easy", new Date(now.getTime() - 3_600_000)),
    );
    const cards = [...seen, fresh("waiting")];
    expect(introducedToday(cards, now)).toBe(NEW_PER_DAY);
    expect(hasReviewWork(cards, now)).toBe(false);
    // A rolling day: tomorrow the allowance is back.
    expect(hasReviewWork(cards, new Date(now.getTime() + DAY))).toBe(true);
  });

  it("never deals a suspended card", () => {
    expect(todaysQueue([{ ...fresh("s"), suspended: true }], 60, now).deck).toEqual([]);
  });
});

describe("which nodes still need a factory card", () => {
  const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const cards = [
    fresh("1", "a", "Connect"), // a link, not the node itself
    fresh("2", "b", "Drill"),
    fresh("3", "c", "Consume"),
    fresh("4", "d", "Socratic"), // an older factory card, attributed by the model
  ];

  it("counts only the factory's own cards as covering a node", () => {
    expect(uncoveredNodes(nodes, cards).map((n) => n.id)).toEqual(["a", "b"]);
    expect(isFactoryCard({ source: "Connect" })).toBe(false);
  });

  it("files a draft for a Connect-only node, and skips a covered one", () => {
    const content: RetainContent = {
      budgetMin: 6,
      cards: [
        {
          id: "r1",
          type: "recall",
          source: "Consume",
          node: "a",
          cloze: ["x", "y"],
          answer: "z",
          back: "z",
        },
        { id: "r2", type: "why", source: "Consume", node: "c", front: "?", back: "!" },
      ],
    };
    const seeded = seedDrafted(content, cards, now);
    expect(seeded.map((c) => c.nodeId)).toEqual(["a"]);
    expect(seeded[0].fsrs.reps).toBe(0);
  });
});

describe("the pass, beyond grades", () => {
  const rc = (id: string): ReviewCard => toReviewCard(fresh(id), now);
  const content: RetainContent = { budgetMin: 6, cards: [rc("a"), rc("b")] };

  it("skips a card without grading it, leaving other cards' copies alone", () => {
    let s = retainStart();
    s = retainReducer(s, { type: "flip" }, content);
    s = retainReducer(s, { type: "grade", grade: "again", returns: rc("a") }, content);
    s = retainReducer(s, { type: "continue" }, content); // on b
    s = retainReducer(s, { type: "deal", cards: [rc("c")] }, content);
    expect(retainDeck(s, content).map((c) => c.id)).toEqual(["a", "b", "a", "c"]);
    s = retainReducer({ ...s, idx: 1 }, { type: "skip" }, content);
    expect(s.idx).toBe(2);
    expect(s.done[1]).toBeUndefined();
    // b skipped; a's copy stays (it is not b), then c.
    expect(retainDeck(s, content).map((c) => c.id)).toEqual(["a", "b", "a", "c"]);
    const onA = retainReducer(s, { type: "skip" }, content);
    expect(retainDeck(onA, content).map((c) => c.id)).toEqual(["a", "b", "a", "c"]);
  });

  it("drops a skipped card's copies still ahead of it", () => {
    let s = retainStart();
    s = retainReducer(s, { type: "flip" }, content);
    s = retainReducer(s, { type: "grade", grade: "again", returns: rc("a") }, content);
    // Back on a's first trip (as an undo would leave it), then suspend it.
    s = retainReducer({ ...s, stage: "question" }, { type: "skip" }, content);
    expect(retainDeck(s, content).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("ignores cards dealt into a finished pass", () => {
    const done = { ...retainStart(), finished: true };
    expect(retainReducer(done, { type: "deal", cards: [rc("c")] }, content)).toBe(done);
  });

  it("rewinds to the question, keeping what was dealt since", () => {
    const before = retainReducer(retainStart(), { type: "flip", sure: 1 }, content);
    const after = retainReducer(before, { type: "grade", grade: "good" }, content);
    const back = retainRewind(before, [rc("c")]);
    expect(after.idx).toBe(1);
    expect(back.idx).toBe(0);
    expect(back.stage).toBe("question");
    expect(back.sure).toBeUndefined();
    expect(retainDeck(back, content).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("card writes, checked at the door", () => {
  const ok = {
    id: "c",
    nodeId: "n",
    type: "why",
    source: "Connect",
    front: "?",
    back: "!",
  };

  it("takes a well-formed card, with or without scheduler state", () => {
    expect(cardProblem(ok)).toBeNull();
    expect(cardProblem(fresh("c"))).toBeNull();
    expect(
      cardProblem({ ...ok, front: undefined, cloze: ["a", "b"], answer: "x" }),
    ).toBeNull();
  });

  it("refuses what a screen could not deal", () => {
    expect(cardProblem({ ...ok, type: "essay" })).toBe("card_type");
    expect(cardProblem({ ...ok, back: "" })).toBe("card_back");
    expect(cardProblem({ ...ok, front: "x".repeat(5000) })).toBe("card_text");
    expect(cardProblem({ ...ok, front: undefined })).toBe("card_front");
    expect(cardProblem({ ...ok, cloze: ["one"] })).toBe("card_cloze");
    expect(cardProblem({ ...ok, fsrs: { due: "never" } })).toBe("card_fsrs");
    expect(cardProblem(null)).toBe("card_shape");
  });
});
