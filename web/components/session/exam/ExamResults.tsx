"use client";

// The exam's last page: the score, the concepts it found weak, and the key —
// every question with what they answered, what was right, and why.

import type { ExamQuestion, ExamScore } from "@/lib/curriculum";
import { EXAM_PASS_PCT, STATE_COLOR } from "@/lib/curriculum";
import Button from "@/components/ui/Button";
import Plate from "@/components/ui/Plate";
import Rich from "@/components/Rich";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    result: "Result",
    score: (c: number, n: number) => `${c} of ${n} correct`,
    passed: (pct: number) =>
      `Passed — at or above ${pct}%. The map holds up under a paper, not only under its own phases.`,
    notPassed: (pct: number) =>
      `Below ${pct}% — the concepts below are where to go back to before the real thing.`,
    byConcept: "By concept · weakest first",
    open: "Open on map →",
    key: "The key",
    yours: "Your answer",
    noAnswer: "No matching choice",
    right: "Correct answer",
    retake: "New paper, same settings",
    settings: "Change size or difficulty",
    exit: "Back to the map",
  },
  "pt-BR": {
    result: "Resultado",
    score: (c: number, n: number) => `${c} de ${n} corretas`,
    passed: (pct: number) =>
      `Aprovado — ${pct}% ou mais. O mapa se sustenta numa prova, não só nas próprias fases.`,
    notPassed: (pct: number) =>
      `Abaixo de ${pct}% — os conceitos abaixo são onde voltar antes da prova de verdade.`,
    byConcept: "Por conceito · os mais fracos primeiro",
    open: "Abrir no mapa →",
    key: "O gabarito",
    yours: "Sua resposta",
    noAnswer: "Nenhuma alternativa correspondente",
    right: "Resposta correta",
    retake: "Nova prova, mesmas configurações",
    settings: "Mudar tamanho ou dificuldade",
    exit: "Voltar ao mapa",
  },
} as const;

export default function ExamResults({
  score,
  questions,
  picks,
  labelOf,
  accent,
  onOpenNode,
  onRetake,
  onSetup,
  onExit,
}: {
  score: ExamScore;
  questions: ExamQuestion[];
  picks: Record<string, number>;
  labelOf: (nodeId: string) => string;
  accent: string;
  onOpenNode: (nodeId: string) => void;
  onRetake: () => void;
  onSetup: () => void;
  onExit: () => void;
}) {
  const t = useT(STRINGS);
  const tone = score.passed ? STATE_COLOR.mastered : STATE_COLOR.shaky;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Plate
        data-testid="exam-result"
        style={{ padding: "28px 30px", textAlign: "center" }}
      >
        <div style={kicker(10.5, "0.14em")}>{t.result}</div>
        <div
          style={{ fontFamily: font.display, fontSize: 64, lineHeight: 1, color: tone }}
        >
          {score.pct}%
        </div>
        <div style={{ marginTop: 6, fontSize: 17 }}>
          {t.score(score.correct, score.total)}
        </div>
        <p
          style={{
            margin: "12px auto 0",
            maxWidth: 460,
            fontSize: 15,
            color: color.inkSoft,
          }}
        >
          {score.passed ? t.passed(EXAM_PASS_PCT) : t.notPassed(EXAM_PASS_PCT)}
        </p>
      </Plate>

      <Plate style={{ padding: "22px 24px" }}>
        <div style={{ ...kicker(10, "0.12em"), marginBottom: 12 }}>{t.byConcept}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {score.byConcept.map((row) => {
            const share = row.correct / row.total;
            const ink =
              share === 1
                ? STATE_COLOR.mastered
                : share >= 0.5
                  ? color.amberInk
                  : STATE_COLOR.gap;
            return (
              <div
                key={row.nodeId}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>
                  {labelOf(row.nodeId)}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: ink }}>
                  {row.correct}/{row.total}
                </span>
                {share < 1 && (
                  <Button
                    variant="quiet"
                    data-testid={`action-exam-node-${row.nodeId}`}
                    style={{ fontSize: 13.5 }}
                    onClick={() => onOpenNode(row.nodeId)}
                  >
                    {t.open}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Plate>

      <div>
        <div style={{ ...kicker(10, "0.12em"), margin: "4px 0 12px" }}>{t.key}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q, i) => {
            const pick = picks[q.id];
            const right = pick === q.correctIndex;
            return (
              <Plate key={q.id} style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span
                    aria-hidden
                    style={{
                      color: right ? STATE_COLOR.mastered : STATE_COLOR.gap,
                      fontSize: 15,
                    }}
                  >
                    {right ? "✓" : "✗"}
                  </span>
                  <div style={{ flex: 1, fontSize: 16, lineHeight: 1.5 }}>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: color.inkFaint,
                      }}
                    >
                      {i + 1}.{" "}
                    </span>
                    <Rich text={q.q} />
                  </div>
                </div>
                <div style={{ margin: "10px 0 0 25px", fontSize: 14.5, lineHeight: 1.5 }}>
                  {!right && (
                    <div style={{ color: STATE_COLOR.gap }}>
                      {t.yours}: {pick >= 0 ? <Rich text={q.opts[pick]} /> : t.noAnswer}
                    </div>
                  )}
                  <div style={{ color: STATE_COLOR.mastered }}>
                    {t.right}: <Rich text={q.opts[q.correctIndex]} />
                  </div>
                  <div style={{ marginTop: 6, color: color.inkMuted }}>
                    <Rich text={q.explain} />
                  </div>
                </div>
              </Plate>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Button data-testid="action-exam-retake" accent={accent} onClick={onRetake}>
          {t.retake}
        </Button>
        <Button
          variant="secondary"
          accent={accent}
          data-testid="action-exam-setup"
          onClick={onSetup}
        >
          {t.settings}
        </Button>
        <Button variant="quiet" data-testid="action-exam-exit" onClick={onExit}>
          {t.exit}
        </Button>
      </div>
    </div>
  );
}
