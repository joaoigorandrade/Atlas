import { describe, expect, it } from "vitest";
import {
  EXPLAIN_CARDS,
  explainPassed,
  explainReducer,
  explainScore,
  explainStart,
  type ExplainContent,
} from "@/lib/curriculum";
import { validateExplain } from "@/lib/server/generate";
import { explainContent } from "@/lib/server/fixturesPhases";

const content: ExplainContent = explainContent({ nodeId: "n", nodeLabel: "Node" });
const right = content.listener.replies.findIndex((r) => r.correct);
const wrong = content.listener.replies.findIndex((r) => !r.correct);

const revealAll = () => {
  let s = explainStart("n");
  for (let i = 0; i < EXPLAIN_CARDS.length; i++)
    s = explainReducer(s, { type: "reveal" }, content);
  return s;
};

describe("explainReducer", () => {
  it("reveals one card at a time, and no further than the five", () => {
    const s = explainReducer(explainStart("n"), { type: "reveal" }, content);
    expect(s.revealed).toBe(2);
    expect(revealAll().revealed).toBe(EXPLAIN_CARDS.length);
  });

  it("holds the check until the whole model has been shown", () => {
    const s = explainReducer(explainStart("n"), { type: "pick", index: right }, content);
    expect(s.done).toBe(false);
    expect(s.picked).toBeUndefined();
  });

  it("teaches a wrong pick on the spot and lets the learner try again", () => {
    let s = explainReducer(revealAll(), { type: "pick", index: wrong }, content);
    expect(s.done).toBe(false);
    expect(s.tried).toEqual([wrong]);
    expect(s.picked).toBe(wrong);
    // A reply already ruled out is not a second try.
    expect(explainReducer(s, { type: "pick", index: wrong }, content)).toBe(s);
    s = explainReducer(s, { type: "pick", index: right }, content);
    expect(s.done).toBe(true);
    expect(explainPassed(s)).toBe(true);
    expect(explainScore(s)).toBe(0.5);
  });

  it("scores a first-try find as 1, and nothing before it is found", () => {
    const s = explainReducer(revealAll(), { type: "pick", index: right }, content);
    expect(explainScore(s)).toBe(1);
    expect(explainScore(revealAll())).toBe(0);
    expect(explainPassed(revealAll())).toBe(false);
  });
});

describe("validateExplain", () => {
  const raw = () => {
    const { nodeId: _n, nodeLabel: _l, ...rest } = structuredClone(content);
    return rest;
  };
  const validate = validateExplain("n", "Node");

  it("accepts a check with exactly one defusing reply", () => {
    const out = validate(raw());
    expect(out.listener.replies.filter((r) => r.correct)).toHaveLength(1);
    expect(out.order.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a check with no right reply, or two", () => {
    const none = raw();
    none.listener.replies.forEach((r) => (r.correct = false));
    expect(() => validate(none)).toThrow(/exactly one correct/);
    const two = raw();
    two.listener.replies.forEach((r) => (r.correct = true));
    expect(() => validate(two)).toThrow(/exactly one correct/);
  });

  it("rejects a field that echoes the prompt template", () => {
    const echoed = raw();
    echoed.listener.replies[0].why = "That would be a hand-wave.";
    expect(() => validate(echoed)).toThrow(/echoes the prompt template/);
  });

  it("moves the right reply off wherever the model put it, stably per node", () => {
    const a = validateExplain("node-a", "A")(raw());
    expect(validateExplain("node-a", "A")(raw())).toEqual(a);
    const at = (id: string) =>
      validateExplain(id, "X")(raw()).listener.replies.findIndex((r) => r.correct);
    expect(new Set(["a", "b", "c", "d", "e", "f"].map(at)).size).toBeGreaterThan(1);
  });
});
