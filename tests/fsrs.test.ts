import { describe, expect, it } from "vitest";
import {
  dueCards,
  forecastRows,
  gradeStoredCard,
  intervalLabels,
  newStoredCard,
  retainContentFromStore,
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
  });
});
