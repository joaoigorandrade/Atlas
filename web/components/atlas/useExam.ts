"use client";

// The mock exam's owner: the session reducer, the one request that writes a
// paper, and the map's exam book (the paper being sat and the ones finished),
// kept on this device so a reload resumes it. It reads the run (the map, the
// goal, the language) and writes none of it — the exam is a rehearsal over a
// finished map, not a phase on a node.

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  EXAM_BOOK_START,
  examBookReducer,
  examPool,
  examSave,
  type ConceptGraph,
  type ExamDifficulty,
  type ExamSize,
  type GoalKind,
} from "@/lib/curriculum";
import { fetchExamStream } from "@/lib/apiExam";
import { loadExamSave, storeExamSave } from "@/lib/examStore";
import type { Language } from "@/lib/i18n";
import { logWarning } from "@/lib/log";
import type { ToastChannel } from "@/components/atlas/useToast";

const newPaperId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useExam(
  form: { topic: string; goal: GoalKind; interests: string },
  graph: ConceptGraph,
  topicId: string | null,
  languageRef: React.RefObject<Language>,
  showError: ToastChannel["showError"],
) {
  const { topic, goal, interests } = form;
  const [book, dispatch] = useReducer(examBookReducer, EXAM_BOOK_START);
  const inputs = useRef({ topic, goal, interests, graph });
  inputs.current = { topic, goal, interests, graph };

  // A different map is a different exam: open its book, and what was being
  // sat on the last one stays saved under that one.
  useEffect(() => {
    dispatch({ type: "open", topicId, saved: loadExamSave(topicId) });
  }, [topicId]);

  // The book names its own map, so this can never write one map's paper under
  // another's key, even in the render where the map changes.
  useEffect(() => {
    storeExamSave(book.topicId, examSave(book));
  }, [book]);

  const start = useCallback(
    (count: ExamSize, difficulty: ExamDifficulty) => {
      const paperId = newPaperId();
      const { topic, goal, interests, graph } = inputs.current;
      dispatch({ type: "configure", count, difficulty });
      dispatch({ type: "writing", paperId });
      // The reducer drops anything addressed to a paper that is no longer the
      // current one, so a late arrival after the learner left is harmless.
      let arrived = 0;
      fetchExamStream(
        {
          topic,
          goal,
          interests,
          pool: examPool(graph),
          count,
          difficulty,
          language: languageRef.current ?? "en",
        },
        (question) => {
          arrived++;
          dispatch({ type: "arrived", paperId, question });
        },
      )
        .then((questions) => dispatch({ type: "loaded", paperId, questions }))
        .catch((err: unknown) => {
          dispatch({ type: "failed", paperId });
          // Nothing arrived: the setup page says so beside its own start
          // button. Part of a paper did: the learner is mid-question, so the
          // toast is the only place they would see it.
          if (arrived === 0) logWarning("exam_write_failed", err);
          else showError(err, { context: "content" });
        });
    },
    [languageRef, showError],
  );

  const configure = useCallback(
    (patch: { count?: ExamSize; difficulty?: ExamDifficulty }) =>
      dispatch({ type: "configure", ...patch }),
    [],
  );
  const pick = useCallback(
    (id: string, choice: number, text?: string) =>
      dispatch({ type: "pick", id, choice, text }),
    [],
  );
  const next = useCallback(
    () => dispatch({ type: "next", at: new Date().toISOString() }),
    [],
  );
  const back = useCallback(() => dispatch({ type: "back" }), []);
  /** Back to the setup page, keeping the size and difficulty last chosen. */
  const toSetup = useCallback(() => dispatch({ type: "setup" }), []);

  // The map the exam is over, beside the session that is sat on it.
  return {
    topic,
    graph,
    session: book.session,
    attempts: book.attempts,
    configure,
    start,
    pick,
    next,
    back,
    toSetup,
  };
}

export type ExamState = ReturnType<typeof useExam>;
