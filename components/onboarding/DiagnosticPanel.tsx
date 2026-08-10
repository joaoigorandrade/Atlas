"use client";

import { useState } from "react";
import type { DiagnosticDifficulty, DiagnosticQuestion } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { InkDots, InkRule } from "@/components/Pending";
import Rich from "@/components/Rich";

const STRINGS = {
  en: {
    kicker: "Placement · adaptive",
    introTitle: "Your map is built.",
    introBody: (n: number) =>
      `Want a quick placement first? ${n} adaptive questions prune what you already know and light your real frontier. Optional — you can go straight in.`,
    take: "Test my knowledge →",
    skip: "Go straight to my map",
    writing: "Writing the next question…",
    right: "Correct",
    wrong: "Not quite",
    rightWhy: (tag: string) => `${tag} and everything under it is marked known.`,
    wrongWhy: (tag: string) => `We'll fit ${tag} into your map.`,
    answerWas: "The answer:",
    next: "Next question →",
    finish: "See your map →",
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
    introTitle: "Seu mapa está pronto.",
    introBody: (n: number) =>
      `Quer um nivelamento rápido antes? ${n} perguntas adaptativas podam o que você já sabe e acendem sua fronteira real. Opcional — você pode ir direto.`,
    take: "Testar meu conhecimento →",
    skip: "Ir direto para o mapa",
    writing: "Escrevendo a próxima pergunta…",
    right: "Correto",
    wrong: "Quase lá",
    rightWhy: (tag: string) => `${tag} e tudo abaixo dele foi marcado como sabido.`,
    wrongWhy: (tag: string) => `Vamos encaixar ${tag} no seu mapa.`,
    answerWas: "A resposta:",
    next: "Próxima pergunta →",
    finish: "Ver seu mapa →",
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
  /** "Go straight to my map" — the placement is optional (SPEC §2). */
  onSkip: () => void;
  onStart: () => void;
}

export default function DiagnosticPanel({
  questions,
  expected,
  answered,
  onAnswer,
  onSkip,
  onStart,
}: DiagnosticPanelProps) {
  const t = useT(STRINGS);
  // The question just answered, held so its verdict can be read before the
  // next one replaces it. Cleared by "Next question →".
  const [picked, setPicked] = useState<{ q: DiagnosticQuestion; index: number } | null>(
    null,
  );
  // The placement is opt-in: nothing is asked until the learner takes it.
  const [started, setStarted] = useState(false);
  const total = Math.max(expected ?? questions.length, questions.length);
  const done = started && answered >= total && !picked;
  // Answered faster than the writer could write: the next question is real and
  // on its way, it just isn't here yet.
  const question: DiagnosticQuestion | undefined = questions[answered];
  const shown = picked?.q ?? question;
  const correct = picked ? picked.index === picked.q.correctIndex : false;
  const readyToAdvance = answered >= total || !!question;

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
        overflowY: "auto",
        animation: "softIn 0.4s both",
      }}
    >
      <div style={kicker(11)}>{t.kicker}</div>
      {started && (
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
      )}

      {!started && (
        <div style={{ marginTop: "auto", animation: "fadeUp 0.5s both" }}>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              lineHeight: 1.3,
              marginBottom: 8,
            }}
          >
            {t.introTitle}
          </div>
          <div
            style={{
              fontSize: 14,
              color: color.inkMuted,
              lineHeight: 1.55,
              marginBottom: 24,
            }}
          >
            {t.introBody(total)}
          </div>
          <button
            onClick={() => setStarted(true)}
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
            {t.take}
          </button>
          <button
            onClick={onSkip}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 14,
              background: "transparent",
              color: color.inkMuted,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 12,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            {t.skip}
          </button>
        </div>
      )}

      {started && !done && !shown && (
        <div style={{ marginTop: 44, animation: "softIn 0.4s both" }}>
          <InkRule width="100%" />
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontFamily: font.mono,
              fontSize: 12,
              color: color.inkSoft,
              animation: "breathe 2.2s ease-in-out infinite",
            }}
          >
            {t.writing}
            <InkDots />
          </div>
        </div>
      )}

      {started && !done && shown && (
        <div
          key={picked ? `f${answered}` : answered}
          style={{ marginTop: 44, animation: "fadeUp 0.4s both" }}
        >
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
              {shown.tag}
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
              {t.difficulty[shown.difficulty]}
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
            <Rich text={shown.q} />
          </div>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {shown.opts.map((opt, oi) => {
              const isAnswer = picked && oi === shown.correctIndex;
              const isWrongPick = picked && oi === picked.index && !correct;
              return (
                <button
                  key={opt.label}
                  role="radio"
                  aria-checked={picked ? oi === picked.index : false}
                  disabled={!!picked}
                  onClick={() => {
                    setPicked({ q: shown, index: oi });
                    onAnswer(oi);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    padding: "15px 18px",
                    background: isAnswer
                      ? color.successBg
                      : isWrongPick
                        ? color.amberBg
                        : color.card,
                    border: `1px solid ${
                      isAnswer
                        ? color.accent
                        : isWrongPick
                          ? color.amberInk
                          : "rgba(44,40,35,0.16)"
                    }`,
                    borderRadius: 11,
                    fontSize: 15,
                    color: color.ink,
                    opacity: picked && !isAnswer && !isWrongPick ? 0.5 : 1,
                    cursor: picked ? "default" : "pointer",
                    transition: "border-color .2s, background .2s, opacity .2s",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `1.5px solid ${
                        isAnswer
                          ? color.accent
                          : isWrongPick
                            ? color.amberInk
                            : color.hairlineStrong
                      }`,
                      background: isAnswer ? color.accent : "transparent",
                    }}
                  />
                  <Rich text={opt.label} />
                </button>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 13,
              color: color.inkFaint,
              lineHeight: 1.5,
            }}
          >
            <Rich text={shown.note} />
          </div>

          {picked && (
            <div style={{ marginTop: 22, animation: "fadeUp 0.35s both" }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: correct ? color.accent : color.amberInk,
                  marginBottom: 6,
                }}
              >
                {correct ? t.right : t.wrong}
              </div>
              <div style={{ fontSize: 14, color: color.inkMuted, lineHeight: 1.55 }}>
                {!correct && (
                  <>
                    {t.answerWas} <Rich text={shown.opts[shown.correctIndex]?.label} />
                    <br />
                  </>
                )}
                {correct ? t.rightWhy(shown.tag) : t.wrongWhy(shown.tag)}
              </div>
              <button
                onClick={() => setPicked(null)}
                disabled={!readyToAdvance}
                style={{
                  marginTop: 18,
                  width: "100%",
                  padding: 14,
                  background: readyToAdvance ? color.accent : color.chipBg,
                  color: readyToAdvance ? color.accentInk : color.inkFaint,
                  border: "none",
                  borderRadius: 11,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: readyToAdvance ? "pointer" : "default",
                  transition: "background .25s, color .25s",
                }}
              >
                {readyToAdvance ? (
                  answered >= total ? (
                    t.finish
                  ) : (
                    t.next
                  )
                ) : (
                  <InkDots tone={color.inkFaint} />
                )}
              </button>
            </div>
          )}
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
