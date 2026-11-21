import { describe, expect, it } from "vitest";
import {
  EXAM_BOOK_START,
  EXAM_HISTORY_MAX,
  examBookReducer,
  examSave,
  parseExamSave,
  previousAttempt,
  recordAttempt,
  type ExamAttempt,
  type ExamBook,
  type ExamQuestion,
} from "@/lib/curriculum";

const question = (i: number, correctIndex = 0): ExamQuestion => ({
  id: `ex-${i}`,
  nodeId: `n${i}`,
  q: `Q${i}`,
  opts: ["a", "b", "c", "d"],
  correctIndex,
  explain: "because",
});

const attempt = (id: string, pct: number): ExamAttempt => ({
  id,
  at: "2026-11-21T10:00:00.000Z",
  count: 10,
  difficulty: "medium",
  correct: pct / 10,
  total: 10,
  pct,
  byConcept: [],
});

/** A two-question paper on topic t1, written and answered up to `answered`. */
function sat(answered: number): ExamBook {
  let b = examBookReducer(EXAM_BOOK_START, {
    type: "open",
    topicId: "t1",
    saved: { session: null, attempts: [] },
  });
  b = examBookReducer(b, { type: "writing", paperId: "p1" });
  b = examBookReducer(b, {
    type: "loaded",
    paperId: "p1",
    questions: [question(1), question(2)],
  });
  for (let i = 1; i <= answered; i++) {
    b = examBookReducer(b, { type: "pick", id: `ex-${i}`, choice: 0 });
    b = examBookReducer(b, { type: "next", at: "2026-11-21T12:00:00.000Z" });
  }
  return b;
}

describe("the exam book", () => {
  it("records a finished paper exactly once, in the step that finishes it", () => {
    const done = sat(2);
    expect(done.session.stage).toBe("done");
    expect(done.attempts).toHaveLength(1);
    expect(done.attempts[0]).toMatchObject({ id: "p1", pct: 100, correct: 2, total: 2 });
    // Another "next" on a finished paper changes nothing and records nothing.
    expect(examBookReducer(done, { type: "next" })).toBe(done);
  });

  it("opening a map replaces the session and history with that map's own", () => {
    const b = examBookReducer(sat(1), {
      type: "open",
      topicId: "t2",
      saved: { session: null, attempts: [attempt("old", 40)] },
    });
    expect(b.topicId).toBe("t2");
    expect(b.session.stage).toBe("setup");
    expect(b.attempts.map((a) => a.id)).toEqual(["old"]);
  });
});

describe("history", () => {
  it("keeps one row per paper, newest last, capped", () => {
    let h: ExamAttempt[] = [];
    for (let i = 0; i < EXAM_HISTORY_MAX + 5; i++)
      h = recordAttempt(h, attempt(`p${i}`, 50));
    expect(h).toHaveLength(EXAM_HISTORY_MAX);
    expect(h.at(-1)!.id).toBe(`p${EXAM_HISTORY_MAX + 4}`);
    expect(
      recordAttempt(h, attempt("p24", 90)).filter((a) => a.id === "p24"),
    ).toHaveLength(1);
  });

  it("compares a paper with the one before it", () => {
    const h = [attempt("a", 40), attempt("b", 70)];
    expect(previousAttempt(h, "b")?.id).toBe("a");
    expect(previousAttempt(h, "c")?.id).toBe("b");
    expect(previousAttempt([attempt("a", 40)], "a")).toBeUndefined();
  });
});

describe("what is stored", () => {
  it("round-trips a paper part-way through, so a reload resumes it", () => {
    const mid = sat(1);
    const saved = parseExamSave(JSON.parse(JSON.stringify(examSave(mid))));
    expect(saved.session).toMatchObject({
      stage: "taking",
      index: 1,
      picks: { "ex-1": 0 },
    });
    const resumed = examBookReducer(EXAM_BOOK_START, {
      type: "open",
      topicId: "t1",
      saved,
    });
    expect(
      examBookReducer(resumed, { type: "pick", id: "ex-2", choice: 0 }).session.picks,
    ).toEqual({
      "ex-1": 0,
      "ex-2": 0,
    });
  });

  it("keeps no paper that is still arriving, nor one on the setup page", () => {
    let b = examBookReducer(EXAM_BOOK_START, {
      type: "open",
      topicId: "t1",
      saved: { session: null, attempts: [] },
    });
    b = examBookReducer(b, { type: "writing", paperId: "p1" });
    b = examBookReducer(b, { type: "arrived", paperId: "p1", question: question(1) });
    expect(examSave(b).session).toBeNull();
    expect(examSave(sat(2)).session?.stage).toBe("done");
  });

  it("drops anything malformed rather than trusting it", () => {
    expect(parseExamSave(null)).toEqual({ session: null, attempts: [] });
    expect(
      parseExamSave({ session: { stage: "taking", paperId: "p", questions: [{}] } })
        .session,
    ).toBeNull();
    const bad = { ...attempt("x", 50), difficulty: "brutal" };
    expect(
      parseExamSave({ attempts: [bad, attempt("y", 60)] }).attempts.map((a) => a.id),
    ).toEqual(["y"]);
    // A "finished" paper with an unanswered question was not finished.
    const done = examSave(sat(2)).session!;
    expect(parseExamSave({ session: { ...done, picks: {} } }).session).toBeNull();
  });
});
