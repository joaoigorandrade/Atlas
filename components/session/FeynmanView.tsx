"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import {
  PHASES,
  STATE_COLOR,
  VERDICT_COLOR,
  feynmanClean,
  feynmanGaps,
  feynmanScaffold,
  verdictLabel,
  type FeynmanBeat,
  type FeynmanSession,
  type TeachLine,
  type TeachVerdict,
} from "@/lib/curriculum";
import { InkDots } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

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
    teachBackLead: "Teach it back · I’m the student who’s never heard of it",
    phaseTag: "Phase 3b · Feynman",
    promptTitle: "Teach me this like I’ve never heard of it.",
    promptBody:
      "Explain it in your own words — I’ll play the student and push back whenever something doesn’t add up. The parts you rush become your gaps.",
    startTeaching: "Start teaching →",
    dontKnowStart: "I don’t know where to start",
    upNext: "Up next",
    teach: "teach —",
    placeholderJudging: "Your student is thinking about what you said…",
    placeholderTeach:
      "Explain it in your own words — as if they've truly never heard of it",
    listening: "Listening",
    sendToStudent: "Send to my student →",
    naiveQuestion: "Naive question",
    student: "Student",
    gapReportLead: "Gap report · your explanation, diffed",
    cleanTitle: "Clean teach-back — you explained every piece.",
    handWavedTitle: "Here’s where you hand-waved.",
    explained: (n: number) => `${n} explained`,
    skipped: (n: number) => `${n} skipped`,
    confused: (n: number) => `${n} confused`,
    fixThis: "Fix this →",
    writeBackNote: (gapCount: number, title: string) => (
      <>
        <span style={{ color: RED, fontWeight: 600 }}>
          {gapCount} gap{gapCount === 1 ? "" : "s"}
        </span>{" "}
        will attach under <span style={{ fontStyle: "italic" }}>{title}</span> as
        red sub-nodes — each opens a targeted Socratic pass. Fix them here, or
        carry them to the map and close them in the loop.
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
    teachBackLead: "Ensine de volta · sou o aluno que nunca ouviu falar disso",
    phaseTag: "Fase 3b · Feynman",
    promptTitle: "Me ensine isso como se eu nunca tivesse ouvido falar.",
    promptBody:
      "Explique com suas próprias palavras — eu vou bancar o aluno e questionar sempre que algo não fizer sentido. As partes que você apressa viram suas lacunas.",
    startTeaching: "Começar a ensinar →",
    dontKnowStart: "Não sei por onde começar",
    upNext: "A seguir",
    teach: "ensinar —",
    placeholderJudging: "Seu aluno está pensando sobre o que você disse…",
    placeholderTeach:
      "Explique com suas próprias palavras — como se ele realmente nunca tivesse ouvido falar disso",
    listening: "Ouvindo",
    sendToStudent: "Enviar para meu aluno →",
    naiveQuestion: "Pergunta ingênua",
    student: "Aluno",
    gapReportLead: "Relatório de lacunas · sua explicação, comparada",
    cleanTitle: "Explicação limpa — você explicou cada parte.",
    handWavedTitle: "Aqui é onde você passou por cima.",
    explained: (n: number) => `${n} explicado${n === 1 ? "" : "s"}`,
    skipped: (n: number) => `${n} pulado${n === 1 ? "" : "s"}`,
    confused: (n: number) => `${n} confuso${n === 1 ? "" : "s"}`,
    fixThis: "Corrigir →",
    writeBackNote: (gapCount: number, title: string) => (
      <>
        <span style={{ color: RED, fontWeight: 600 }}>
          {gapCount} lacuna{gapCount === 1 ? "" : "s"}
        </span>{" "}
        {gapCount === 1 ? "vai" : "vão"} se anexar sob{" "}
        <span style={{ fontStyle: "italic" }}>{title}</span> como sub-nós
        vermelhos — cada uma abre uma passagem socrática focada. Corrija-as
        aqui, ou leve-as ao mapa e feche-as no ciclo.
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
  /** The generated teach-back beats for this node. */
  beats: FeynmanBeat[];
  /** The node being taught back — titles the view. */
  title: string;
  /** The subject — context for judging open-ended fix-pass answers. */
  topic: string;
  session: FeynmanSession;
  /** True while the server judge is diffing the typed explanation (#26). */
  judging: boolean;
  onExit: () => void;
  /** Leave the opening prompt and enter the teach-back surface. */
  onBegin: () => void;
  /** The learner's own explanation of the current beat, sent for diffing. */
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

/** Accent for an AI line: a naive question, praise, a caught error, a skip. */
function toneColor(tone: TeachLine["tone"]): string {
  switch (tone) {
    case "affirm":
      return GREEN;
    case "catch":
      return RED;
    case "skip":
      return GREY;
    default:
      return BLUE; // naive
  }
}

export default function FeynmanView({
  title,
  topic,
  beats,
  session,
  judging,
  onExit,
  onBegin,
  onTeach,
  onScaffold,
  onOpenFix,
  onCloseFix,
  onFix,
  onTeachAgain,
  onAdvance,
}: FeynmanViewProps) {
  const t = useT(STRINGS);
  const beat = beats[session.beat];
  // The beats stream in one at a time. Until the current one exists there is
  // nothing to teach, so the opening prompt stays up with its button parked —
  // in practice the first beat lands while the learner is still reading it.
  const writing = !beat && !session.reported;

  // ---- the transcript scrolls to the newest line -----------------------
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.log.length]);

  // The learner's own explanation of the current beat (#26) — spoken or
  // typed, whichever is faster. Resets when the beat advances.
  const [typed, setTyped] = useState("");
  useEffect(() => {
    setTyped("");
  }, [session.beat, session.reported]);

  const send = useCallback(() => {
    const text = typed.trim();
    if (text && !judging) onTeach(text);
  }, [judging, onTeach, typed]);

  const breadcrumb = PHASES.slice(0, 6).join(" → ");

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        color: color.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: font.sans,
        fontSize: 15,
        zIndex: 30,
        animation: "softIn 0.3s both",
      }}
    >
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

      {/* Body — a single centered column: teach-back, then the Gap Report */}
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
            onTeachAgain={onTeachAgain}
            onAdvance={onAdvance}
          />
        ) : !session.started || writing ? (
          <Prompt
            scaffolded={session.scaffolded}
            writing={writing}
            onBegin={onBegin}
            onScaffold={onScaffold}
          />
        ) : (
          <>
            <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "30px 32px" }}>
              <div style={{ maxWidth: 620, margin: "0 auto" }}>
                <div style={{ ...kicker(10.5), marginBottom: 22 }}>
                  {t.teachBackLead}
                </div>
                {session.log.map((m, i) => (
                  <Line key={i} line={m} />
                ))}
              </div>
            </div>

            {/* Input dock — speak the next beat, or answer the interruption */}
            <div
              style={{
                flex: "0 0 auto",
                borderTop: `1px solid ${color.hairline}`,
                padding: "16px 32px 22px",
                background: "rgba(248,246,240,0.55)",
              }}
            >
              <div style={{ maxWidth: 620, margin: "0 auto" }}>
                <TeachDock
                  beat={beat}
                  scaffolded={session.scaffolded && session.beat === 0}
                  typed={typed}
                  judging={judging}
                  onChangeTyped={setTyped}
                  onSend={send}
                />
              </div>
            </div>
          </>
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
    </div>
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
  writing,
}: {
  scaffolded: boolean;
  /** The first beat has not been written yet — nothing to begin on. */
  writing: boolean;
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
          onClick={onBegin}
          disabled={writing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "15px 26px",
            background: writing ? "rgba(44,40,35,0.07)" : color.accent,
            color: writing ? color.inkGhost : color.accentInk,
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: writing ? "default" : "pointer",
            boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
          }}
        >
          {t.startTeaching}
        </button>
        <div style={{ marginTop: 18 }}>
          <button
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

/** The teach-the-next-beat dock: the learner's own words, judged for real (#26).
 *  Voice-first per §SPEC — speaking is closer to real teaching — with typing
 *  always there beside it. */
function TeachDock({
  beat,
  scaffolded,
  typed,
  judging,
  onChangeTyped,
  onSend,
}: {
  beat: FeynmanBeat | undefined;
  scaffolded: boolean;
  typed: string;
  judging: boolean;
  onChangeTyped: (v: string) => void;
  onSend: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  if (!beat) return null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 11,
        }}
      >
        <span style={{ ...kicker(9.5, "0.1em"), color: color.inkGhost }}>{t.upNext}</span>
        <span style={{ fontSize: 13, color: color.inkMuted }}>
          {t.teach} <span style={{ color: color.inkSoft }}>{beat.subPoint}</span>
        </span>
      </div>

      {scaffolded && (
        <div
          style={{
            marginBottom: 12,
            borderLeft: `3px solid ${STATE_COLOR.frontier}`,
            background: color.amberBg,
            borderRadius: "0 8px 8px 0",
            padding: "9px 13px",
            fontSize: 13,
            lineHeight: 1.5,
            color: color.amberInk,
          }}
        >
          {feynmanScaffold(language)}
        </div>
      )}

      <textarea
        value={typed}
        disabled={judging}
        onChange={(e) => onChangeTyped(e.target.value)}
        rows={3}
        autoFocus
        placeholder={
          judging ? t.placeholderJudging : t.placeholderTeach
        }
        style={{
          width: "100%",
          resize: "none",
          padding: "12px 14px",
          borderRadius: 11,
          border: `1px solid ${color.hairlineStrong}`,
          background: color.card,
          fontFamily: font.serif,
          fontSize: 15.5,
          lineHeight: 1.5,
          color: color.ink,
          marginBottom: 10,
          opacity: judging ? 0.6 : 1,
        }}
      />
      <div style={{ marginBottom: 12 }}>
        <MicButton value={typed} onChange={onChangeTyped} disabled={judging} />
      </div>
      <button
        onClick={onSend}
        disabled={judging || !typed.trim()}
        style={{
          padding: "11px 18px",
          background:
            judging || !typed.trim() ? "rgba(44,40,35,0.07)" : color.accent,
          color: judging || !typed.trim() ? color.inkGhost : color.accentInk,
          border: "none",
          borderRadius: 11,
          fontSize: 14,
          fontWeight: 600,
          cursor: judging || !typed.trim() ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        {judging ? (
          <>
            {t.listening}
            <InkDots size={3.5} />
          </>
        ) : (
          t.sendToStudent
        )}
      </button>
    </div>
  );
}

/** One transcript line — the learner's explanation, or the student's reaction. */
function Line({ line }: { line: TeachLine }) {
  const t = useT(STRINGS);
  if (line.role === "learner") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div
          style={{
            maxWidth: "84%",
            background: color.accentBg,
            border: `1px solid rgba(47,107,79,0.18)`,
            borderRadius: "12px 12px 3px 12px",
            padding: "11px 15px",
            fontFamily: font.serif,
            fontSize: 15.5,
            lineHeight: 1.5,
            color: color.ink,
            animation: "fadeUp .25s both",
          }}
        >
          {line.text}
        </div>
      </div>
    );
  }
  const accent = toneColor(line.tone);
  const naive = line.tone === "naive";
  return (
    <div style={{ marginBottom: 18, animation: "fadeUp .3s both" }}>
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
        {naive ? t.naiveQuestion : t.student}
      </div>
      <div
        style={{
          maxWidth: "88%",
          background: color.card,
          border: `1px solid ${color.hairline}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: "3px 12px 12px 12px",
          padding: "12px 15px",
          fontFamily: font.serif,
          fontSize: 15.5,
          lineHeight: 1.5,
          color: color.ink,
        }}
      >
        {/* The verdict landed; the student's actual words are still coming. */}
        {line.pending ? <InkDots size={4} /> : line.text}
      </div>
    </div>
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
                    {b.subPoint}
                  </span>
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
        {beat.fix.probe}
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
          {reaction}
        </div>
      )}
      <button
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
