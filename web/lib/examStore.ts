// Where a map's mock exam is kept: this device's `localStorage`, one entry per
// topic. A finished paper's score and the paper being sat are a learner's own
// rehearsal on one screen — not mastery, not content — so they ride beside the
// run rather than in it, and a reload resumes where the learner was.
//
// Every access is guarded: storage can be full, blocked, or missing (a private
// window), and the exam must work the same without it.

import { EMPTY_EXAM_SAVE, parseExamSave, type ExamSave } from "@/lib/curriculum";

const KEY = (topicId: string) => `atlas.exam.v1.${topicId}`;

export function loadExamSave(topicId: string | null): ExamSave {
  if (!topicId || typeof window === "undefined") return EMPTY_EXAM_SAVE;
  try {
    const raw = window.localStorage.getItem(KEY(topicId));
    return raw ? parseExamSave(JSON.parse(raw)) : EMPTY_EXAM_SAVE;
  } catch {
    return EMPTY_EXAM_SAVE;
  }
}

export function storeExamSave(topicId: string | null, save: ExamSave): void {
  if (!topicId || typeof window === "undefined") return;
  try {
    if (!save.session && save.attempts.length === 0)
      window.localStorage.removeItem(KEY(topicId));
    else window.localStorage.setItem(KEY(topicId), JSON.stringify(save));
  } catch {
    // Full or blocked storage costs the resume, never the exam.
  }
}
