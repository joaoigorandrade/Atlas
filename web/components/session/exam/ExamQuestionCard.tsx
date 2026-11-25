"use client";

// One question of the paper. Asked open-ended first, like every question in
// the app: the learner's own words are judged onto the option they mean, and
// the choices are one toggle away. Nothing says right or wrong here — a mock
// exam shows the key at the end, the way the real one does.

import { useEffect, useRef, useState } from "react";
import type { ExamQuestion } from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import Button from "@/components/ui/Button";
import Plate from "@/components/ui/Plate";
import Rich from "@/components/Rich";
import { color, font, kicker, alpha } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { InkDots } from "@/components/Pending";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `Question ${a} of ${b}`,
    placeholder: "Your answer, in your own words…",
    submit: "Record answer →",
    readAs: "Read as:",
    yourChoice: "Your choice:",
    noMatch: "None of the choices — this will count as a miss.",
    next: "Next question →",
    waiting: "Writing the next question…",
    finish: "Finish exam →",
    previous: "← Previous",
    change: "Change answer",
  },
  "pt-BR": {
    of: (a: number, b: number) => `Questão ${a} de ${b}`,
    placeholder: "Sua resposta, com suas palavras…",
    submit: "Registrar resposta →",
    readAs: "Entendida como:",
    yourChoice: "Sua escolha:",
    noMatch: "Nenhuma das alternativas — vai contar como erro.",
    next: "Próxima questão →",
    waiting: "Escrevendo a próxima questão…",
    finish: "Terminar simulado →",
    previous: "← Anterior",
    change: "Mudar resposta",
  },
} as const;

const LETTERS = ["A", "B", "C", "D"];

export default function ExamQuestionCard({
  topic,
  conceptLabel,
  question,
  index,
  total,
  pick,
  written,
  waiting,
  accent,
  onPick,
  onNext,
  onBack,
}: {
  topic: string;
  conceptLabel?: string;
  question: ExamQuestion;
  index: number;
  total: number;
  /** The option recorded for this question, -1 for no match, undefined if unanswered. */
  pick: number | undefined;
  /** What the learner wrote, when the pick came from their own words. */
  written: string | undefined;
  /** The next question is still being written — "next" has to wait for it. */
  waiting: boolean;
  accent: string;
  /** Records an answer on the question with this id — addressed by id, since
   *  an own-words answer is read after the learner may have moved on. */
  onPick: (id: string, choice: number, text?: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useT(STRINGS);
  // Kept across questions: a learner who switched to the choices meant it.
  const [mode, setMode] = useState<AnswerMode>("open");
  // An own-words answer is recorded, then shown as the option it was read as;
  // "Change answer" reopens the box on their draft, without losing the pick.
  const [rewriting, setRewriting] = useState(false);
  // Which question is on screen now, for a judged answer that comes back late.
  const current = useRef(question.id);
  useEffect(() => {
    current.current = question.id;
    setRewriting(false);
  }, [question.id]);
  const last = index + 1 >= total;
  const showOpen = mode === "open" && (pick === undefined || rewriting);
  const switchMode = (m: AnswerMode) => (setMode(m), setRewriting(false));

  return (
    <Plate style={{ padding: "26px 28px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <span style={kicker(10.5, "0.12em", accent)}>{t.of(index + 1, total)}</span>
        <AnswerModeToggle mode={mode} onMode={switchMode} accent={accent} />
      </div>
      {conceptLabel && (
        <div style={{ ...kicker(9.5, "0.1em"), marginBottom: 8 }}>{conceptLabel}</div>
      )}
      <div
        data-testid="exam-question"
        style={{
          fontFamily: font.serif,
          fontSize: 19,
          lineHeight: 1.5,
          marginBottom: 20,
        }}
      >
        <Rich text={question.q} />
      </div>

      {showOpen ? (
        <OpenAnswer
          // A fresh box per question: a draft must not carry over to the next.
          key={question.id}
          topic={topic}
          nodeLabel={conceptLabel}
          question={question.q}
          options={question.opts}
          accent={accent}
          placeholder={t.placeholder}
          submitLabel={t.submit}
          initialText={written}
          onResolve={(i, _read, text) => {
            // Recorded on the question it answers, wherever the learner is now.
            onPick(question.id, i, text);
            if (current.current === question.id) setRewriting(false);
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "open" && (
            <div style={{ fontSize: 13, color: color.inkMuted }}>
              {pick === -1 ? t.noMatch : written ? t.readAs : t.yourChoice}
            </div>
          )}
          {question.opts.map((opt, i) => {
            const chosen = pick === i;
            // In own-words mode only the option their answer was read as shows.
            if (mode === "open" && !chosen) return null;
            return (
              <button
                key={i}
                className="at-press"
                data-testid={`action-pick-${i}`}
                aria-pressed={chosen}
                onClick={() => {
                  if (mode !== "choices") return;
                  setRewriting(false);
                  onPick(question.id, i);
                }}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "baseline",
                  textAlign: "left",
                  padding: "13px 15px",
                  borderRadius: 3,
                  cursor: mode === "choices" ? "pointer" : "default",
                  border: `1px solid ${chosen ? accent : color.hairlineStrong}`,
                  background: chosen ? `${alpha(accent, 12)}` : color.card,
                  color: color.ink,
                  fontFamily: font.serif,
                  fontSize: 16,
                  lineHeight: 1.45,
                }}
              >
                <span
                  style={{
                    fontFamily: font.caps,
                    color: chosen ? accent : color.inkFaint,
                  }}
                >
                  {LETTERS[i]}
                </span>
                <span>
                  <Rich text={opt} />
                </span>
              </button>
            );
          })}
          {mode === "open" && (
            <Button
              variant="quiet"
              data-testid="action-exam-change"
              onClick={() => setRewriting(true)}
            >
              {t.change}
            </Button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center" }}>
        {index > 0 && (
          <Button variant="quiet" data-testid="action-exam-back" onClick={onBack}>
            {t.previous}
          </Button>
        )}
        <div style={{ flex: 1 }}>
          <Button
            data-testid="action-exam-next"
            accent={accent}
            disabled={pick === undefined || rewriting || waiting}
            onClick={onNext}
          >
            {waiting ? (
              <>
                <InkDots size={3.5} /> {t.waiting}
              </>
            ) : last ? (
              t.finish
            ) : (
              t.next
            )}
          </Button>
        </div>
      </div>
    </Plate>
  );
}
