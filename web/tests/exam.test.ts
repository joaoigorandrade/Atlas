import { describe, expect, it } from "vitest";
import {
  EXAM_POOL_MAX,
  EXAM_START,
  examAllocation,
  examPool,
  examReducer,
  examScore,
  examTotal,
  examWaiting,
  mapFinished,
  spacedPicks,
  type ConceptGraph,
  type ExamQuestion,
  type ExamSession,
} from "@/lib/curriculum";
import { Paper, validateExam } from "@/lib/server/generate/exam";
import { resolveJob } from "@/lib/server/job";

const graphOf = (n: number, gaps: number[] = []): ConceptGraph => ({
  nodes: Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    state: "unknown" as const,
    ...(gaps.includes(i) ? { gap: true } : {}),
  })) as ConceptGraph["nodes"],
  edges: [],
});

const question = (i: number, nodeId: string, correctIndex = 0): ExamQuestion => ({
  id: `ex-${i}`,
  nodeId,
  q: `Q${i}`,
  opts: ["a", "b", "c", "d"],
  correctIndex,
  explain: "because",
});

describe("mapFinished", () => {
  it("opens only when every node is mastered", () => {
    const g = graphOf(3);
    expect(mapFinished(g, { n0: "mastered", n1: "mastered", n2: "shaky" })).toBe(false);
    expect(mapFinished(g, { n0: "mastered", n1: "mastered", n2: "mastered" })).toBe(true);
    expect(mapFinished(graphOf(0), {})).toBe(false);
  });
});

describe("examPool", () => {
  it("drops gap nodes and keeps map order", () => {
    expect(examPool(graphOf(4, [1])).map((p) => p.id)).toEqual(["n0", "n2", "n3"]);
  });
  it("thins a large map evenly to the cap, end to end", () => {
    const pool = examPool(graphOf(90), () => 0);
    expect(pool).toHaveLength(EXAM_POOL_MAX);
    expect(pool[0].id).toBe("n0");
    expect(Number(pool.at(-1)!.id.slice(1))).toBeGreaterThan(80);
  });
  it("draws a different thirty from a large map on another paper", () => {
    const a = examPool(graphOf(90), () => 0).map((p) => p.id);
    const b = examPool(graphOf(90), () => 0.7).map((p) => p.id);
    expect(b).toHaveLength(EXAM_POOL_MAX);
    expect(b).not.toEqual(a);
  });
});

describe("examAllocation", () => {
  const pool = examPool(graphOf(4));
  const total = (a: Record<string, number>) =>
    Object.values(a).reduce((s, n) => s + n, 0);

  it("asks about every concept before any twice, the extras spaced across the map", () => {
    expect(examAllocation(pool, 10, () => 0)).toEqual({ n0: 3, n1: 2, n2: 3, n3: 2 });
    expect(examAllocation(pool, 10, () => 0.6)).toEqual({ n0: 2, n1: 3, n2: 2, n3: 3 });
  });
  it("spaces a short paper across the map", () => {
    const a = examAllocation(examPool(graphOf(10)), 5, () => 0);
    expect(total(a)).toBe(5);
    expect(Object.keys(a)).toEqual(["n0", "n2", "n4", "n6", "n8"]);
  });
  it("draws a different subset on a retake, and always the size asked", () => {
    const big = examPool(graphOf(20));
    const first = Object.keys(examAllocation(big, 5, () => 0));
    const retake = Object.keys(examAllocation(big, 5, () => 0.5));
    expect(retake).not.toEqual(first);
    for (const r of [0, 0.25, 0.5, 0.99, 1]) {
      const a = examAllocation(big, 5, () => r);
      expect(total(a)).toBe(5);
      expect(Object.values(a).every((n) => n === 1)).toBe(true);
    }
  });
});

describe("spacedPicks", () => {
  it("is distinct, in range, and spread", () => {
    for (const r of [0, 0.3, 0.999, 1]) {
      const picks = spacedPicks(30, 7, () => r);
      expect(new Set(picks).size).toBe(7);
      expect(Math.min(...picks)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...picks)).toBeLessThan(30);
    }
    expect(spacedPicks(3, 5)).toEqual([0, 1, 2]);
  });
});

describe("examReducer", () => {
  const writing = (paperId = "p1"): ExamSession => {
    const s = examReducer(EXAM_START, {
      type: "configure",
      count: 5,
      difficulty: "hard",
    });
    return examReducer(s, { type: "writing", paperId });
  };
  const loaded = (): ExamSession =>
    examReducer(writing(), {
      type: "loaded",
      paperId: "p1",
      questions: [question(1, "n0"), question(2, "n1", 2)],
    });

  it("cannot move on without an answer, and finishes after the last", () => {
    let s = loaded();
    expect(s.stage).toBe("taking");
    expect(examReducer(s, { type: "next" })).toBe(s);
    s = examReducer(s, { type: "pick", id: "ex-1", choice: 0 });
    s = examReducer(s, { type: "next" });
    expect(s.index).toBe(1);
    s = examReducer(s, { type: "pick", id: "ex-2", choice: -7 });
    expect(s.picks["ex-2"]).toBe(-1);
    s = examReducer(s, { type: "next" });
    expect(s.stage).toBe("done");
  });

  it("records a late own-words answer on the question it answers, not the one on screen", () => {
    let s = examReducer(loaded(), { type: "pick", id: "ex-1", choice: 1 });
    s = examReducer(s, { type: "next" });
    s = examReducer(s, { type: "back" });
    expect(s.index).toBe(0);
    // Question 2's judged answer lands while the learner is back on question 1.
    s = examReducer(s, { type: "pick", id: "ex-2", choice: 3, text: "my words" });
    expect(s.picks).toEqual({ "ex-1": 1, "ex-2": 3 });
    expect(s.written).toEqual({ "ex-2": "my words" });
    // A pick for a question not on the paper is dropped.
    expect(examReducer(s, { type: "pick", id: "ex-9", choice: 0 })).toBe(s);
    // Picking a choice afterwards forgets the words it replaced.
    s = examReducer(s, { type: "pick", id: "ex-2", choice: 1 });
    expect(s.written).toEqual({});
  });

  it("starts the learner on the first question while the rest stream in", () => {
    let s = examReducer(writing(), {
      type: "arrived",
      paperId: "p1",
      question: question(1, "n0"),
    });
    expect(s).toMatchObject({ stage: "taking", arriving: true });
    expect(examTotal(s)).toBe(5);
    s = examReducer(s, { type: "pick", id: "ex-1", choice: 0 });
    expect(examWaiting(s)).toBe(true);
    // "Next" waits for question 2 rather than ending a one-question paper.
    expect(examReducer(s, { type: "next" })).toBe(s);
    s = examReducer(s, { type: "arrived", paperId: "p1", question: question(2, "n1") });
    expect(examWaiting(s)).toBe(false);
    s = examReducer(s, { type: "next" });
    expect(s.index).toBe(1);
    s = examReducer(s, {
      type: "loaded",
      paperId: "p1",
      questions: [question(1, "n0"), question(2, "n1")],
    });
    expect(s).toMatchObject({ arriving: false, picks: { "ex-1": 0 }, index: 1 });
    expect(examTotal(s)).toBe(2);
  });

  it("ignores anything from a paper that is no longer the current one", () => {
    const s = writing("p2");
    const late = { paperId: "p1", question: question(1, "n0") };
    expect(examReducer(s, { type: "arrived", ...late })).toBe(s);
    expect(examReducer(s, { type: "loaded", paperId: "p1", questions: [] })).toBe(s);
    expect(examReducer(s, { type: "failed", paperId: "p1" })).toBe(s);
    expect(
      examReducer(EXAM_START, {
        type: "loaded",
        paperId: "",
        questions: [question(1, "n0")],
      }),
    ).toBe(EXAM_START);
  });

  it("a failed write returns to setup; an empty one says so; a short one is sat", () => {
    expect(examReducer(writing(), { type: "failed", paperId: "p1" })).toMatchObject({
      stage: "setup",
      error: "write",
    });
    expect(
      examReducer(writing(), { type: "loaded", paperId: "p1", questions: [] }),
    ).toMatchObject({ stage: "setup", error: "empty" });
    let s = examReducer(writing(), {
      type: "arrived",
      paperId: "p1",
      question: question(1, "n0"),
    });
    s = examReducer(s, { type: "failed", paperId: "p1" });
    expect(s).toMatchObject({ stage: "taking", arriving: false, error: "short" });
    s = examReducer(s, { type: "pick", id: "ex-1", choice: 0 });
    expect(examReducer(s, { type: "next" }).stage).toBe("done");
  });

  it("keeps size and difficulty when going back to setup", () => {
    const s = examReducer(loaded(), { type: "setup" });
    expect(s).toMatchObject({
      stage: "setup",
      count: 5,
      difficulty: "hard",
      questions: [],
    });
  });
});

describe("examScore", () => {
  it("scores, passes at 70%, and ranks concepts weakest first", () => {
    const qs = [question(1, "a"), question(2, "a"), question(3, "b"), question(4, "c")];
    const score = examScore(qs, { "ex-1": 0, "ex-2": 1, "ex-3": 0, "ex-4": -1 });
    expect(score).toMatchObject({ correct: 2, total: 4, pct: 50, passed: false });
    expect(score.byConcept.map((r) => r.nodeId)).toEqual(["c", "a", "b"]);
    expect(examScore(qs, { "ex-1": 0, "ex-2": 0, "ex-3": 0, "ex-4": 1 }).passed).toBe(
      true,
    );
  });
});

describe("validateExam", () => {
  const allocation = { n0: 1, n1: 1 };
  const item = (i: number, over: Record<string, unknown> = {}) => ({
    nodeId: `n${i}`,
    q: `Question ${i}`,
    opts: ["w", "x", "y", "z"],
    correctIndex: 1,
    explain: "why",
    ...over,
  });
  const raw = (...items: unknown[]) => ({ questions: items });

  it("stamps ids and keeps the key on the right option through the shuffle", () => {
    const out = validateExam(allocation, () => 0)(raw(item(0), item(1)));
    expect(out.map((q) => q.id)).toEqual(["ex-1", "ex-2"]);
    for (const q of out) expect(q.opts[q.correctIndex]).toBe("x");
    expect(out[0].opts).not.toEqual(["w", "x", "y", "z"]);
  });

  it("rejects a short paper, an unknown concept, and repeated options", () => {
    expect(() => validateExam({ n0: 2, n1: 1 })(raw(item(0), item(1)))).toThrow(/n0 ×1/);
    expect(() =>
      validateExam(allocation)(raw(item(0), item(1, { nodeId: "zz" }))),
    ).toThrow(/not one of/);
    expect(() =>
      validateExam(allocation)(raw(item(0, { opts: ["a", "a", "b", "c"] }), item(1))),
    ).toThrow(/different/);
  });

  it("enforces the allocation: a concept over its share is left off, and named", () => {
    // Two questions on n0, none on n1 — the second n0 is refused, n1 is owed.
    expect(() =>
      validateExam(allocation)(raw(item(0), item(0, { q: "Another on n0" }))),
    ).toThrow(/n1 ×1.*already has every question/);
    // The extra is skipped, not fatal, when the rest of the paper is whole.
    const out = validateExam(allocation)(
      raw(item(0), item(0, { q: "Another on n0" }), item(1)),
    );
    expect(out.map((q) => q.nodeId)).toEqual(["n0", "n1"]);
  });

  it("drops a question that repeats another up to case and punctuation", () => {
    expect(() =>
      validateExam({ n0: 2 })(
        raw(item(0, { q: "What is X?" }), item(0, { q: "what is x" })),
      ),
    ).toThrow(/repeats/);
  });
});

describe("Paper", () => {
  it("clones without sharing what is left", () => {
    const paper = new Paper({ n0: 1, n1: 1 }, () => 0);
    const draft = {
      nodeId: "n0",
      q: "Q",
      opts: ["a", "b", "c", "d"],
      correctIndex: 0,
      explain: "e",
    };
    const trial = paper.clone();
    expect(trial.take(draft)).not.toBeNull();
    expect(paper.remaining()).toEqual({ n0: 1, n1: 1 });
    expect(trial.remaining()).toEqual({ n1: 1 });
  });
});

describe("the exam job", () => {
  it("is never cached, streams to the exact size, and needs a pool", () => {
    const job = resolveJob({
      kind: "exam",
      topic: "Statistics",
      pool: [{ id: "n0", label: "Mean" }],
      count: 20,
      difficulty: "hard",
    });
    expect(job.kind).toBe("exam");
    expect(job.key).toBeNull();
    expect(job.stream).toBeTypeOf("function");
    expect(job.shape).toEqual({ questions: { min: 20, max: 20 } });
    expect(() => resolveJob({ kind: "exam", topic: "Statistics" })).toThrow(/pool/);
  });
});
