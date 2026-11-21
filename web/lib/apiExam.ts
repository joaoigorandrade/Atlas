// The mock exam's client: one uncacheable request for a whole paper. Its own
// module beside `apiJudge.ts` because `api.ts` is the per-node content client,
// and an exam is addressed by no node and never read back out of the cache.

import { collectFrames, fetchStream } from "./api";
import type { ExamDifficulty, ExamQuestion, ExamSize, GoalKind } from "./curriculum";
import type { Language } from "./i18n";

export interface ExamRequest {
  topic: string;
  goal: GoalKind;
  interests: string;
  pool: Array<{ id: string; label: string }>;
  count: ExamSize;
  difficulty: ExamDifficulty;
  language: Language;
}

/** The paper, streamed: `onQuestion` fires as each question is written, so
 *  the learner starts on question 1 while the rest arrive. Resolves with the
 *  whole paper; throws if it stopped short (what had landed was already
 *  handed to `onQuestion`). */
export async function fetchExamStream(
  params: ExamRequest,
  onQuestion: (question: ExamQuestion) => void,
): Promise<ExamQuestion[]> {
  const frames = await fetchStream({ kind: "exam", ...params }, (frame) => {
    if (frame.p === "questions" && "i" in frame && !frame.partial)
      onQuestion(frame.v as ExamQuestion);
  });
  return collectFrames<ExamQuestion>(frames, "questions");
}
