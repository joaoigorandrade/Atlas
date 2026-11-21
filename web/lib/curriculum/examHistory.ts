// The mock exam's memory: the papers a learner has finished on a map (a score
// trend to read their progress by), and the paper they are part-way through,
// so a reload does not cost them the questions they already answered. Pure —
// `lib/examStore.ts` is the device storage it is read from and written to.

import {
  EXAM_DIFFICULTIES,
  EXAM_OPTIONS,
  EXAM_SIZES,
  EXAM_START,
  examReducer,
  examScore,
  type ExamAction,
  type ExamConceptScore,
  type ExamDifficulty,
  type ExamQuestion,
  type ExamSession,
  type ExamSize,
} from "./exam";

/** How many finished papers a map remembers. */
export const EXAM_HISTORY_MAX = 20;

export interface ExamAttempt {
  /** The paper's id — recording the same paper twice keeps one row. */
  id: string;
  /** When it was finished, ISO. */
  at: string;
  count: number;
  difficulty: ExamDifficulty;
  correct: number;
  total: number;
  pct: number;
  byConcept: ExamConceptScore[];
}

export function examAttempt(s: ExamSession, at: string): ExamAttempt {
  const score = examScore(s.questions, s.picks);
  return {
    id: s.paperId,
    at,
    count: s.count,
    difficulty: s.difficulty,
    correct: score.correct,
    total: score.total,
    pct: score.pct,
    byConcept: score.byConcept,
  };
}

/** Newest last, one row per paper, at most `EXAM_HISTORY_MAX`. */
export function recordAttempt(
  history: readonly ExamAttempt[],
  attempt: ExamAttempt,
): ExamAttempt[] {
  return [...history.filter((a) => a.id !== attempt.id), attempt].slice(
    -EXAM_HISTORY_MAX,
  );
}

/** The paper finished before this one, if any — what the result compares to. */
export function previousAttempt(
  history: readonly ExamAttempt[],
  paperId: string,
): ExamAttempt | undefined {
  const before = history.filter((a) => a.id !== paperId);
  return before[before.length - 1];
}

// ---- the book: a map's session and its history, as one state ---------------
//
// One reducer rather than two states, so the map they belong to travels with
// them: a write after the learner switched maps can never land the old map's
// paper under the new map's key, and a paper is recorded in the same step that
// finishes it, not in an effect that might run twice.

export interface ExamBook {
  /** The map this book belongs to — null until a run is loaded. */
  topicId: string | null;
  session: ExamSession;
  attempts: ExamAttempt[];
}

export const EXAM_BOOK_START: ExamBook = {
  topicId: null,
  session: EXAM_START,
  attempts: [],
};

export type ExamBookAction =
  | { type: "open"; topicId: string | null; saved: ExamSave }
  | (ExamAction & { at?: string });

export function examBookReducer(b: ExamBook, a: ExamBookAction): ExamBook {
  if (a.type === "open")
    return {
      topicId: a.topicId,
      session: a.saved.session ?? EXAM_START,
      attempts: a.saved.attempts,
    };
  const session = examReducer(b.session, a);
  if (session === b.session) return b;
  const finished = b.session.stage !== "done" && session.stage === "done";
  return {
    ...b,
    session,
    attempts: finished
      ? recordAttempt(b.attempts, examAttempt(session, a.at ?? new Date().toISOString()))
      : b.attempts,
  };
}

// ---- what is stored --------------------------------------------------------

export interface ExamSave {
  /** Only a whole paper being sat, or a finished one — a paper still arriving
   *  cannot be resumed (its stream is gone), so it is not kept. */
  session: ExamSession | null;
  attempts: ExamAttempt[];
}

export const EMPTY_EXAM_SAVE: ExamSave = { session: null, attempts: [] };

/** What of a book is worth keeping. */
export function examSave(b: ExamBook): ExamSave {
  const s = b.session;
  const keep = (s.stage === "taking" && !s.arriving) || s.stage === "done";
  return { session: keep ? s : null, attempts: b.attempts };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function asQuestion(v: unknown): ExamQuestion | null {
  if (!isObj(v)) return null;
  const { id, nodeId, q, opts, correctIndex, explain } = v;
  if (!isStr(id) || !isStr(nodeId) || !isStr(q) || !isStr(explain)) return null;
  if (!Array.isArray(opts) || opts.length !== EXAM_OPTIONS || !opts.every(isStr))
    return null;
  if (!isInt(correctIndex) || correctIndex < 0 || correctIndex >= EXAM_OPTIONS)
    return null;
  return { id, nodeId, q, opts, correctIndex, explain };
}

function asRecord<T>(v: unknown, is: (x: unknown) => x is T): Record<string, T> {
  if (!isObj(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, x]) => is(x))) as Record<
    string,
    T
  >;
}

function asSession(v: unknown): ExamSession | null {
  if (!isObj(v) || (v.stage !== "taking" && v.stage !== "done")) return null;
  if (!isStr(v.paperId) || !Array.isArray(v.questions)) return null;
  const questions = v.questions.map(asQuestion);
  if (questions.length === 0 || questions.some((q) => q === null)) return null;
  const qs = questions as ExamQuestion[];
  const count = (EXAM_SIZES as readonly unknown[]).includes(v.count)
    ? (v.count as ExamSize)
    : EXAM_START.count;
  const difficulty = (EXAM_DIFFICULTIES as readonly unknown[]).includes(v.difficulty)
    ? (v.difficulty as ExamDifficulty)
    : EXAM_START.difficulty;
  const picks = asRecord(v.picks, isInt);
  // A finished paper with an unanswered question was not finished.
  if (v.stage === "done" && qs.some((q) => picks[q.id] === undefined)) return null;
  const index = isInt(v.index) ? Math.min(Math.max(v.index, 0), qs.length - 1) : 0;
  return {
    ...EXAM_START,
    stage: v.stage,
    count,
    difficulty,
    paperId: v.paperId,
    questions: qs,
    picks,
    written: asRecord(v.written, isStr),
    index,
    error: v.error === "short" ? "short" : undefined,
  };
}

function asAttempt(v: unknown): ExamAttempt | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.at)) return null;
  if (!isInt(v.correct) || !isInt(v.total) || !isInt(v.pct) || !isInt(v.count))
    return null;
  const difficulty = (EXAM_DIFFICULTIES as readonly unknown[]).includes(v.difficulty)
    ? (v.difficulty as ExamDifficulty)
    : null;
  if (!difficulty) return null;
  const byConcept = Array.isArray(v.byConcept)
    ? v.byConcept.filter(
        (r): r is ExamConceptScore =>
          isObj(r) && isStr(r.nodeId) && isInt(r.correct) && isInt(r.total),
      )
    : [];
  return {
    id: v.id,
    at: v.at,
    count: v.count,
    difficulty,
    correct: v.correct,
    total: v.total,
    pct: v.pct,
    byConcept,
  };
}

/** Read back what `examSave` stored — anything malformed is dropped, never
 *  trusted: storage outlives the code that wrote it. */
export function parseExamSave(raw: unknown): ExamSave {
  if (!isObj(raw)) return EMPTY_EXAM_SAVE;
  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts
        .map(asAttempt)
        .filter((a): a is ExamAttempt => a !== null)
        .slice(-EXAM_HISTORY_MAX)
    : [];
  return { session: asSession(raw.session), attempts };
}
