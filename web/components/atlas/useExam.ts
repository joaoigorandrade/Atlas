"use client";

// The mock exam's owner: the session reducer, and the one request that writes
// a paper. It reads the run (the map, the goal, the language) and writes none
// of it — the exam is a rehearsal over a finished map, not a phase on a node.

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  EXAM_START,
  examPool,
  examReducer,
  type ConceptGraph,
  type ExamDifficulty,
  type ExamSize,
  type GoalKind,
} from "@/lib/curriculum";
import { fetchExam } from "@/lib/apiExam";
import type { Language } from "@/lib/i18n";
import type { ToastChannel } from "@/components/atlas/useToast";

export function useExam(
  form: { topic: string; goal: GoalKind; interests: string },
  graph: ConceptGraph,
  languageRef: React.RefObject<Language>,
  showError: ToastChannel["showError"],
) {
  const { topic, goal, interests } = form;
  const [session, dispatch] = useReducer(examReducer, EXAM_START);
  // Which request is current: a paper that lands after the learner left, or
  // after a second start, must not replace the one they are looking at.
  const ticket = useRef(0);
  const inputs = useRef({ topic, goal, interests, graph });
  inputs.current = { topic, goal, interests, graph };

  // A different map is a different exam — what was sat on the last one goes.
  useEffect(() => {
    ticket.current++;
    dispatch({ type: "reset" });
  }, [topic]);

  const start = useCallback(
    (count: ExamSize, difficulty: ExamDifficulty) => {
      const mine = ++ticket.current;
      const { topic, goal, interests, graph } = inputs.current;
      dispatch({ type: "configure", count, difficulty });
      dispatch({ type: "writing" });
      const retry = () => start(count, difficulty);
      fetchExam({
        topic,
        goal,
        interests,
        pool: examPool(graph),
        count,
        difficulty,
        language: languageRef.current ?? "en",
      })
        .then((questions) => {
          if (ticket.current === mine) dispatch({ type: "loaded", questions });
        })
        .catch((err: unknown) => {
          if (ticket.current !== mine) return;
          dispatch({ type: "failed", error: "write" });
          showError(err, { context: "content", retry });
        });
    },
    [languageRef, showError],
  );

  const configure = useCallback(
    (patch: { count?: ExamSize; difficulty?: ExamDifficulty }) =>
      dispatch({ type: "configure", ...patch }),
    [],
  );
  const pick = useCallback((choice: number) => dispatch({ type: "pick", choice }), []);
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const back = useCallback(() => dispatch({ type: "back" }), []);
  /** Back to the setup page, keeping the size and difficulty last chosen. */
  const toSetup = useCallback(() => {
    ticket.current++;
    dispatch({ type: "setup" });
  }, []);

  // The map the exam is over, beside the session that is sat on it.
  return { topic, graph, session, configure, start, pick, next, back, toSetup };
}

export type ExamState = ReturnType<typeof useExam>;
