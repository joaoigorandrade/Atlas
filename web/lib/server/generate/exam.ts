// ---- kind: exam --------------------------------------------------------------
// A mock exam over a whole finished map: N four-option questions spread across
// its concepts, at the difficulty the learner chose. Never cached — a retake is
// meant to be a fresh paper, not the one they just sat.
//
// Ids, the per-concept allocation and the option order are all decided here,
// never trusted from the model: models put the right answer in the same slot
// far more often than chance, and an exam whose key is "B" tests nothing. The
// allocation is *enforced*, not only asked for — a question over a concept's
// share, on a concept outside the plan, or repeating one already on the paper
// is left off it, and whatever the paper is then missing is written again.
//
// Streamed one question per frame, so the learner starts on question 1 while
// the rest are written. A question the stream drops, or a stream that dies
// part-way, costs only the missing questions — they are topped up by one
// retried single-shot call for exactly those — never the whole paper.

import {
  EXAM_OPTIONS,
  examAllocation,
  type ExamDifficulty,
  type ExamQuestion,
  type GoalKind,
} from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import type { StreamFrame } from "@/lib/server/stream";
import { arr, fail, interestNote, languageNote, obj, slug, str, user } from "./common";
import { blindSolve, disputedIds } from "./verify";

export interface ExamParams {
  topic: string;
  goal: GoalKind;
  interests: string;
  language?: Language;
  /** The concepts the paper covers, in map order. */
  pool: Array<{ id: string; label: string }>;
  count: number;
  difficulty: ExamDifficulty;
}

const DIFFICULTY_NOTE: Record<ExamDifficulty, string> = {
  easy: "EASY: recognition and core understanding — what a concept is, when it applies, its key facts. One step of thought. Distractors are clearly wrong to anyone who learned the concept, but still plausible to someone who did not.",
  medium:
    "MEDIUM: application — a short concrete scenario or worked case the learner has to apply the concept to. Distractors are the answers a common misconception or a skipped step would produce.",
  hard: "HARD: exam-grade — multi-step reasoning, an unfamiliar case, edge conditions, or a question that combines the tagged concept with another one on the map. Every distractor is the result of a specific, tempting mistake; none is eliminable by wording alone.",
};

/** Fisher–Yates over the options, carrying the key with it. */
function shuffled(opts: string[], correctIndex: number, rand: () => number) {
  const order = opts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { opts: order.map((i) => opts[i]), correctIndex: order.indexOf(correctIndex) };
}

/** A question as the model wrote it, checked but not yet on the paper. */
type Draft = Omit<ExamQuestion, "id">;

/** One question's shape — the concept must be one the paper is about. */
export function checkQuestion(raw: unknown, at: string, ids: ReadonlySet<string>): Draft {
  const r = obj(raw, at);
  const nodeId = slug(r.nodeId, `${at}.nodeId`);
  if (!ids.has(nodeId))
    fail(`${at}.nodeId "${nodeId}" is not one of the listed concepts`);
  const q = str(r.q, `${at}.q`);
  const opts = arr(r.opts, `${at}.opts`, EXAM_OPTIONS, EXAM_OPTIONS).map((o, j) =>
    str(o, `${at}.opts[${j}]`),
  );
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
    fail(`${at}.opts must be four different answers`);
  const key = r.correctIndex;
  if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= EXAM_OPTIONS)
    fail(`${at}.correctIndex must be an integer 0-${EXAM_OPTIONS - 1}`);
  return { nodeId, q, opts, correctIndex: key, explain: str(r.explain, `${at}.explain`) };
}

/**
 * Does the key survive a blind solve? Written in the same call as its
 * question, a key is wrong often enough that its own `explain` argues for
 * another option. One solve per question, labelled with its own concept.
 * Fails open: an unreachable verifier keeps the question.
 */
async function keyHolds(params: ExamParams, d: Draft): Promise<boolean> {
  const item = { id: "q", stem: d.q, options: d.opts, key: d.correctIndex };
  try {
    const solved = await blindSolve({
      topic: params.topic,
      nodeLabel: params.pool.find((p) => p.id === d.nodeId)?.label ?? params.topic,
      items: [item],
    });
    return disputedIds([item], solved).length === 0;
  } catch {
    return true;
  }
}

/** Two questions that differ only in case, spacing or punctuation are one. */
const sameQuestion = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The paper as it is assembled: how many questions each concept still has
 * room for, and what is already on it. `take` is the one way onto it — it
 * stamps the id and shuffles the options — and refuses (null) a question that
 * would break the allocation or repeat one already asked.
 */
export class Paper {
  readonly questions: ExamQuestion[] = [];
  private readonly left: Map<string, number>;
  private readonly asked = new Set<string>();

  constructor(
    readonly allocation: Readonly<Record<string, number>>,
    private readonly rand: () => number = Math.random,
  ) {
    this.left = new Map(Object.entries(allocation));
  }

  get size(): number {
    return [...Object.values(this.allocation)].reduce((s, n) => s + n, 0);
  }
  get full(): boolean {
    return this.questions.length >= this.size;
  }
  /** The concepts still owed questions, and how many each. */
  remaining(): Record<string, number> {
    return Object.fromEntries([...this.left].filter(([, n]) => n > 0));
  }
  /** Why a draft would be refused, or null when it fits. */
  refusal(d: Draft): string | null {
    if (!this.left.has(d.nodeId)) return `"${d.nodeId}" is not in the plan`;
    if ((this.left.get(d.nodeId) ?? 0) <= 0)
      return `"${d.nodeId}" already has every question the plan gives it`;
    if (this.asked.has(sameQuestion(d.q))) return "it repeats a question already asked";
    return null;
  }
  take(d: Draft): ExamQuestion | null {
    if (this.full || this.refusal(d)) return null;
    this.left.set(d.nodeId, (this.left.get(d.nodeId) ?? 0) - 1);
    this.asked.add(sameQuestion(d.q));
    const question: ExamQuestion = {
      id: `ex-${this.questions.length + 1}`,
      nodeId: d.nodeId,
      q: d.q,
      ...shuffled(d.opts, d.correctIndex, this.rand),
      explain: d.explain,
    };
    this.questions.push(question);
    return question;
  }
  clone(): Paper {
    const copy = new Paper(this.allocation, this.rand);
    copy.left.clear();
    for (const [id, n] of this.left) copy.left.set(id, n);
    for (const q of this.asked) copy.asked.add(q);
    copy.questions.push(...this.questions);
    return copy;
  }
  /** What is still owed, as the correction a model can act on. */
  describeMissing(): string {
    return Object.entries(this.remaining())
      .map(([id, n]) => `${id} ×${n}`)
      .join(", ");
  }
}

/**
 * Validate a model's answer as the questions that fill what `paper` still
 * owes. A single bad, off-plan or repeated question is left off rather than
 * failing the batch; the batch fails only if the paper is still not full,
 * naming what is missing so the corrective retry can write exactly that.
 * Returns the questions taken, in order; `paper` itself is untouched.
 */
export function fillValidator(paper: Paper, ids: ReadonlySet<string>) {
  return (raw: unknown): ExamQuestion[] => {
    const owed = paper.size - paper.questions.length;
    const root = obj(raw, "payload");
    const items = arr(root.questions, "questions", 1, owed + 6);
    const trial = paper.clone();
    const taken: ExamQuestion[] = [];
    const problems: string[] = [];
    items.forEach((v, i) => {
      if (trial.full) return;
      try {
        const draft = checkQuestion(v, `questions[${i}]`, ids);
        const why = trial.refusal(draft);
        if (why) problems.push(`questions[${i}] was left off: ${why}`);
        const q = trial.take(draft);
        if (q) taken.push(q);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err));
      }
    });
    if (!trial.full)
      fail(
        `the paper still needs: ${trial.describeMissing()}${
          problems.length ? ` (${problems.slice(0, 3).join("; ")})` : ""
        }`,
      );
    return taken;
  };
}

/** A whole paper in one validation — the single-shot path's validator. */
export function validateExam(
  allocation: Readonly<Record<string, number>>,
  rand: () => number = Math.random,
) {
  const paper = new Paper(allocation, rand);
  return fillValidator(paper, new Set(Object.keys(allocation)));
}

function examPrompt(
  params: ExamParams,
  plan: Readonly<Record<string, number>>,
  opts: { streamed: boolean; asked: readonly string[] },
): string {
  const { topic, interests, pool, difficulty, language = "en" } = params;
  const count = Object.values(plan).reduce((s, n) => s + n, 0);
  const lines = pool
    .filter((p) => plan[p.id])
    .map((p) => `- ${p.id} — "${p.label}": ${plan[p.id]}`)
    .join("\n");
  const asked = opts.asked.length
    ? `\nThese questions are already on the paper — write different ones, never a rewording of them:\n${opts.asked
        .map((q) => `- ${q.slice(0, 200)}`)
        .join("\n")}\n`
    : "";
  // `work` comes first so the answer is computed before a key is committed
  // to; it is never shown. Keys written first got argued against by `explain`.
  const shape = `{ "nodeId": "one of the ids above", "q": "the question", "work": "solve it yourself, step by step, before writing any option", "opts": ["…", "…", "…", "…"], "correctIndex": 0, "explain": "…" }`;
  const output = opts.streamed
    ? `Write each question as a SEPARATE top-level JSON object, one after another, in the order of the list above — NOT wrapped in an array or an object, no markdown fences, no commentary before/after/between them. Exactly ${count} objects, each with this shape:
${shape}`
    : `Return JSON:
{
  "questions": [
    ${shape},
    ...exactly ${count}
  ]
}`;
  return `Write a MOCK EXAM on "${topic}" for a learner who has just finished studying every concept below. It is a rehearsal for being tested on the whole subject.
${interestNote(interests)}

Write exactly ${count} multiple-choice questions, each with exactly ${EXAM_OPTIONS} options and one correct answer. Tag each with the id of the concept it tests. How many questions each concept gets — exactly this many, no more, no fewer:
${lines}
${asked}
Difficulty — ${DIFFICULTY_NOTE[difficulty]}

Rules:
- Every question stands on its own: a learner reads only that question, never the others.
- Never ask about a concept that is not listed, and never test trivia about the course itself ("which concept comes first").
- Options are parallel in length and form; never "all of the above" or "none of the above"; the right one must not be the longest or the most qualified by habit.
- Write \`work\` first: solve the question in full and check the arithmetic. Then write the options so exactly ONE matches your result, and set \`correctIndex\` to it. If your result matches no option, or more than one, rewrite the options — never ship a key your own working disagrees with.
- \`explain\` agrees with \`correctIndex\` and says in 1-2 sentences why the right answer is right and what mistake the most tempting wrong one makes.
- Questions on the same concept test different things.

${output}${languageNote(language)}`;
}

/** Fill whatever `paper` still owes with one retried single-shot call. */
async function topUp(
  params: ExamParams,
  paper: Paper,
  last = false,
): Promise<ExamQuestion[]> {
  const ids = new Set(Object.keys(paper.allocation));
  const taken = await generateJson(
    user(
      examPrompt(params, paper.remaining(), {
        streamed: false,
        asked: paper.questions.map((q) => q.q),
      }),
    ),
    fillValidator(paper, ids),
    { label: paper.questions.length ? "exam-topup" : "exam" },
  );
  // Validated against a clone; replay onto the real paper the ones whose key
  // holds. The last round keeps a disputed one rather than ship a short paper.
  const holds = last
    ? taken.map(() => true)
    : await Promise.all(taken.map((q) => keyHolds(params, q)));
  return taken
    .filter((_, i) => holds[i])
    .map((q) => paper.take(q))
    .filter((q): q is ExamQuestion => q !== null);
}

/** Top up until full: a round whose disputed keys left it short runs again. */
async function fill(params: ExamParams, paper: Paper): Promise<void> {
  for (let round = 0; !paper.full; round++) await topUp(params, paper, round === 2);
}

export async function generateExam(
  params: ExamParams,
  rand: () => number = Math.random,
): Promise<ExamQuestion[]> {
  const paper = new Paper(examAllocation(params.pool, params.count, rand), rand);
  await fill(params, paper);
  return paper.questions;
}

export async function* generateExamStream(
  params: ExamParams,
  rand: () => number = Math.random,
): AsyncGenerator<StreamFrame> {
  const paper = new Paper(examAllocation(params.pool, params.count, rand), rand);
  const ids = new Set(Object.keys(paper.allocation));
  try {
    const stream = streamJsonObjects(
      user(examPrompt(params, paper.allocation, { streamed: true, asked: [] })),
      (raw, i) => checkQuestion(raw, `questions[${i}]`, ids),
      { label: "exam-stream" },
    );
    for await (const draft of stream) {
      if (paper.refusal(draft) || !(await keyHolds(params, draft))) continue;
      const q = paper.take(draft);
      if (q) yield { p: "questions", i: paper.questions.length - 1, v: q };
      if (paper.full) break;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "exam_stream_fallback",
        landed: paper.questions.length,
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
  }
  if (paper.full) return;
  const from = paper.questions.length;
  await fill(params, paper);
  for (let i = from; i < paper.questions.length; i++)
    yield { p: "questions", i, v: paper.questions[i] };
}
