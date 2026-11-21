"use client";

// The mock exam sheet: setup → the paper, one question at a time → the result.
// Presentational — the session lives in `useExam`.

import { useMemo } from "react";
import { examPool, examScore } from "@/lib/curriculum";
import type { ExamState } from "@/components/atlas/useExam";
import Sheet from "@/components/Sheet";
import Masthead from "@/components/ui/Masthead";
import ExamSetup from "@/components/session/exam/ExamSetup";
import ExamQuestionCard from "@/components/session/exam/ExamQuestionCard";
import ExamResults from "@/components/session/exam/ExamResults";
import { color } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    back: "← Map",
    kicker: "Mock exam",
    answered: (a: number, n: number) => `${a}/${n} answered`,
  },
  "pt-BR": {
    back: "← Mapa",
    kicker: "Simulado",
    answered: (a: number, n: number) => `${a}/${n} respondidas`,
  },
} as const;

/** The exam's ink: gilt, the colour of a seal on a finished map. */
const ACCENT = color.gilt;

export default function ExamView({
  exam,
  onExit,
  onOpenNode,
}: {
  exam: ExamState;
  onExit: () => void;
  /** Leave for the map with this concept selected. */
  onOpenNode: (nodeId: string) => void;
}) {
  const t = useT(STRINGS);
  const { session, topic, graph } = exam;
  const labels = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n.label] as const)),
    [graph.nodes],
  );
  const labelOf = (id: string) => labels.get(id) ?? id;
  const concepts = examPool(graph).length;
  const question = session.questions[session.index];
  const answered = session.questions.filter(
    (q) => session.picks[q.id] !== undefined,
  ).length;

  return (
    <Sheet data-testid="screen-exam" aria-label={t.kicker}>
      <Masthead
        back={t.back}
        onBack={onExit}
        backTestId="action-exit"
        kicker={t.kicker}
        accent={ACCENT}
        title={topic}
        meta={
          session.stage === "taking" ? (
            <span style={{ fontSize: 13, color: color.inkFaint }}>
              {t.answered(answered, session.questions.length)}
            </span>
          ) : undefined
        }
      />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "34px 20px 120px" }}>
          {(session.stage === "setup" || session.stage === "writing") && (
            <ExamSetup
              concepts={concepts}
              count={session.count}
              difficulty={session.difficulty}
              writing={session.stage === "writing"}
              failed={!!session.error}
              accent={ACCENT}
              onConfigure={exam.configure}
              onStart={() => exam.start(session.count, session.difficulty)}
            />
          )}
          {session.stage === "taking" && question && (
            <ExamQuestionCard
              topic={topic}
              conceptLabel={labelOf(question.nodeId)}
              question={question}
              index={session.index}
              total={session.questions.length}
              pick={session.picks[question.id]}
              accent={ACCENT}
              onPick={exam.pick}
              onNext={exam.next}
              onBack={exam.back}
            />
          )}
          {session.stage === "done" && (
            <ExamResults
              score={examScore(session.questions, session.picks)}
              questions={session.questions}
              picks={session.picks}
              labelOf={labelOf}
              accent={ACCENT}
              onOpenNode={onOpenNode}
              onRetake={() => exam.start(session.count, session.difficulty)}
              onSetup={exam.toSetup}
              onExit={onExit}
            />
          )}
        </div>
      </div>
    </Sheet>
  );
}
