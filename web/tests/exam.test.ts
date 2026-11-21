import { describe, expect, it } from "vitest";
import {
  EXAM_POOL_MAX,
  EXAM_START,
  examAllocation,
  examPool,
  examReducer,
  examScore,
  mapFinished,
  type ConceptGraph,
  type ExamQuestion,
  type ExamSession,
} from "@/lib/curriculum";
import { validateExam } from "@/lib/server/generate/exam";
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
    const pool = examPool(graphOf(90));
    expect(pool).toHaveLength(EXAM_POOL_MAX);
    expect(pool[0].id).toBe("n0");
    expect(Number(pool.at(-1)!.id.slice(1))).toBeGreaterThan(80);
  });
});

describe("examAllocation", () => {
  const pool = examPool(graphOf(4));
  it("asks about every concept before any twice", () => {
    expect(examAllocation(pool, 10)).toEqual({ n0: 3, n1: 3, n2: 2, n3: 2 });
  });
  it("spaces a short paper across the map", () => {
    const a = examAllocation(examPool(graphOf(10)), 5);
    expect(Object.values(a).reduce((s, n) => s + n, 0)).toBe(5);
    expect(Object.keys(a)).toEqual(["n0", "n2", "n4", "n6", "n8"]);
  });
});

describe("examReducer", () => {
  const loaded = (): ExamSession => {
    let s = examReducer(EXAM_START, { type: "configure", count: 5, difficulty: "hard" });
    s = examReducer(s, { type: "writing" });
    return examReducer(s, {
      type: "loaded",
      questions: [question(1, "n0"), question(2, "n1", 2)],
    });
  };

  it("cannot move on without an answer, and finishes after the last", () => {
    let s = loaded();
    expect(s.stage).toBe("taking");
    expect(examReducer(s, { type: "next" })).toBe(s);
    s = examReducer(s, { type: "pick", choice: 0 });
    s = examReducer(s, { type: "next" });
    expect(s.index).toBe(1);
    s = examReducer(s, { type: "pick", choice: -7 });
    expect(s.picks["ex-2"]).toBe(-1);
    s = examReducer(s, { type: "next" });
    expect(s.stage).toBe("done");
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

  it("a failed write returns to setup with an error; a stale load is ignored", () => {
    const writing = examReducer(EXAM_START, { type: "writing" });
    expect(examReducer(writing, { type: "failed", error: "x" })).toMatchObject({
      stage: "setup",
      error: "x",
    });
    expect(
      examReducer(EXAM_START, { type: "loaded", questions: [question(1, "n0")] }),
    ).toBe(EXAM_START);
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
  const pool = [{ id: "n0" }, { id: "n1" }];
  const raw = (overrides: Record<string, unknown> = {}) => ({
    questions: [0, 1].map((i) => ({
      nodeId: `n${i}`,
      q: `Question ${i}`,
      opts: ["w", "x", "y", "z"],
      correctIndex: 1,
      explain: "why",
      ...overrides,
    })),
  });

  it("stamps ids and keeps the key on the right option through the shuffle", () => {
    const out = validateExam(pool, 2, () => 0)(raw());
    expect(out.map((q) => q.id)).toEqual(["ex-1", "ex-2"]);
    for (const q of out) expect(q.opts[q.correctIndex]).toBe("x");
    expect(out[0].opts).not.toEqual(["w", "x", "y", "z"]);
  });

  it("rejects a short paper, an unknown concept, and repeated options", () => {
    expect(() => validateExam(pool, 3)(raw())).toThrow(/questions/);
    expect(() => validateExam(pool, 2)(raw({ nodeId: "zz" }))).toThrow(/not one of/);
    expect(() => validateExam(pool, 2)(raw({ opts: ["a", "a", "b", "c"] }))).toThrow(
      /different/,
    );
  });
});

describe("the exam job", () => {
  it("is never cached and needs a pool", () => {
    const job = resolveJob({
      kind: "exam",
      topic: "Statistics",
      pool: [{ id: "n0", label: "Mean" }],
      count: 20,
      difficulty: "hard",
    });
    expect(job.kind).toBe("exam");
    expect(job.key).toBeNull();
    expect(() => resolveJob({ kind: "exam", topic: "Statistics" })).toThrow(/pool/);
  });
});
