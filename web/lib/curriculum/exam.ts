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
 * `k` of `n` indices, spaced evenly across `0..n-1` from a random phase. Even
 * spacing keeps a short paper (or a thinned pool) covering the map end to end;
 * the random phase is what makes a retake ask about *other* concepts rather
 * than the same evenly spaced handful every time.
 */
export function spacedPicks(
  n: number,
  k: number,
  rand: () => number = Math.random,
): number[] {
  if (k <= 0 || n <= 0) return [];
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  const step = n / k;
  // Clamped below 1: a `rand` that returns exactly 1 would push the last pick to `n`.
  const phase = Math.min(Math.max(rand(), 0), 0.999999);
  return Array.from({ length: k }, (_, i) => Math.floor((i + phase) * step));
}

/**
 * The concepts an exam is written over: the map's own nodes (a gap node is a
 * repair, not material of the topic), in map order, thinned evenly to the
 * request cap so a large map is still covered end to end rather than cut off
 * after its first thirty — from a random phase, so two papers on a large map
 * do not draw from the same thirty.
 */
export function examPool(
  graph: ConceptGraph,
  rand: () => number = Math.random,
): Array<{ id: string; label: string }> {
  const nodes = graph.nodes.filter((n) => !n.gap);
  const pool = nodes.length ? nodes : graph.nodes;
  const picked =
    pool.length <= EXAM_POOL_MAX
      ? pool
      : spacedPicks(pool.length, EXAM_POOL_MAX, rand).map((i) => pool[i]);
  return picked.map(({ id, label }) => ({ id, label }));
}

/**
 * How many questions each concept gets: every concept the same share, and the
 * remainder spread one each over concepts spaced evenly across the map. With
 * fewer questions than concepts that remainder is the whole paper. The spacing
 * starts from a random phase, so the extra questions are not always the first
 * concepts' and a short paper is not always the same subset of the map.
 */
export function examAllocation(
  pool: ReadonlyArray<{ id: string }>,
  count: number,
  rand: () => number = Math.random,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (pool.length === 0 || count <= 0) return out;
  const share = Math.floor(count / pool.length);
  if (share > 0) for (const p of pool) out[p.id] = share;
  for (const i of spacedPicks(pool.length, count % pool.length, rand)) {
    const id = pool[i].id;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

// ---- the session -----------------------------------------------------------

export type ExamStage = "setup" | "writing" | "taking" | "done";

/** Why the last paper did not arrive whole: `write` — nothing came; `empty` —
 *  it came with no questions; `short` — it stopped part-way, and the learner
 *  sits the questions that did arrive. */
export type ExamError = "write" | "empty" | "short";

export interface ExamSession {
  stage: ExamStage;
  count: ExamSize;
  difficulty: ExamDifficulty;
  /** Which request this paper is. Every arrival names it, so a paper that
   *  lands after the learner left, or after a second start, is dropped. */
  paperId: string;
  questions: ExamQuestion[];
  /** The paper is still streaming in: more questions are on their way. */
  arriving: boolean;
  /** The option each question was answered with, by question id. -1 is an
   *  own-words answer that matched none of them. */
  picks: Record<string, number>;
  /** What the learner wrote, by question id, when the pick came from their own
   *  words — so "Change answer" reopens their draft, and the key can show it. */
  written: Record<string, string>;
  index: number;
  error?: ExamError;
}

export const EXAM_START: ExamSession = {
  stage: "setup",
  count: 10,
  difficulty: "medium",
  paperId: "",
  questions: [],
  arriving: false,
  picks: {},
  written: {},
  index: 0,
};

export type ExamAction =
  | { type: "configure"; count?: ExamSize; difficulty?: ExamDifficulty }
  | { type: "writing"; paperId: string }
  | { type: "arrived"; paperId: string; question: ExamQuestion }
  | { type: "loaded"; paperId: string; questions: ExamQuestion[] }
  | { type: "failed"; paperId: string }
  | { type: "pick"; id: string; choice: number; text?: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "setup" }
  | { type: "reset" };

/** The paper's length as the learner should read it: the size they asked for
 *  while it is still arriving, what actually came once it has. */
export function examTotal(s: ExamSession): number {
  return s.arriving ? Math.max(s.count, s.questions.length) : s.questions.length;
}

/** The learner is on the last question that has arrived, and more are coming —
 *  "next" has to wait for it. */
export function examWaiting(s: ExamSession): boolean {
  return s.stage === "taking" && s.arriving && s.index + 1 >= s.questions.length;
}

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
        ...EXAM_START,
        count: s.count,
        difficulty: s.difficulty,
        stage: "writing",
        paperId: a.paperId,
        arriving: true,
      };
    case "arrived": {
      if (a.paperId !== s.paperId || !s.arriving) return s;
      if (s.stage !== "writing" && s.stage !== "taking") return s;
      const at = s.questions.findIndex((q) => q.id === a.question.id);
      const questions =
        at === -1
          ? [...s.questions, a.question]
          : s.questions.map((q, i) => (i === at ? a.question : q));
      return { ...s, stage: "taking", questions };
    }
    case "loaded": {
      if (a.paperId !== s.paperId || !s.arriving) return s;
      if (a.questions.length === 0)
        return { ...s, stage: "setup", arriving: false, questions: [], error: "empty" };
      // The final list is the paper; answers already given on it stay given.
      const ids = new Set(a.questions.map((q) => q.id));
      const keep = <T>(m: Record<string, T>) =>
        Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));
      return {
        ...s,
        stage: "taking",
        arriving: false,
        questions: a.questions,
        picks: keep(s.picks),
        written: keep(s.written),
        index: Math.min(s.index, a.questions.length - 1),
      };
    }
    case "failed":
      if (a.paperId !== s.paperId || !s.arriving) return s;
      // Nothing arrived: back to setup to try again. Part of it arrived: the
      // learner keeps sitting what they have rather than losing it.
      return s.questions.length === 0
        ? { ...s, stage: "setup", arriving: false, error: "write" }
        : { ...s, arriving: false, error: "short" };
    case "pick": {
      // Addressed by id, never "whichever question is on screen": an own-words
      // answer is judged by a model call, and the learner may have moved on by
      // the time it is read.
      if (s.stage !== "taking" || !s.questions.some((q) => q.id === a.id)) return s;
      const choice = Number.isInteger(a.choice) && a.choice >= 0 ? a.choice : -1;
      const written = { ...s.written };
      if (a.text?.trim()) written[a.id] = a.text.trim();
      else delete written[a.id];
      return { ...s, picks: { ...s.picks, [a.id]: choice }, written };
    }
    case "next": {
      const q = s.questions[s.index];
      if (s.stage !== "taking" || !q || s.picks[q.id] === undefined) return s;
      if (s.index + 1 < s.questions.length) return { ...s, index: s.index + 1 };
      return s.arriving ? s : { ...s, stage: "done" };
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
