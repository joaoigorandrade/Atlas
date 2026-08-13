"use client";

import { useCallback, useState } from "react";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import {
  PHASES,
  STATE_COLOR,
  VERDICT_COLOR,
  feynmanClean,
  feynmanGapCount,
  feynmanGaps,
  feynmanScaffold,
  verdictLabel,
  type FeynmanBeat,
  type FeynmanSession,
  type TeachVerdict,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import { color, font, kicker, motion, transition } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import type { PresenceState } from "@/lib/motion";

import Rich from "@/components/Rich";
// Feynman borrows the shared state colors: learning blue for the naive
// student's curiosity, mastered green for a clean explanation, gap red for a
// caught error, and the dim unknown grey for a hand-waved skip.
const BLUE = STATE_COLOR.learning;
const GREEN = STATE_COLOR.mastered;
const RED = STATE_COLOR.gap;
const GREY = STATE_COLOR.unknown;

const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session · Feynman",
    confusedStudent: "Confused student",
    phaseTag: "Phase 3b · Feynman",
    promptTitle: "Teach me this like I’ve never heard of it.",
    promptBody:
      "One topic at a time, in your own words. I’ll walk you through the concept piece by piece — what you can’t explain on its own is exactly what you don’t own yet.",
    startTeaching: "Start teaching →",
    dontKnowStart: "I don’t know where to start",
    teachLead: "Teach it back · I’m the student who’s never heard of it",
    stepOf: (n: number, total: number) => `Topic ${n} of ${total}`,
    stepNumber: (n: number) => `Topic ${String(n).padStart(2, "0")}`,
    nextTopic: "Next topic →",
    prevTopic: "← Back",
    skipTopic: "Skip this one",
    remaining: (n: number) => `${n} topic${n === 1 ? "" : "s"} left`,
    placeholderTeach:
      "Explain this piece in your own words — as if I’ve never heard of it",
    placeholderJudging: "Your student is reading what you taught…",
    sendToStudent: "That’s my explanation →",
    listening: "Listening",
    preparing: "Getting your student ready…",
    student: "Student",
    gapReportLead: "Gap report · your explanation, diffed",
    cleanTitle: "Clean teach-back — you covered every piece.",
    handWavedTitle: "Here’s what you never explained.",
    explained: (n: number) => `${n} explained`,
    skipped: (n: number) => `${n} never explained`,
    confused: (n: number) => `${n} confused`,
    jargonLead: "Jargon you leaned on without unpacking",
    jargonNote:
      "You used these as if I already knew them — naming a thing isn’t explaining it.",
    delta: (before: number, after: number) =>
      `Second pass · ${before} gap${before === 1 ? "" : "s"} → ${after}`,
    deltaClean: (before: number) =>
      `Second pass · ${before} gap${before === 1 ? "" : "s"} → clean`,
    wasGap: "was a gap",
    yourWords: "What you taught",
    fixThis: "Fix this →",
    writeBackNote: (gapCount: number, title: string) => (
      <>
        <span style={{ color: RED, fontWeight: 600 }}>
          {gapCount} gap{gapCount === 1 ? "" : "s"}
        </span>{" "}
        will attach under <span style={{ fontStyle: "italic" }}>{title}</span> as
        red sub-nodes — each quotes what you actually said and opens a targeted
        Socratic pass. Fix them here, or carry them to the map and close them in
        the loop.
      </>
    ),
    cleanAdvance: "Clean diff · Connect →",
    attachGaps: (n: number) => `Attach ${n} gap${n === 1 ? "" : "s"} & continue →`,
    teachAgain: "↺ Teach it again from the top",
    targetedPass: "Targeted Socratic pass",
    answerInWords: "Answer the probe in your own words…",
    close: "Close",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão · Feynman",
    confusedStudent: "Aluno confuso",
    phaseTag: "Fase 3b · Feynman",
    promptTitle: "Me ensine isso como se eu nunca tivesse ouvido falar.",
    promptBody:
      "Um tópico de cada vez, com suas próprias palavras. Vou te levar pelo conceito parte por parte — o que você não consegue explicar sozinho é exatamente o que ainda não domina.",
    startTeaching: "Começar a ensinar →",
    dontKnowStart: "Não sei por onde começar",
    teachLead: "Ensine de volta · sou o aluno que nunca ouviu falar disso",
    stepOf: (n: number, total: number) => `Tópico ${n} de ${total}`,
    stepNumber: (n: number) => `Tópico ${String(n).padStart(2, "0")}`,
    nextTopic: "Próximo tópico →",
    prevTopic: "← Voltar",
    skipTopic: "Pular este",
    remaining: (n: number) => `${n} tópico${n === 1 ? "" : "s"} restante${n === 1 ? "" : "s"}`,
    placeholderTeach:
      "Explique esta parte com suas próprias palavras — como se eu nunca tivesse ouvido falar",
    placeholderJudging: "Seu aluno está lendo o que você ensinou…",
    sendToStudent: "É essa a minha explicação →",
    listening: "Ouvindo",
    preparing: "Preparando seu aluno…",
    student: "Aluno",
    gapReportLead: "Relatório de lacunas · sua explicação, comparada",
    cleanTitle: "Explicação limpa — você cobriu cada parte.",
    handWavedTitle: "Aqui está o que você nunca explicou.",
    explained: (n: number) => `${n} explicado${n === 1 ? "" : "s"}`,
    skipped: (n: number) => `${n} nunca explicado${n === 1 ? "" : "s"}`,
    confused: (n: number) => `${n} confuso${n === 1 ? "" : "s"}`,
    jargonLead: "Jargão que você usou sem abrir",
    jargonNote:
      "Você usou estes termos como se eu já os conhecesse — nomear não é explicar.",
    delta: (before: number, after: number) =>
      `Segunda passagem · ${before} lacuna${before === 1 ? "" : "s"} → ${after}`,
    deltaClean: (before: number) =>
      `Segunda passagem · ${before} lacuna${before === 1 ? "" : "s"} → limpo`,
    wasGap: "era lacuna",
    yourWords: "O que você ensinou",
    fixThis: "Corrigir →",
    writeBackNote: (gapCount: number, title: string) => (
      <>
        <span style={{ color: RED, fontWeight: 600 }}>
          {gapCount} lacuna{gapCount === 1 ? "" : "s"}
        </span>{" "}
        {gapCount === 1 ? "vai" : "vão"} se anexar sob{" "}
        <span style={{ fontStyle: "italic" }}>{title}</span> como sub-nós
        vermelhos — cada uma cita o que você realmente disse e abre uma
        passagem socrática focada. Corrija-as aqui, ou leve-as ao mapa e
        feche-as no ciclo.
      </>
    ),
    cleanAdvance: "Diff limpo · Conectar →",
    attachGaps: (n: number) =>
      `Anexar ${n} lacuna${n === 1 ? "" : "s"} e continuar →`,
    teachAgain: "↺ Ensinar de novo desde o início",
    targetedPass: "Passagem socrática focada",
    answerInWords: "Responda à pergunta com suas próprias palavras…",
    close: "Fechar",
  },
} as const;

interface FeynmanViewProps {
  /** Enter/leave state for the shared `Sheet` root — AtlasApp holds this
   *  screen mounted through its exit. */
  presence: PresenceState;
  /** The rubric rows for this node — never shown before the explanation. */
  beats: FeynmanBeat[];
  /** The node being taught back — titles the view. */
  title: string;
  /** The subject — context for judging open-ended fix-pass answers. */
  topic: string;
  session: FeynmanSession;
  /** True while the server judge is diffing the explanation (#26). */
  judging: boolean;
  /** The rubric has finished streaming — the explanation can be diffed against
   *  all of it rather than against the rows that happen to have arrived. */
  ready: boolean;
  onExit: () => void;
  /** Leave the opening prompt and enter the blank page. */
  onBegin: () => void;
  /** The learner's whole explanation, sent for diffing. */
  onTeach: (text: string) => void;
  /** Freeze scaffold — "start with: what problem does this solve?". */
  onScaffold: () => void;
  onOpenFix: (beatId: string) => void;
  onCloseFix: () => void;
  onFix: (index: number) => void;
  onTeachAgain: () => void;
  /** Attach any remaining gaps to the map and advance toward Connect. */
  onAdvance: () => void;
}

export default function FeynmanView({
  title,
  topic,
  beats,
  session,
  judging,
  ready,
  onExit,
  onBegin,
  onTeach,
  onScaffold,
  onOpenFix,
  onCloseFix,
  onFix,
  onTeachAgain,
  onAdvance,
  presence,
}: FeynmanViewProps) {
  const t = useT(STRINGS);

  // The learner's explanation, one topic at a time — spoken or typed, whichever
  // is faster. Held per beat so a step can be revisited without retyping, and
  // cleared when a fresh pass starts.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const setAnswer = useCallback((beatId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [beatId]: value }));
  }, []);

  // One labelled transcript out of the sequence — the judge still diffs a
  // single explanation against the rubric, so nothing downstream changes.
  const send = useCallback(() => {
    const text = beats
      .map((b) => [b.subPoint, (answers[b.id] ?? "").trim()])
      .filter(([, a]) => a)
      .map(([label, a]) => `${label}\n${a}`)
      .join("\n\n");
    if (text && !judging && ready) {
      onTeach(text);
    }
  }, [answers, beats, judging, onTeach, ready]);

  // A fresh pass starts back at topic one; sending does not, so the learner can
  // still read what they taught while the student is reading it.
  const teachAgain = useCallback(() => {
    setAnswers({});
    setStep(0);
    onTeachAgain();
  }, [onTeachAgain]);

  const breadcrumb = PHASES.slice(0, 6).join(" → ");

  return (
    <Sheet presence={presence}>
      {/* Header — ← Map · Session · Feynman · title · the student persona */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          height: 58,
          background: "rgba(248,246,240,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <button
          className="at-press"
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
          }}
        >
          {t.back}
        </button>
        <div style={{ width: 1, height: 20, background: color.hairlineStrong }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: BLUE,
          }}
        >
          {t.sessionLabel}
        </span>
        <div style={{ fontFamily: font.serif, fontSize: 19 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <StudentChip />
      </div>

      {/* Body — the opening prompt, the blank page, then the Gap Report */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {session.reported ? (
          <GapReport
            title={title}
            topic={topic}
            beats={beats}
            session={session}
            onOpenFix={onOpenFix}
            onCloseFix={onCloseFix}
            onFix={onFix}
            onTeachAgain={teachAgain}
            onAdvance={onAdvance}
          />
        ) : !session.started ? (
          <Prompt
            scaffolded={session.scaffolded}
            onBegin={onBegin}
            onScaffold={onScaffold}
          />
        ) : (
          <TeachPage
            beats={beats}
            scaffolded={session.scaffolded}
            answers={answers}
            step={step}
            judging={judging}
            ready={ready}
            onChangeAnswer={setAnswer}
            onStep={setStep}
            onSend={send}
          />
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 24,
          fontFamily: font.mono,
          fontSize: 10.5,
          color: color.inkGhost,
        }}
      >
        {breadcrumb}
      </div>
    </Sheet>
  );
}

/** The confused-student persona badge in the header. */
function StudentChip() {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: color.chipBg,
        border: `1px solid rgba(44,40,35,0.09)`,
        borderRadius: 9,
        padding: "5px 11px",
      }}
    >
      <span style={{ fontSize: 14 }}>🙋</span>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: color.inkFaint,
        }}
      >
        {t.confusedStudent}
      </span>
    </div>
  );
}

/** The opening prompt — the teach-me hero, with the freeze scaffold. */
function Prompt({
  scaffolded,
  onBegin,
  onScaffold,
}: {
  scaffolded: boolean;
  onBegin: () => void;
  onScaffold: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 500, animation: "fadeUp .4s both" }}>
        <div style={{ ...kicker(11), marginBottom: 18, textAlign: "center" }}>
          {t.phaseTag}
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 34,
            lineHeight: 1.18,
            marginBottom: 16,
          }}
        >
          {t.promptTitle}
        </div>
        <div
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: color.inkMuted,
            marginBottom: 30,
          }}
        >
          {t.promptBody}
        </div>
        <button
          className="at-press"
          onClick={onBegin}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "15px 26px",
            background: color.accent,
            color: color.accentInk,
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
          }}
        >
          {t.startTeaching}
        </button>
        <div style={{ marginTop: 18 }}>
          <button
            className="at-press"
            onClick={onScaffold}
            style={{
              background: "none",
              border: "none",
              fontSize: 13.5,
              color: color.inkMuted,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {t.dontKnowStart}
          </button>
        </div>
        {scaffolded && (
          <div
            style={{
              marginTop: 20,
              textAlign: "left",
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.25)",
              borderRadius: 10,
              padding: "13px 15px",
              fontSize: 13.5,
              lineHeight: 1.5,
              color: color.amberInk,
              animation: "fadeUp .25s both",
            }}
          >
            {feynmanScaffold(language)}
          </div>
        )}
      </div>
    </div>
  );
}

/** The teach-back, sequenced. One sub-point at a time instead of one blank
 *  page: the learner explains a piece, moves to the next, and the joined
 *  transcript is what gets diffed. Naming the sub-point costs some of the
 *  "what did you never think to mention" signal — skipping a topic still
 *  reads as a skip, which is what keeps the diagnostic alive.
 *  Voice-first per §SPEC (speaking is closer to real teaching), typing always
 *  beside it. */
function TeachPage({
  beats,
  scaffolded,
  answers,
  step,
  judging,
  ready,
  onChangeAnswer,
  onStep,
  onSend,
}: {
  beats: FeynmanBeat[];
  scaffolded: boolean;
  answers: Record<string, string>;
  step: number;
  judging: boolean;
  ready: boolean;
  onChangeAnswer: (beatId: string, value: string) => void;
  onStep: (index: number) => void;
  onSend: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  // Which way the card should fly in — set by the control that moved the step.
  const [dir, setDir] = useState<"next" | "prev">("next");
  const at = Math.min(step, Math.max(beats.length - 1, 0));
  const beat = beats[at];
  const answered = beats.filter((b) => (answers[b.id] ?? "").trim()).length;
  const last = at >= beats.length - 1;
  const current = beat ? (answers[beat.id] ?? "") : "";
  const go = useCallback(
    (to: number) => {
      setDir(to > at ? "next" : "prev");
      onStep(Math.max(0, Math.min(beats.length - 1, to)));
    },
    [at, beats.length, onStep],
  );

  if (!beat) {
    // The rubric is still streaming in — the sequence has no first topic yet.
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", gap: 10 }}>
        <div style={{ ...kicker(10.5), display: "flex", alignItems: "center", gap: 9 }}>
          {t.preparing}
          <InkDots size={3.5} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 60px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        {/* Lead + where you are in the sequence */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
            animation: "fadeUp .3s both",
          }}
        >
          <div style={{ ...kicker(10.5) }}>{t.teachLead}</div>
          <div style={{ flex: 1 }} />
          <div style={{ ...kicker(10.5), color: BLUE }}>
            {t.stepOf(at + 1, beats.length)}
          </div>
        </div>

        {/* The rail: one segment per topic, filled as it is taught. Clickable —
            a learner who remembers something for topic 1 while on topic 3 can
            go back and add it. */}
        <div style={{ display: "flex", gap: 5, marginBottom: 22 }}>
          {beats.map((b, i) => {
            const done = !!(answers[b.id] ?? "").trim();
            return (
              <button
                key={b.id}
                onClick={() => go(i)}
                aria-label={b.subPoint}
                aria-current={i === at}
                style={{
                  flex: 1,
                  height: 3,
                  padding: 0,
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 2,
                  background:
                    i === at ? BLUE : done ? GREEN : "rgba(44,40,35,0.12)",
                  opacity: i === at ? 1 : done ? 0.55 : 1,
                  transform: i === at ? "scaleY(1.9)" : "scaleY(1)",
                  transition: transition(
                    ["background", "transform", "opacity"],
                    "base",
                    "enter",
                  ),
                }}
              />
            );
          })}
        </div>

        {scaffolded && (
          <div
            style={{
              marginBottom: 16,
              borderLeft: `3px solid ${STATE_COLOR.frontier}`,
              background: color.amberBg,
              borderRadius: "0 8px 8px 0",
              padding: "9px 13px",
              fontSize: 13,
              lineHeight: 1.5,
              color: color.amberInk,
              animation: "fadeUp .3s both",
            }}
          >
            {feynmanScaffold(language)}
          </div>
        )}

        {/* The topic card. Remounted per step (keyed) so it animates in from
            the side the learner moved. */}
        <div
          key={beat.id}
          style={{
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 16,
            background: color.card,
            padding: "22px 22px 18px",
            boxShadow: "0 1px 2px rgba(44,40,35,0.04), 0 10px 30px rgba(44,40,35,0.05)",
            animation: `${dir === "next" ? "stepInNext" : "stepInPrev"} ${motion.duration.slow}ms ${motion.ease.enter} both`,
          }}
        >
          <div style={{ ...kicker(10), color: color.inkGhost, marginBottom: 8 }}>
            {t.stepNumber(at + 1)}
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 23,
              lineHeight: 1.3,
              color: color.ink,
              marginBottom: 16,
            }}
          >
            {beat.subPoint}
          </div>

          <textarea
            value={current}
            disabled={judging}
            onChange={(e) => onChangeAnswer(beat.id, e.target.value)}
            rows={9}
            autoFocus
            placeholder={judging ? t.placeholderJudging : t.placeholderTeach}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${color.hairline}`,
              background: color.cardAlt,
              fontFamily: font.serif,
              fontSize: 16,
              lineHeight: 1.6,
              color: color.ink,
              marginBottom: 12,
              opacity: judging ? 0.6 : 1,
              transition: transition(["opacity", "border-color"], "fast"),
            }}
          />
          <MicButton
            value={current}
            onChange={(v) => onChangeAnswer(beat.id, v)}
            disabled={judging}
          />
        </div>

        {/* Controls — back · skip · next, with the last step sending. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
          }}
        >
          <button
            className="at-press"
            onClick={() => go(at - 1)}
            disabled={at === 0 || judging}
            style={{
              background: "none",
              border: "none",
              cursor: at === 0 || judging ? "default" : "pointer",
              fontSize: 13.5,
              color: at === 0 ? color.inkGhost : color.inkMuted,
              padding: "6px 2px",
            }}
          >
            {t.prevTopic}
          </button>
          {!last && (
            <button
              className="at-press"
              onClick={() => go(at + 1)}
              disabled={judging}
              style={{
                background: "none",
                border: "none",
                cursor: judging ? "default" : "pointer",
                fontSize: 13,
                color: color.inkGhost,
                padding: "6px 2px",
              }}
            >
              {t.skipTopic}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ ...kicker(10), color: color.inkGhost }}>
            {t.remaining(beats.length - answered)}
          </span>
          <Advance
            label={last ? t.sendToStudent : t.nextTopic}
            blocked={judging || (last && (!ready || answered === 0))}
            judging={judging}
            preparing={last && !judging && !ready}
            onClick={() => (last ? onSend() : go(at + 1))}
          />
        </div>
      </div>
    </div>
  );
}

/** The one weighted button in the sequence — next topic, or the send that
 *  hands the whole transcript to the student. */
function Advance({
  label,
  blocked,
  judging,
  preparing,
  onClick,
}: {
  label: string;
  blocked: boolean;
  judging: boolean;
  preparing: boolean;
  onClick: () => void;
}) {
  const t = useT(STRINGS);
  return (
    <button
      className="at-press"
      onClick={onClick}
      disabled={blocked}
      style={{
        padding: "13px 20px",
        background: blocked ? "rgba(44,40,35,0.07)" : color.accent,
        color: blocked ? color.inkGhost : color.accentInk,
        border: "none",
        borderRadius: 11,
        fontSize: 14.5,
        fontWeight: 600,
        cursor: blocked ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        boxShadow: blocked ? "none" : "0 6px 18px rgba(47,107,79,0.22)",
        transition: transition(["background", "color", "box-shadow"], "fast"),
      }}
    >
      {judging ? (
        <>
          {t.listening}
          <InkDots size={3.5} />
        </>
      ) : preparing ? (
        <>
          {t.preparing}
          <InkDots size={3.5} />
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** The Gap Report — a visual diff of the explanation, each gap actionable. */
function GapReport({
  title,
  topic,
  beats,
  session,
  onOpenFix,
  onCloseFix,
  onFix,
  onTeachAgain,
  onAdvance,
}: {
  title: string;
  topic: string;
  beats: FeynmanBeat[];
  session: FeynmanSession;
  onOpenFix: (beatId: string) => void;
  onCloseFix: () => void;
  onFix: (index: number) => void;
  onTeachAgain: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const counts = beats.reduce(
    (acc, b) => {
      const v = session.verdicts[b.id];
      if (v) acc[v] += 1;
      return acc;
    },
    { good: 0, skipped: 0, confused: 0 } as Record<TeachVerdict, number>,
  );
  const clean = feynmanClean(session, beats);
  const gapCount = feynmanGaps(session, beats).length;
  // The delta is the only place the learner sees the loop working on them:
  // this pass's gaps against the one they just re-taught.
  const before = session.previous
    ? feynmanGapCount(session.previous, beats)
    : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "30px 32px 60px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", animation: "fadeUp .35s both" }}>
        <div style={{ ...kicker(10.5), marginBottom: 10 }}>
          {t.gapReportLead}
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 27,
            lineHeight: 1.16,
            marginBottom: 18,
          }}
        >
          {clean ? t.cleanTitle : t.handWavedTitle}
        </div>

        {before !== null && (
          <div
            style={{
              display: "inline-block",
              marginBottom: 18,
              padding: "6px 12px",
              borderRadius: 8,
              background: color.chipBg,
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: gapCount < before ? GREEN : color.inkFaint,
            }}
          >
            {clean ? t.deltaClean(before) : t.delta(before, gapCount)}
          </div>
        )}

        {/* The naive student, reacting to the whole explanation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 6,
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: color.inkGhost,
          }}
        >
          <span style={{ fontSize: 12 }}>🙋</span>
          {t.student}
        </div>
        <div
          style={{
            background: color.card,
            border: `1px solid ${color.hairline}`,
            borderLeft: `3px solid ${clean ? GREEN : BLUE}`,
            borderRadius: "3px 12px 12px 12px",
            padding: "12px 15px",
            fontFamily: font.serif,
            fontSize: 15.5,
            lineHeight: 1.5,
            color: color.ink,
            marginBottom: 20,
          }}
        >
          <StreamingText text={session.response} writing={session.pending} />
        </div>

        {/* The Feynman rule itself: named is not explained */}
        {session.jargon.length > 0 && (
          <div
            style={{
              border: `1px solid rgba(160,106,48,0.25)`,
              background: color.amberBg,
              borderRadius: 10,
              padding: "12px 15px",
              marginBottom: 20,
            }}
          >
            <div style={{ ...kicker(9.5, "0.1em"), color: color.amberInk, marginBottom: 8 }}>
              {t.jargonLead}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
              {session.jargon.map((term) => (
                <span
                  key={term}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 7,
                    background: color.card,
                    border: `1px solid rgba(160,106,48,0.3)`,
                    fontFamily: font.mono,
                    fontSize: 12,
                    color: color.amberInk,
                  }}
                >
                  {term}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: color.amberInk }}>
              {t.jargonNote}
            </div>
          </div>
        )}

        {/* Legend + counts */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <LegendChip color={GREEN} label={t.explained(counts.good)} />
          <LegendChip color={GREY} label={t.skipped(counts.skipped)} />
          <LegendChip color={RED} label={t.confused(counts.confused)} />
        </div>

        {/* The diff rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
          {beats.map((b) => {
            const verdict = session.verdicts[b.id];
            if (!verdict) return null;
            const c = VERDICT_COLOR[verdict];
            const open = session.fixing === b.id;
            const fixable = verdict !== "good";
            const quote = session.quotes[b.id];
            const closed =
              verdict === "good" &&
              session.previous &&
              session.previous[b.id] &&
              session.previous[b.id] !== "good";
            return (
              <div
                key={b.id}
                style={{
                  background: color.card,
                  border: `1px solid ${color.hairline}`,
                  borderLeft: `3px solid ${c}`,
                  borderRadius: 10,
                  padding: "13px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: c,
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ fontFamily: font.serif, fontSize: 16, flex: 1 }}>
                    <Rich text={b.subPoint} />
                  </span>
                  {closed && (
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 9.5,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: color.inkGhost,
                      }}
                    >
                      {t.wasGap}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 9.5,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: c,
                    }}
                  >
                    {verdictLabel(verdict, language)}
                  </span>
                  {fixable && !open && (
                    <button
                      className="at-press"
                      onClick={() => onOpenFix(b.id)}
                      style={{
                        padding: "6px 12px",
                        background: color.accent,
                        color: color.accentInk,
                        border: "none",
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {t.fixThis}
                    </button>
                  )}
                  {verdict === "good" && (
                    <span style={{ fontSize: 13, color: GREEN }}>✓</span>
                  )}
                </div>

                {/* Their own words, caught — the same quote the gap node carries */}
                {quote && verdict !== "good" && (
                  <div
                    style={{
                      marginTop: 9,
                      paddingLeft: 20,
                      fontFamily: font.serif,
                      fontSize: 14,
                      lineHeight: 1.45,
                      fontStyle: "italic",
                      color: color.inkMuted,
                    }}
                  >
                    “{quote}”
                  </div>
                )}

                {open && (
                  <FixPass
                    beat={b}
                    topic={topic}
                    nodeLabel={title}
                    ruledOut={session.fixRuledOut}
                    reaction={session.fixReaction}
                    onFix={onFix}
                    onClose={onCloseFix}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* What they actually taught, kept out of the way but never lost */}
        {session.explanation && (
          <details style={{ marginBottom: 20 }}>
            <summary
              style={{
                cursor: "pointer",
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: color.inkFaint,
              }}
            >
              {t.yourWords}
            </summary>
            <div
              style={{
                marginTop: 10,
                background: color.accentBg,
                border: `1px solid rgba(47,107,79,0.18)`,
                borderRadius: 10,
                padding: "12px 15px",
                fontFamily: font.serif,
                fontSize: 15,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                color: color.ink,
              }}
            >
              {session.explanation}
            </div>
          </details>
        )}

        {/* Write-back note — the connective tissue back to the map */}
        {!clean && (
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.55,
              color: color.inkMuted,
              background: color.cardAlt,
              border: `1px solid ${color.hairline}`,
              borderRadius: 9,
              padding: "12px 15px",
              marginBottom: 20,
            }}
          >
            {t.writeBackNote(gapCount, title)}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            className="at-press"
            onClick={onAdvance}
            style={{
              width: "100%",
              padding: 15,
              background: color.accent,
              color: color.accentInk,
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
            }}
          >
            {clean ? t.cleanAdvance : t.attachGaps(gapCount)}
          </button>
          <button
            className="at-press"
            onClick={onTeachAgain}
            style={{
              width: "100%",
              padding: "12px 15px",
              background: "none",
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 12,
              fontSize: 13.5,
              color: color.inkMuted,
              cursor: "pointer",
            }}
          >
            {t.teachAgain}
          </button>
        </div>
      </div>
    </div>
  );
}

function LegendChip({ color: c, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span
        style={{ width: 10, height: 10, borderRadius: "50%", background: c }}
      />
      <span style={{ fontSize: 13, color: color.inkSoft }}>{label}</span>
    </div>
  );
}

/** The targeted Socratic micro-pass for one gap — a single corrective probe. */
function FixPass({
  beat,
  topic,
  nodeLabel,
  ruledOut,
  reaction,
  onFix,
  onClose,
}: {
  beat: FeynmanBeat;
  topic: string;
  nodeLabel: string;
  ruledOut: string[];
  reaction: string | null;
  onFix: (index: number) => void;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  const [mode, setMode] = useState<AnswerMode>("open");
  return (
    <div
      style={{
        marginTop: 13,
        paddingTop: 13,
        borderTop: `1px solid ${color.hairline}`,
        animation: "fadeUp .25s both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ ...kicker(9.5, "0.1em"), color: BLUE }}>
          {t.targetedPass}
        </div>
        <AnswerModeToggle mode={mode} onMode={setMode} accent={BLUE} />
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 15,
          lineHeight: 1.5,
          color: color.ink,
          marginBottom: 12,
        }}
      >
        <Rich text={beat.fix.probe} />
      </div>
      {mode === "open" ? (
        <OpenAnswer
          topic={topic}
          nodeLabel={nodeLabel}
          question={beat.fix.probe}
          options={beat.fix.replies.map((r) => r.label)}
          onResolve={(i) => onFix(i)}
          placeholder={t.answerInWords}
          rows={2}
          accent={BLUE}
        />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {beat.fix.replies.map((r, i) => {
          const spent = ruledOut.includes(r.label);
          return (
            <button
              className="at-press"
              key={r.label}
              disabled={spent}
              onClick={() => onFix(i)}
              style={{
                textAlign: "left",
                padding: "10px 13px",
                borderRadius: 9,
                fontSize: 13.5,
                lineHeight: 1.4,
                cursor: spent ? "default" : "pointer",
                fontFamily: "inherit",
                border: `1px solid ${color.hairlineStrong}`,
                background: color.paper,
                color: color.ink,
                opacity: spent ? 0.45 : 1,
                textDecoration: spent ? "line-through" : "none",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      )}
      {reaction && (
        <div
          style={{
            marginTop: 11,
            borderLeft: `3px solid ${RED}`,
            background: color.card,
            borderRadius: "0 9px 9px 0",
            padding: "10px 13px",
            fontFamily: font.serif,
            fontSize: 14.5,
            lineHeight: 1.45,
            color: color.ink,
          }}
        >
          <Rich text={reaction} />
        </div>
      )}
      <button
        className="at-press"
        onClick={onClose}
        style={{
          marginTop: 10,
          background: "none",
          border: "none",
          fontSize: 12.5,
          color: color.inkGhost,
          cursor: "pointer",
        }}
      >
        {t.close}
      </button>
    </div>
  );
}
