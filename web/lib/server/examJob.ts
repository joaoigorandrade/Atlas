// The `exam` job: a mock exam over a finished map. Its own module because
// `job.ts` resolves the per-node kinds, and this one belongs to no node — it
// spans the whole pool.

import { asExamDifficulty, asExamSize } from "@/lib/curriculum";
import type { Language } from "@/lib/i18n";
import { generateExam, generateExamStream } from "@/lib/server/generate/exam";
import { badRequest, poolOf, type GenerateBody } from "./jobInput";
import type { Job } from "./job";

export function examJob(
  body: GenerateBody,
  base: { topic: string; interests: string; language: Language },
): Job {
  const pool = poolOf(body);
  if (pool.length === 0) throw badRequest("pool must list the map's concepts");
  const params = {
    ...base,
    goal: "glance" as const,
    pool,
    count: asExamSize(body.count),
    difficulty: asExamDifficulty(body.difficulty),
  };
  // Never cached: a retake is meant to be a new paper, and a cached one would
  // hand the same learner the questions they just saw the answers to.
  return {
    kind: "exam",
    key: null,
    run: async () => ({ questions: await generateExam(params) }),
    // One frame per question, so the learner starts on question 1 while the
    // rest are written. The generator tops up whatever its stream dropped, so
    // a complete paper is exactly the size asked for.
    stream: () => generateExamStream(params),
    shape: { questions: { min: params.count, max: params.count } },
  };
}
