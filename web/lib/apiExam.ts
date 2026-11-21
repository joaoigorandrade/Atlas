// The mock exam's client: one uncacheable request for a whole paper. Its own
// module beside `apiJudge.ts` because `api.ts` is the per-node content client,
// and an exam is addressed by no node and never read back out of the cache.

import { post } from "./api";
import type { ExamDifficulty, ExamQuestion, ExamSize, GoalKind } from "./curriculum";
import type { Language } from "./i18n";

export async function fetchExam(params: {
  topic: string;
  goal: GoalKind;
  interests: string;
  pool: Array<{ id: string; label: string }>;
  count: ExamSize;
  difficulty: ExamDifficulty;
  language: Language;
}): Promise<ExamQuestion[]> {
  return (await post<{ questions: ExamQuestion[] }>({ kind: "exam", ...params }))
    .questions;
}
