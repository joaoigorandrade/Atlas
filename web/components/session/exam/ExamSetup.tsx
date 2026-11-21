"use client";

// The exam's first page: how many questions, how hard. Nothing is written
// until the learner presses start, so changing their mind costs nothing.

import {
  EXAM_DIFFICULTIES,
  EXAM_SIZES,
  type ExamDifficulty,
  type ExamSize,
} from "@/lib/curriculum";
import Button from "@/components/ui/Button";
import Plate from "@/components/ui/Plate";
import { InkDots } from "@/components/Pending";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    title: "Mock exam",
    lede: (concepts: number) =>
      `Every concept on this map is mastered. Sit a paper across all ${concepts} of them — answer in your own words or pick from the choices, and see the key only at the end.`,
    questions: "Questions",
    difficulty: "Difficulty",
    levels: { easy: "Easy", medium: "Medium", hard: "Hard" },
    levelNotes: {
      easy: "Recognition — what each concept is and when it applies.",
      medium: "Application — short cases to work each concept on.",
      hard: "Exam-grade — multi-step, unfamiliar cases, concepts combined.",
    },
    minutes: (min: number) => `About ${min} min`,
    start: "Write my exam →",
    writing: "Writing your paper…",
    failed: "That paper didn't come through. Try again.",
  },
  "pt-BR": {
    title: "Simulado",
    lede: (concepts: number) =>
      `Todos os conceitos deste mapa estão dominados. Faça uma prova sobre os ${concepts} — responda com suas palavras ou escolha entre as alternativas, e veja o gabarito só no fim.`,
    questions: "Questões",
    difficulty: "Dificuldade",
    levels: { easy: "Fácil", medium: "Média", hard: "Difícil" },
    levelNotes: {
      easy: "Reconhecimento — o que é cada conceito e quando se aplica.",
      medium: "Aplicação — casos curtos para trabalhar cada conceito.",
      hard: "Nível de prova — vários passos, casos novos, conceitos combinados.",
    },
    minutes: (min: number) => `Cerca de ${min} min`,
    start: "Gerar meu simulado →",
    writing: "Escrevendo sua prova…",
    failed: "A prova não chegou. Tente de novo.",
  },
} as const;

/** Minutes a question takes, by difficulty — the estimate under the button. */
const MIN_PER_QUESTION: Record<ExamDifficulty, number> = {
  easy: 0.75,
  medium: 1.5,
  hard: 2.5,
};

function Chip({
  active,
  label,
  testId,
  accent,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  testId: string;
  accent: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="at-press"
      data-testid={testId}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "11px 0",
        borderRadius: 3,
        cursor: disabled || active ? "default" : "pointer",
        border: `1px solid ${active ? accent : color.hairlineStrong}`,
        background: active ? accent : color.card,
        color: active ? color.accentInk : color.ink,
        fontFamily: font.caps,
        fontSize: 15,
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </button>
  );
}

export default function ExamSetup({
  concepts,
  count,
  difficulty,
  writing,
  failed,
  accent,
  onConfigure,
  onStart,
}: {
  concepts: number;
  count: ExamSize;
  difficulty: ExamDifficulty;
  writing: boolean;
  failed: boolean;
  accent: string;
  onConfigure: (patch: { count?: ExamSize; difficulty?: ExamDifficulty }) => void;
  onStart: () => void;
}) {
  const t = useT(STRINGS);
  return (
    <Plate style={{ padding: "30px 30px 26px" }}>
      <div style={{ fontFamily: font.display, fontSize: 30, lineHeight: 1.1 }}>
        {t.title}
      </div>
      <p
        style={{
          margin: "10px 0 26px",
          fontSize: 16,
          lineHeight: 1.55,
          color: color.inkSoft,
        }}
      >
        {t.lede(concepts)}
      </p>

      <div style={{ ...kicker(10.5, "0.12em"), marginBottom: 9 }}>{t.questions}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {EXAM_SIZES.map((n) => (
          <Chip
            key={n}
            active={n === count}
            label={String(n)}
            testId={`action-exam-size-${n}`}
            accent={accent}
            disabled={writing}
            onClick={() => onConfigure({ count: n })}
          />
        ))}
      </div>

      <div style={{ ...kicker(10.5, "0.12em"), marginBottom: 9 }}>{t.difficulty}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {EXAM_DIFFICULTIES.map((d) => (
          <Chip
            key={d}
            active={d === difficulty}
            label={t.levels[d]}
            testId={`action-exam-difficulty-${d}`}
            accent={accent}
            disabled={writing}
            onClick={() => onConfigure({ difficulty: d })}
          />
        ))}
      </div>
      <div style={{ marginTop: 9, fontSize: 14, color: color.inkMuted, minHeight: 21 }}>
        {t.levelNotes[difficulty]}
      </div>

      <div style={{ marginTop: 26 }}>
        <Button
          data-testid="action-exam-start"
          accent={accent}
          disabled={writing}
          onClick={onStart}
        >
          {writing ? t.writing : t.start}
        </Button>
        <div
          style={{
            marginTop: 10,
            textAlign: "center",
            fontSize: 13,
            color: failed ? color.dangerInk : color.inkFaint,
          }}
        >
          {writing ? (
            <InkDots />
          ) : failed ? (
            t.failed
          ) : (
            t.minutes(Math.max(1, Math.round(count * MIN_PER_QUESTION[difficulty])))
          )}
        </div>
      </div>
    </Plate>
  );
}
