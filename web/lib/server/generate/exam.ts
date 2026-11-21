// ---- kind: exam --------------------------------------------------------------
// A mock exam over a whole finished map: N four-option questions spread across
// its concepts, at the difficulty the learner chose. Never cached — a retake is
// meant to be a fresh paper, not the one they just sat.
//
// Ids, the per-concept allocation and the option order are all decided here,
// never trusted from the model: models put the right answer in the same slot
// far more often than chance, and an exam whose key is "B" tests nothing.

import {
  EXAM_OPTIONS,
  examAllocation,
  type ExamDifficulty,
  type ExamQuestion,
  type GoalKind,
} from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";
import { arr, fail, interestNote, languageNote, obj, slug, str, user } from "./common";

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

/** Validates the model's paper against the pool and the requested size, then
 *  stamps ids and shuffles every question's options. */
export function validateExam(
  pool: ReadonlyArray<{ id: string }>,
  count: number,
  rand: () => number = Math.random,
) {
  const ids = new Set(pool.map((p) => p.id));
  return (raw: unknown): ExamQuestion[] => {
    const root = obj(raw, "payload");
    // A paper a question or two long is still the paper they asked for; one
    // that comes back short is not.
    const items = arr(root.questions, "questions", count, count + 3).slice(0, count);
    const seen = new Set<string>();
    return items.map((v, i) => {
      const r = obj(v, `questions[${i}]`);
      const nodeId = slug(r.nodeId, `questions[${i}].nodeId`);
      if (!ids.has(nodeId))
        fail(`questions[${i}].nodeId "${nodeId}" is not one of the listed concepts`);
      const q = str(r.q, `questions[${i}].q`);
      if (seen.has(q.toLowerCase())) fail(`questions[${i}] repeats an earlier question`);
      seen.add(q.toLowerCase());
      const opts = arr(r.opts, `questions[${i}].opts`, EXAM_OPTIONS, EXAM_OPTIONS).map(
        (o, j) => str(o, `questions[${i}].opts[${j}]`),
      );
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
        fail(`questions[${i}].opts must be four different answers`);
      const key = r.correctIndex;
      if (
        typeof key !== "number" ||
        !Number.isInteger(key) ||
        key < 0 ||
        key >= EXAM_OPTIONS
      )
        fail(`questions[${i}].correctIndex must be an integer 0-${EXAM_OPTIONS - 1}`);
      return {
        id: `ex-${i + 1}`,
        nodeId,
        q,
        ...shuffled(opts, key, rand),
        explain: str(r.explain, `questions[${i}].explain`),
      };
    });
  };
}

export async function generateExam(params: ExamParams): Promise<ExamQuestion[]> {
  const { topic, goal, interests, pool, count, difficulty, language = "en" } = params;
  const allocation = examAllocation(pool, count);
  const plan = pool
    .filter((p) => allocation[p.id])
    .map((p) => `- ${p.id} — "${p.label}": ${allocation[p.id]}`)
    .join("\n");
  return generateJson(
    user(
      `Write a MOCK EXAM on "${topic}" for a learner who has just finished studying every concept below. It is a rehearsal for being tested on the whole subject${goal === "exam" ? " — they are preparing for a real exam, so write in the register and style of one" : ""}.
${interestNote(interests)}

Write exactly ${count} multiple-choice questions, each with exactly ${EXAM_OPTIONS} options and one correct answer. Tag each with the id of the concept it tests. How many questions each concept gets:
${plan}

Difficulty — ${DIFFICULTY_NOTE[difficulty]}

Rules:
- Every question stands on its own: a learner reads only that question, never the others.
- Never ask about a concept that is not listed, and never test trivia about the course itself ("which concept comes first").
- Options are parallel in length and form; never "all of the above" or "none of the above"; the right one must not be the longest or the most qualified by habit.
- \`explain\` says in 1-2 sentences why the right answer is right and what mistake the most tempting wrong one makes.
- Questions on the same concept test different things.

Return JSON:
{
  "questions": [
    { "nodeId": "one of the ids above", "q": "the question", "opts": ["…", "…", "…", "…"], "correctIndex": 0, "explain": "…" },
    ...exactly ${count}
  ]
}${languageNote(language)}`,
    ),
    validateExam(pool, count),
    { label: "exam" },
  );
}
