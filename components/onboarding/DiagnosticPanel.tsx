"use client";

import type { DiagnosticDifficulty, DiagnosticQuestion } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Placement · adaptive",
    writing: "Writing the next question…",
    readyTitle: "Your map is ready.",
    readyBody:
      "We pruned what you already own and lit your frontier — the concepts you’re ready to learn next.",
    start: "Start here →",
    difficulty: { easy: "Easy", medium: "Medium", hard: "Hard" } as Record<
      DiagnosticDifficulty,
      string
    >,
  },
  "pt-BR": {
    kicker: "Nivelamento · adaptativo",
    writing: "Escrevendo a próxima pergunta…",
    readyTitle: "Seu mapa está pronto.",
    readyBody:
      "Podamos o que você já domina e acendemos sua fronteira — os conceitos que você está pronto para aprender agora.",
    start: "Começar →",
    difficulty: { easy: "Fácil", medium: "Médio", hard: "Difícil" } as Record<
      DiagnosticDifficulty,
      string
    >,
  },
} as const;

interface DiagnosticPanelProps {
  /** The generated placement questions for this topic, fetched one at a time
   *  as each is answered — the next difficulty depends on the last answer. */
  questions: DiagnosticQuestion[];
  /** How many questions this placement will ask in total. Distinct from
   *  `questions.length`, which grows as the stream lands — deriving "done"
   *  from the array would declare the map ready after question 1 and then
   *  take it back when question 2 arrived. */
  expected?: number;
  /** Number of questions answered so far. */
  answered: number;
  /** Called with the index of the chosen option — its effect writes back. */
  onAnswer: (optionIndex: number) => void;
  onStart: () => void;
}

export default function DiagnosticPanel({
  questions,
  expected,
  answered,
  onAnswer,
  onStart,
}: DiagnosticPanelProps) {
  const t = useT(STRINGS);
  const total = Math.max(expected ?? questions.length, questions.length);
  const done = answered >= total;
  // Answered faster than the writer could write: the next question is real and
  // on its way, it just isn't here yet.
  const question: DiagnosticQuestion | undefined = questions[answered];

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        background: "rgba(248,246,240,0.92)",
        backdropFilter: "blur(6px)",
        borderLeft: `1px solid ${color.hairline}`,
        padding: "52px 44px",
        display: "flex",
        flexDirection: "column",
        animation: "softIn 0.4s both",
      }}
    >
      <div style={kicker(11)}>{t.kicker}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 3,
              background: i < answered ? color.accent : "rgba(44,40,35,0.12)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>

      {!done && !question && (
        <div
          style={{
            marginTop: 44,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.inkSoft,
            animation: "softIn 0.4s both",
          }}
        >
          {t.writing}
        </div>
      )}

      {!done && question && (
        <div key={answered} style={{ marginTop: 44, animation: "fadeUp 0.4s both" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.amberInk,
              }}
            >
              {question.tag}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: color.inkGhost,
                padding: "3px 8px",
                borderRadius: 6,
                border: `1px solid ${color.hairline}`,
              }}
            >
              {t.difficulty[question.difficulty]}
            </div>
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 27,
              lineHeight: 1.28,
              marginBottom: 30,
            }}
          >
            {question.q}
          </div>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {question.opts.map((opt, oi) => (
              <button
                key={opt.label}
                role="radio"
                aria-checked={false}
                onClick={() => onAnswer(oi)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  padding: "15px 18px",
                  background: color.card,
                  border: "1px solid rgba(44,40,35,0.16)",
                  borderRadius: 11,
                  fontSize: 15,
                  color: color.ink,
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: `1.5px solid ${color.hairlineStrong}`,
                  }}
                />
                {opt.label}
              </button>
            ))}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 13,
              color: color.inkFaint,
              lineHeight: 1.5,
            }}
          >
            {question.note}
          </div>
        </div>
      )}

      {done && (
        <div style={{ marginTop: "auto", animation: "fadeUp 0.5s both" }}>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              lineHeight: 1.3,
              marginBottom: 8,
            }}
          >
            {t.readyTitle}
          </div>
          <div
            style={{
              fontSize: 14,
              color: color.inkMuted,
              lineHeight: 1.55,
              marginBottom: 24,
            }}
          >
            {t.readyBody}
          </div>
          <button
            onClick={onStart}
            style={{
              width: "100%",
              padding: 16,
              background: color.accent,
              color: color.accentInk,
              border: "none",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(47,107,79,0.28)",
            }}
          >
            {t.start}
          </button>
        </div>
      )}
    </div>
  );
}
