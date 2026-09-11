import { describe, expect, it } from "vitest";
import {
  CARD_MINUTES,
  retainBudget,
  retainDeck,
  retainReducer,
  retainStart,
  reviewCard,
  type RetainAction,
  type RetainContent,
  type RetainSession,
  type ReviewCard,
} from "@/lib/curriculum";
import {
  dueCards,
  forecastRows,
  gradeStoredCard,
  intervalLabels,
  newStoredCard,
  retainContentFromStore,
  withSchedule,
} from "@/lib/fsrs";

const now = new Date("2026-07-20T12:00:00Z");

function card(id: string) {
  return newStoredCard(
    {
      id,
      nodeId: "n1",
      type: "why",
      source: "Connect",
      front: "front?",
      back: "back.",
    },
    now,
  );
}

describe("FSRS store (#21)", () => {
  it("a new card is due immediately", () => {
    expect(dueCards([card("a")], now).length).toBe(1);
  });

  it("'good' schedules the card into the future — it leaves today's queue", () => {
    const graded = gradeStoredCard(card("a"), "good", now);
    expect(Date.parse(graded.fsrs.due)).toBeGreaterThan(now.getTime());
    expect(dueCards([graded], now).length).toBe(0);
  });

  it("'again' reschedules within minutes — it stays in today's orbit", () => {
    const graded = gradeStoredCard(card("a"), "again", now);
    const dueInMs = Date.parse(graded.fsrs.due) - now.getTime();
    expect(dueInMs).toBeLessThan(30 * 60_000);
    expect(graded.fsrs.lapses + graded.fsrs.reps).toBeGreaterThan(0);
  });

  it("repeated 'good' grades grow the interval (real spacing)", () => {
    let c = gradeStoredCard(card("a"), "good", now);
    const first = Date.parse(c.fsrs.due) - now.getTime();
    const later = new Date(Date.parse(c.fsrs.due) + 1000);
    c = gradeStoredCard(c, "good", later);
    const second = Date.parse(c.fsrs.due) - later.getTime();
    expect(second).toBeGreaterThan(first);
  });

  it("interval labels differ per grade and come from the scheduler", () => {
    const labels = intervalLabels(card("a"), now);
    expect(labels.again).not.toBe(labels.easy);
  });

  it("forecast counts match the card table exactly", () => {
    const dueCard = card("a");
    const scheduled = gradeStoredCard(card("b"), "good", now);
    const rows = forecastRows([dueCard, scheduled], now);
    expect(rows[0].count).toBe("1 card");
    const weekCount = Number(rows[1].count.split(" ")[0]);
    const solidCount = Number(rows[2].count.split(" ")[0]);
    expect(weekCount + solidCount).toBe(1);
  });

  it("the queue is budgeted to the daily minutes", () => {
    const many = Array.from({ length: 20 }, (_, i) => card(`c${i}`));
    const content = retainContentFromStore(many, 6, now);
    expect(content.cards.length).toBe(4); // floor(6 / 1.5)
    expect(content.budgetMin).toBe(6);
    // The budget cut 16 due cards off the deck, and an empty deck alone can't
    // say so — "Fila limpa" was told over a queue with 16 cards still in it.
    expect(content.remaining).toBe(16);
  });

  it("a queue that really is clear reports nothing left over", () => {
    const scheduled = gradeStoredCard(card("b"), "good", now);
    expect(retainContentFromStore([scheduled], 60, now).remaining).toBe(0);
  });
});

describe("withSchedule — a card minted by a client that has no scheduler", () => {
  const bare = {
    id: "agencia-connect-incentivos",
    nodeId: "agencia",
    type: "why" as const,
    source: "Connect",
    front: "Agência ↔ Incentivos: qual é a conexão?",
    back: "Sem agência o incentivo não tem em quem agir.",
  };

  it("gets scheduler state, and is due now", () => {
    const [filled] = withSchedule([bare], now);
    expect(filled.fsrs.due).toBeTruthy();
    expect(dueCards([filled], now).length).toBe(1);
    expect(filled.back).toBe(bare.back);
  });

  it("leaves a graded card's own state alone", () => {
    const graded = gradeStoredCard(card("a"), "good", now);
    expect(withSchedule([graded], now)[0].fsrs.due).toBe(graded.fsrs.due);
  });
});

// ---- the pass over today's deck ------------------------------------------

describe("retain: a miss comes back once", () => {
  const deckCard = (id: string): ReviewCard => ({
    id,
    type: "recall",
    source: "Consume",
    node: "n1",
    front: `Q ${id}`,
    back: `A ${id}`,
    fails: true,
  });
  const content: RetainContent = {
    budgetMin: 6,
    cards: [deckCard("a"), deckCard("b")],
  };
  const step = (s: RetainSession, a: RetainAction) => retainReducer(s, a, content);

  it("sends the missed card to the back of the deck, and only once", () => {
    let s = retainStart();
    expect(retainDeck(s, content).length).toBe(2);

    s = step(step(s, { type: "flip" }), { type: "grade", grade: "again" });
    expect(s.stage).toBe("failed");
    // Three slots now: a, b, and a's second trip.
    expect(retainDeck(s, content).length).toBe(3);
    expect(reviewCard(s, content).id).toBe("a");

    s = step(s, { type: "continue" });
    expect(reviewCard(s, content).id).toBe("b");
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "good" });
    expect(reviewCard(s, content).id).toBe("a");

    // Missing it a second time does not grow the deck again — a card nobody
    // can answer would be a pass with no end.
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "again" });
    expect(retainDeck(s, content).length).toBe(3);
    s = step(s, { type: "continue" });
    expect(s.finished).toBe(true);
  });

  it("grades by deck position, so the second trip does not repaint the first", () => {
    let s = retainStart();
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "again" });
    s = step(s, { type: "continue" });
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "good" });
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "good" });
    // Slot 0 keeps the miss it earned; slot 2 is the same card, answered.
    expect(s.done[0]).toBe("again");
    expect(s.done[2]).toBe("good");
  });

  it("budgets the requeued card as real work", () => {
    let s = retainStart();
    s = step(step(s, { type: "flip" }), { type: "grade", grade: "again" });
    // Three cards at 1.5 min each — the minutes owed grew with the deck.
    expect(retainBudget(s, content).total).toBe(3);
    expect(retainBudget(s, content).spent).toBe(Math.round(CARD_MINUTES));
  });
});
