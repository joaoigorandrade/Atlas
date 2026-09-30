import { describe, expect, it } from "vitest";
import { dailyPlan } from "@/lib/dailyPlan";
import { gradeStoredCard, newStoredCard, type StoredCard } from "@/lib/fsrs";
import type { ConceptGraph, PhaseId, StateMap } from "@/lib/curriculum";

// W4.6 — one plan for the day across every map.
const now = new Date("2026-10-10T12:00:00Z");
const day = 86_400_000;

const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 1, week: 0, x: 0, y: 0 },
    { id: "b", label: "B", state: "unknown", g: 2, week: 0, x: 1, y: 0 },
  ],
  edges: [["a", "b"]],
};

const dueCard = (id: string): StoredCard =>
  newStoredCard(
    { id, nodeId: "a", type: "recall", source: "t", front: "f", back: "b" },
    new Date(now.getTime() - day),
  );

const topic = (
  subject: string,
  over: Partial<{
    examDate: string;
    states: StateMap;
    phasesDone: Record<string, PhaseId[]>;
    phaseProgress: Record<string, Record<string, unknown>>;
    cards: StoredCard[];
  }> = {},
) => ({
  subject,
  goal: "mastery",
  examDate: "",
  graph,
  states: {} as StateMap,
  phasesDone: {},
  phaseProgress: {},
  cards: [] as StoredCard[],
  ...over,
});

describe("dailyPlan", () => {
  it("puts the map with a near date and due cards first, then the next open rung", () => {
    const hobby = topic("Hobby", { cards: [dueCard("h1")] });
    const trip = topic("Trip", {
      examDate: "2026-10-14",
      cards: [dueCard("t1"), dueCard("t2")],
    });
    const plan = dailyPlan([hobby, trip], 60, now);
    expect(plan.map((i) => i.subject)).toEqual(["Trip", "Hobby"]);
    expect(plan[0]).toMatchObject({ due: 2, daysLeft: 4 });
    // Nothing started: the goal's frontier opens on the reading.
    expect(plan[0].next).toEqual({ label: "A", phase: "consume" });
  });

  it("skips a gate held until tomorrow, and a map with nothing to do today", () => {
    const held = topic("Held", {
      states: { a: "learning" },
      phasesDone: { a: ["consume"] },
      phaseProgress: { a: { discriminate: { opensAt: now.getTime() + day } } },
    });
    const reviewed = gradeStoredCard(dueCard("r"), "good", now);
    const idle = topic("Idle", {
      states: { a: "mastered", b: "mastered" },
      phasesDone: {
        a: [
          "consume",
          "discriminate",
          "socratic",
          "feynman",
          "connect",
          "crucible",
          "recall",
        ],
        b: [
          "consume",
          "discriminate",
          "socratic",
          "feynman",
          "connect",
          "crucible",
          "recall",
        ],
      },
      cards: [reviewed],
    });
    // Held's only open rung waits until tomorrow and nothing is due; Idle is
    // mastered with its card reviewed today. Neither is today's work.
    expect(dailyPlan([held, idle], 60, now)).toEqual([]);
    // A day later the gate has opened.
    const tomorrow = new Date(now.getTime() + 2 * day);
    expect(dailyPlan([held], 60, tomorrow)[0].next).toEqual({
      label: "A",
      phase: "discriminate",
    });
  });

  it("stops at the day's minutes, but always offers one map", () => {
    const many = ["A", "B", "C"].map((s) => topic(s, { cards: [dueCard(s)] }));
    expect(dailyPlan(many, 1, now)).toHaveLength(1);
    expect(dailyPlan(many, 200, now)).toHaveLength(3);
  });
});
