"use client";

import { useState } from "react";
import type {
  DiagnosticDifficulty,
  DiagnosticEffect,
  DiagnosticQuestion,
  DiagnosticAnswer as Answer,
} from "@/lib/curriculum";
import { color, font, kicker, transition } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { InkDots, InkRule } from "@/components/Pending";
import { gradeDiagnostic } from "@/lib/curriculum";
import Rich from "@/components/Rich";
import DiagnosticAnswer from "@/components/onboarding/DiagnosticAnswers";

const STRINGS = {
  en: {
    kicker: "Placement · adaptive",
    introTitle: "Your map is built.",
    introBody: (n: number) =>
      `Want a quick placement first? ${n} adaptive questions prune what you already know and light your real frontier. Optional — you can go straight in.`,
    take: "Test my knowledge →",
    skip: "Go straight to my map",
    skipRest: "Skip the rest — go to my map",
    writing: "Writing the next question…",
    right: "Correct",
    wrong: "Not quite",
    slip: "Not quite — counted as a slip",
    rightWhy: (tag: string) => `${tag} and everything under it is marked known.`,
    wrongWhy: (tag: string) => `We'll fit ${tag} into your map.`,
    slipWhy: (tag: string) =>
      `You've answered harder questions correctly, so ${tag} stays marked known — nothing was added to your map.`,
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
    skipRest: "Pular o resto — ir para o mapa",
    writing: "Escrevendo a próxima pergunta…",
    right: "Correto",
    wrong: "Quase lá",
    slip: "Quase lá — contado como escorregão",
    rightWhy: (tag: string) => `${tag} e tudo abaixo dele foi marcado como sabido.`,
    wrongWhy: (tag: string) => `Vamos encaixar ${tag} no seu mapa.`,
    slipWhy: (tag: string) =>
      `Você acertou perguntas mais difíceis, então ${tag} continua marcado como sabido — nada foi adicionado ao seu mapa.`,
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
  /** Called with the index of the chosen option. Returns what it actually
   *  wrote to the map, so the verdict copy can tell the truth: a miss the
   *  placement discounts as a slip prunes the concept rather than adding to
   *  the map, and saying otherwise describes a map the learner doesn't have. */
  onAnswer: (answer: Answer) => DiagnosticEffect;
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
  const [picked, setPicked] = useState<{
    q: DiagnosticQuestion;
    answer: Answer;
    effect: DiagnosticEffect;
  } | null>(null);
  // The placement is opt-in: nothing is asked until the learner takes it.
  const [started, setStarted] = useState(false);
  const total = Math.max(expected ?? questions.length, questions.length);
  const done = started && answered >= total && !picked;
  // Answered faster than the writer could write: the next question is real and
  // on its way, it just isn't here yet.
  const question: DiagnosticQuestion | undefined = questions[answered];
  const shown = picked?.q ?? question;
  const correct = picked ? gradeDiagnostic(picked.q, picked.answer) : false;
  // A miss the placement discounted: wrong answer, but it wrote back as known.
  const slipped = !!picked && !correct && picked.effect === "mastered";
  const readyToAdvance = answered >= total || !!question;

  return (
    <div
      data-testid="screen-diagnostic"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        // A leaf laid over the chart's right edge, opaque: blurring the map
        // behind it cost a full re-blur on every frame of the build.
        background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
        borderLeft: `3px double ${color.rule}`,
        boxShadow: "-12px 0 30px rgba(43,33,24,0.12)",
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
                background: i < answered ? color.accent : "rgba(43,33,24,0.12)",
                transition: transition("background"),
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
          <Button data-testid="action-take-placement" onClick={() => setStarted(true)}>
            {t.take}
          </Button>
          <button
            className="at-press"
            onClick={onSkip}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 14,
              background: "transparent",
              color: color.inkMuted,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 3,
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
                borderRadius: 2,
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
          <DiagnosticAnswer
            question={shown}
            picked={picked?.answer}
            correct={correct}
            onAnswer={(answer) =>
              setPicked({ q: shown, answer, effect: onAnswer(answer) })
            }
          />
          {picked && (
            <div style={{ marginTop: 22, animation: "fadeUp 0.35s both" }}>
              {/* What the answer changed about the map. It used to render with
                  the options still unanswered, where a sentence like "this
                  places ATP and O₂ before the Calvin cycle" reads as the
                  answer key. */}
              <div style={{ fontSize: 13, color: color.inkMuted, lineHeight: 1.5 }}>
                <Rich text={shown.note} />
              </div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: correct ? color.accent : color.amberInk,
                  margin: "14px 0 6px",
                }}
              >
                {correct ? t.right : slipped ? t.slip : t.wrong}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: color.inkMuted,
                  lineHeight: 1.55,
                }}
              >
                {!correct && (
                  <>
                    {t.answerWas}{" "}
                    <Rich
                      text={
                        (shown.type ?? "mcq") === "mcq"
                          ? (shown.opts[shown.correctIndex]?.label ?? "")
                          : (shown.expected ?? []).join(
                              shown.type === "order" ? " → " : " / ",
                            )
                      }
                    />
                    <br />
                  </>
                )}
                {correct
                  ? t.rightWhy(shown.tag)
                  : slipped
                    ? t.slipWhy(shown.tag)
                    : t.wrongWhy(shown.tag)}
              </div>
              <button
                className="at-press"
                data-testid="action-next"
                onClick={() => setPicked(null)}
                disabled={!readyToAdvance}
                style={{
                  marginTop: 18,
                  width: "100%",
                  padding: 14,
                  background: readyToAdvance ? color.accent : color.chipBg,
                  color: readyToAdvance ? color.accentInk : color.inkFaint,
                  border: "none",
                  borderRadius: 3,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: readyToAdvance ? "pointer" : "default",
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

      {started && !done && (
        // The placement stays optional after it starts: a question that never
        // arrives (a hung write, not a rejected one) would otherwise trap the
        // learner on "Writing the next question…" with no way to the map.
        <button
          className="at-press"
          onClick={onSkip}
          style={{
            marginTop: 26,
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 13,
            color: color.inkFaint,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {t.skipRest}
        </button>
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
          <Button data-testid="action-start" onClick={onStart}>
            {t.start}
          </Button>
        </div>
      )}
    </div>
  );
}
