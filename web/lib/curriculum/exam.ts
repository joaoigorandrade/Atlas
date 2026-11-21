// The mock exam: a test over a whole finished map, at a size and a difficulty
// the learner chooses. Types and the reducer only — the questions are written
// by `lib/server/generate/exam.ts`, the sheet is `components/session/ExamView`.
//
// It is deliberately *not* a phase. A phase extracts a signal about one node
// and moves its mastery; the exam is a rehearsal over every node at once, taken
// after the ladders are done, so it reads the map and writes nothing to it. A
// concept the learner misses is pointed back to on the map, where its own
// phases (and Retain) are what close it.

import type { ConceptGraph } from "./types";

export const EXAM_SIZES = [5, 10, 20, 30] as const;
export type ExamSize = (typeof EXAM_SIZES)[number];

export const EXAM_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type ExamDifficulty = (typeof EXAM_DIFFICULTIES)[number];

/** The most concepts one exam request names — the server's list cap. */
export const EXAM_POOL_MAX = 30;

/** At or above this share right, the exam reads as passed. */
export const EXAM_PASS_PCT = 70;

/** Four options per question, as every closed form in the app is. */
export const EXAM_OPTIONS = 4;

export interface ExamQuestion {
  id: string;
  /** The concept this question tests — one of the pool's ids. */
  nodeId: string;
  q: string;
  opts: string[];
  correctIndex: number;
  /** Why the right answer is right, shown on the results page only. */
  explain: string;
}

export function asExamSize(raw: unknown): ExamSize {
  return (EXAM_SIZES as readonly unknown[]).includes(raw) ? (raw as ExamSize) : 10;
}

export function asExamDifficulty(raw: unknown): ExamDifficulty {
  return (EXAM_DIFFICULTIES as readonly unknown[]).includes(raw)
    ? (raw as ExamDifficulty)
    : "medium";
}

/** Every concept is mastered — the map is finished and the exam opens. Gap
 *  nodes count: an open gap holds its parent off green anyway. */
export function mapFinished(
  graph: ConceptGraph,
  states: Record<string, string | undefined>,
): boolean {
  return graph.nodes.length > 0 && graph.nodes.every((n) => states[n.id] === "mastered");
}

/**
 * The concepts an exam is written over: the map's own nodes (a gap node is a
 * repair, not material of the topic), in map order, thinned evenly to the
 * request cap so a large map is still covered end to end rather than cut off
 * after its first thirty.
 */
export function examPool(graph: ConceptGraph): Array<{ id: string; label: string }> {
  const nodes = graph.nodes.filter((n) => !n.gap);
  const pool = nodes.length ? nodes : graph.nodes;
  if (pool.length <= EXAM_POOL_MAX) return pool.map(({ id, label }) => ({ id, label }));
  const step = pool.length / EXAM_POOL_MAX;
  return Array.from({ length: EXAM_POOL_MAX }, (_, i) => pool[Math.floor(i * step)]).map(
    ({ id, label }) => ({ id, label }),
  );
}

/**
 * How many questions each concept gets: spread round-robin over the pool, so
 * every concept is asked about before any is asked about twice. With fewer
 * questions than concepts, the ones asked about are spaced across the map.
 */
export function examAllocation(
  pool: ReadonlyArray<{ id: string }>,
  count: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (pool.length === 0 || count <= 0) return out;
  if (count < pool.length) {
    const step = pool.length / count;
    for (let i = 0; i < count; i++) out[pool[Math.floor(i * step)].id] = 1;
    return out;
  }
  for (let i = 0; i < count; i++) {
    const id = pool[i % pool.length].id;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

// ---- the session -----------------------------------------------------------

export type ExamStage = "setup" | "writing" | "taking" | "done";

export interface ExamSession {
  stage: ExamStage;
  count: ExamSize;
  difficulty: ExamDifficulty;
  questions: ExamQuestion[];
  /** The option each question was answered with, by question id. -1 is an
   *  own-words answer that matched none of them. */
  picks: Record<string, number>;
  index: number;
  /** Why the last attempt to write an exam failed, shown on the setup page. */
  error?: string;
}

export const EXAM_START: ExamSession = {
  stage: "setup",
  count: 10,
  difficulty: "medium",
  questions: [],
  picks: {},
  index: 0,
};

export type ExamAction =
  | { type: "configure"; count?: ExamSize; difficulty?: ExamDifficulty }
  | { type: "writing" }
  | { type: "loaded"; questions: ExamQuestion[] }
  | { type: "failed"; error: string }
  | { type: "pick"; choice: number }
  | { type: "next" }
  | { type: "back" }
  | { type: "setup" }
  | { type: "reset" };

export function examReducer(s: ExamSession, a: ExamAction): ExamSession {
  switch (a.type) {
    case "configure":
      if (s.stage !== "setup") return s;
      return {
        ...s,
        count: a.count ?? s.count,
        difficulty: a.difficulty ?? s.difficulty,
        error: undefined,
      };
    case "writing":
      return {
        ...s,
        stage: "writing",
        questions: [],
        picks: {},
        index: 0,
        error: undefined,
      };
    case "loaded":
      if (s.stage !== "writing") return s;
      if (a.questions.length === 0) return { ...s, stage: "setup" };
      return { ...s, stage: "taking", questions: a.questions, picks: {}, index: 0 };
    case "failed":
      return s.stage === "writing" ? { ...s, stage: "setup", error: a.error } : s;
    case "pick": {
      const q = s.questions[s.index];
      if (s.stage !== "taking" || !q) return s;
      const choice = Number.isInteger(a.choice) && a.choice >= 0 ? a.choice : -1;
      return { ...s, picks: { ...s.picks, [q.id]: choice } };
    }
    case "next": {
      const q = s.questions[s.index];
      if (s.stage !== "taking" || !q || s.picks[q.id] === undefined) return s;
      return s.index + 1 >= s.questions.length
        ? { ...s, stage: "done" }
        : { ...s, index: s.index + 1 };
    }
    case "back":
      return s.stage === "taking" && s.index > 0 ? { ...s, index: s.index - 1 } : s;
    case "setup":
      return { ...EXAM_START, count: s.count, difficulty: s.difficulty };
    case "reset":
      return EXAM_START;
  }
}

// ---- the score -------------------------------------------------------------

export interface ExamConceptScore {
  nodeId: string;
  correct: number;
  total: number;
}

export interface ExamScore {
  correct: number;
  total: number;
  pct: number;
  passed: boolean;
  /** One row per concept asked about, weakest first. */
  byConcept: ExamConceptScore[];
}

export function examScore(
  questions: readonly ExamQuestion[],
  picks: Readonly<Record<string, number>>,
): ExamScore {
  const rows = new Map<string, ExamConceptScore>();
  let correct = 0;
  for (const q of questions) {
    const right = picks[q.id] === q.correctIndex;
    if (right) correct++;
    const row = rows.get(q.nodeId) ?? { nodeId: q.nodeId, correct: 0, total: 0 };
    row.total++;
    if (right) row.correct++;
    rows.set(q.nodeId, row);
  }
  const total = questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const byConcept = [...rows.values()].sort(
    (a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total,
  );
  return { correct, total, pct, passed: pct >= EXAM_PASS_PCT, byConcept };
}
