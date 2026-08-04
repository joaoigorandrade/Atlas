"use client";

import { useState } from "react";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import {
  ALT_CONTROLS,
  PHASES,
  STATE_COLOR,
  figureLayers,
  type AltKey,
  type ConsumeChunk,
  type ConsumeExample,
  type ConsumeFigure,
} from "@/lib/curriculum";
import { segmentsForChunk, useReadAloud, useVoicePrefs } from "@/lib/speech";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

// Consume is a Learning-phase surface: its accents borrow the shared state
// colors (learning blue, plus mastered/shaky for right/wrong verdicts).
const BLUE = STATE_COLOR.learning;
const RIGHT = STATE_COLOR.mastered;
const WRONG = STATE_COLOR.shaky;

const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session · Consume",
    iKnowThis: "I know this →",
    kicker: "Grounded, dual-coded reading",
    intro: (n: number) =>
      n > 0
        ? `This is the reading. ${n} sections, each with a worked example and a diagram — read them straight through.`
        : "This is the reading —",
    introTail:
      "Rewrite any section to fit how you think, tap a term for its meaning before it’s used, and ask about any passage that doesn’t land. The questioning starts in Socratic, after this.",
    writingFirst: "Writing your first section…",
    workedExample: "Worked example",
    optionalGuessFirst: "Optional · guess first",
    predictPlaceholder:
      "A guess costs nothing and makes the reading below stick harder.",
    lockInGuess: "Lock in my guess →",
    skipTeachMe: "Skip — just teach me ↓",
    yourGuess: "your guess",
    takeaway: "Takeaway",
    source: "source",
    rewritesWriting: "Rewrites still writing…",
    askAboutPassage: "Ask about this passage",
    socraticAside: "A quick Socratic aside, without leaving Consume:",
    diagramLabel: "diagram ·",
    finishBeginSocratic: "Finish · begin Socratic →",
    continueSection: (next: string) => `Continue · ${next} ↓`,
    writingNext: "Writing the next section…",
    overshootTitle: "You called this one before reading it.",
    overshootBody:
      "The diagnostic under-shot your level here — no need to grind the basics.",
    skipToCrucible: "Skip to Crucible →",
    simplifyingTitle: "Simplifying a lot?",
    simplifyingBody:
      "Repeatedly reaching for the simpler version usually means an earlier concept is shaky.",
    reviewPrereq: "Review prerequisite →",
    term: "term",
    readAloud: "Read this section aloud",
    pauseReading: "Pause the reading",
    resumeReading: "Resume the reading",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão · Consumir",
    iKnowThis: "Já sei isso →",
    kicker: "Leitura fundamentada, com dupla codificação",
    intro: (n: number) =>
      n > 0
        ? `Esta é a leitura. ${n} seções, cada uma com um exemplo resolvido e um diagrama — leia-as em sequência.`
        : "Esta é a leitura —",
    introTail:
      "Reescreva qualquer seção do jeito que funciona melhor para você, toque em um termo para ver o significado antes de ele ser usado, e pergunte sobre qualquer trecho que não fez sentido. As perguntas começam no Socrático, depois disso.",
    writingFirst: "Escrevendo sua primeira seção…",
    workedExample: "Exemplo resolvido",
    optionalGuessFirst: "Opcional · arrisque um palpite antes",
    predictPlaceholder:
      "Um palpite não custa nada e faz a leitura a seguir grudar mais.",
    lockInGuess: "Confirmar meu palpite →",
    skipTeachMe: "Pular — só me ensine ↓",
    yourGuess: "seu palpite",
    takeaway: "Ideia central",
    source: "fonte",
    rewritesWriting: "Reescritas ainda sendo geradas…",
    askAboutPassage: "Perguntar sobre este trecho",
    socraticAside: "Um aparte socrático rápido, sem sair do Consumir:",
    diagramLabel: "diagrama ·",
    finishBeginSocratic: "Concluir · começar o Socrático →",
    continueSection: (next: string) => `Continuar · ${next} ↓`,
    writingNext: "Escrevendo a próxima seção…",
    overshootTitle: "Você acertou isso antes mesmo de ler.",
    overshootBody:
      "O diagnóstico subestimou seu nível aqui — sem necessidade de treinar o básico.",
    skipToCrucible: "Pular para o Crucible →",
    simplifyingTitle: "Simplificando bastante?",
    simplifyingBody:
      "Recorrer repetidamente à versão mais simples geralmente indica que um conceito anterior está instável.",
    reviewPrereq: "Revisar pré-requisito →",
    term: "termo",
    readAloud: "Ouvir esta seção",
    pauseReading: "Pausar a leitura",
    resumeReading: "Continuar a leitura",
  },
} as const;

/** The live state of one Consume session — held by AtlasApp, read here. */
export interface ConsumeSession {
  nodeId: string;
  /** Deepest section revealed so far; the pass unfolds one section at a time
   *  so it never lands as a wall — but no section is gated by a question. */
  idx: number;
  /** The learner's answer to the session's one prediction hook, keyed by
   *  chunk id (only the opening section has one). */
  answered: Record<string, { oi: number; correct: boolean }>;
  /** The hook was waved off — "just teach me". */
  hookSkipped: boolean;
  /** The chosen rewrite modality per chunk (adaptive modality). */
  variant: Record<string, AltKey | null>;
  /** The pre-taught term expanded inline, keyed `chunkId:term`. */
  term: string | null;
  /** The chunk whose mini-Socratic aside is open. */
  aside: string | null;
}

interface ConsumeViewProps {
  /** The node this session teaches — titles the view. */
  title: string;
  /** The subject — context for judging the open-ended prediction. */
  topic: string;
  /** The generated reading pass for this node — sections already streamed
   *  in, more may still be on the way while `streaming` is true. */
  chunks: ConsumeChunk[];
  /** More sections are still being written — the deepest one currently in
   *  `chunks` isn't necessarily the pass's last section yet. */
  streaming?: boolean;
  session: ConsumeSession;
  onExit: () => void;
  onAnswer: (chunkId: string, oi: number, correct: boolean) => void;
  onSkipHook: () => void;
  onContinue: (chunkIndex: number) => void;
  onFinish: () => void;
  onSetVariant: (chunkId: string, key: AltKey) => void;
  onToggleTerm: (key: string) => void;
  onToggleAside: (chunkId: string) => void;
  onSkipCrucible: () => void;
  onRoutePrereq: () => void;
}

// ---- figure rendering ------------------------------------------------------
// The model describes each chunk's figure as boxes + arrows; we lay it out as
// layers (longest path from a root) and draw it. No per-chunk artwork, but the
// picture is actually about the chunk instead of one hardcoded stand-in.

const FIG_W = 300;
const PAD = 12;
const GAP_X = 12;
const GAP_Y = 34;
const LINE_H = 11;
const CHAR_W = 5.1;

function wrap(label: string, boxW: number): string[] {
  const max = Math.max(6, Math.floor((boxW - 10) / CHAR_W));
  const lines: string[] = [];
  let cur = "";
  for (const word of label.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  // ponytail: 3 lines max — longer labels get clipped, prompt caps at 4 words.
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2].slice(0, max - 1)}…`];
  return lines;
}

function Figure({ id, figure }: { id: string; figure: ConsumeFigure }) {
  const layer = figureLayers(figure);
  const rows: (typeof figure.nodes)[number][][] = [];
  for (const n of figure.nodes) {
    const l = layer.get(n.id) ?? 0;
    (rows[l] ??= []).push(n);
  }
  const box = new Map<string, { x: number; y: number; w: number; h: number; lines: string[] }>();
  let y = PAD;
  for (const row of rows) {
    if (!row) continue;
    const w = (FIG_W - 2 * PAD - GAP_X * (row.length - 1)) / row.length;
    const laid = row.map((n) => wrap(n.label, w));
    const h = Math.max(...laid.map((l) => l.length)) * LINE_H + 14;
    row.forEach((n, i) => {
      box.set(n.id, { x: PAD + i * (w + GAP_X), y, w, h, lines: laid[i] });
    });
    y += h + GAP_Y;
  }
  const height = y - GAP_Y + PAD;

  return (
    <svg
      viewBox={`0 0 ${FIG_W} ${height}`}
      role="img"
      style={{
        width: "100%",
        height: "auto",
        borderRadius: 12,
        border: `1px solid ${color.hairline}`,
        background: color.card,
        display: "block",
      }}
    >
      <defs>
        <marker
          id={`ah-${id}`}
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill={BLUE} />
        </marker>
      </defs>
      {figure.edges.map((e, i) => {
        const a = box.get(e.from);
        const b = box.get(e.to);
        if (!a || !b) return null;
        // Leave each box from the side that faces the other one.
        const [ax, ay] =
          b.y > a.y
            ? [a.x + a.w / 2, a.y + a.h]
            : b.y < a.y
              ? [a.x + a.w / 2, a.y]
              : [b.x > a.x ? a.x + a.w : a.x, a.y + a.h / 2];
        const [bx, by] =
          b.y > a.y
            ? [b.x + b.w / 2, b.y]
            : b.y < a.y
              ? [b.x + b.w / 2, b.y + b.h]
              : [b.x > a.x ? b.x : b.x + b.w, b.y + b.h / 2];
        // Edges that skip a layer bow out to the side so they don't hide
        // under the straight arrows of the main chain.
        const span = Math.abs(
          (layer.get(e.to) ?? 0) - (layer.get(e.from) ?? 0),
        );
        const cx = (ax + bx) / 2 + (span > 1 ? 34 : 0);
        const cy = (ay + by) / 2;
        return (
          <g key={`e${i}`}>
            <path
              d={`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`}
              fill="none"
              stroke={BLUE}
              strokeWidth={1.4}
              markerEnd={`url(#ah-${id})`}
            />
            {e.label && (
              <text
                x={(ax + 2 * cx + bx) / 4 - 4}
                y={(ay + 2 * cy + by) / 4 + 3}
                textAnchor="end"
                fontFamily={font.mono}
                fontSize={8}
                fill={color.inkFaint}
                stroke={color.card}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {figure.nodes.map((n) => {
        const b = box.get(n.id);
        if (!b) return null;
        return (
          <g key={n.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={7}
              fill={color.card}
              stroke={BLUE}
              strokeWidth={1.2}
            />
            <text
              textAnchor="middle"
              fontFamily={font.sans}
              fontSize={9.5}
              fill={color.ink}
            >
              {b.lines.map((line, li) => (
                <tspan
                  key={li}
                  x={b.x + b.w / 2}
                  y={b.y + b.h / 2 - ((b.lines.length - 1) * LINE_H) / 2 + li * LINE_H + 3}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Kickers arrive numbered ("3 · Where it breaks"); the Continue button already
 *  implies the count, so it names the section alone. */
function sectionName(kicker: string): string {
  return kicker.replace(/^\s*\d+\s*·\s*/, "");
}

/** Play/pause for one section's reading. Hidden entirely where the browser
 *  can't speak or the learner has read-aloud off. */
function SpeakerButton({
  active,
  paused,
  onClick,
}: {
  active: boolean;
  paused: boolean;
  onClick: () => void;
}) {
  const t = useT(STRINGS);
  const label = !active ? t.readAloud : paused ? t.resumeReading : t.pauseReading;
  const showPause = active && !paused;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        flex: "0 0 auto",
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        borderRadius: "50%",
        border: `1px solid ${active ? BLUE : color.hairlineStrong}`,
        background: active ? BLUE : color.card,
        cursor: "pointer",
        transition: "background .15s, border-color .15s",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M1.4 5.2h2.4L7.2 2.3v9.4L3.8 8.8H1.4z"
          fill={active ? color.accentInk : BLUE}
        />
        {showPause ? (
          <>
            <rect x="9.3" y="4.4" width="1.4" height="5.2" rx="0.6" fill={color.accentInk} />
            <rect x="11.6" y="4.4" width="1.4" height="5.2" rx="0.6" fill={color.accentInk} />
          </>
        ) : (
          <path
            d="M9.6 4.9a3 3 0 0 1 0 4.2M11.6 3.2a5.6 5.6 0 0 1 0 7.6"
            stroke={active ? color.accentInk : BLUE}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  );
}

/** The worked example that closes each section's prose — material, not an
 *  on-demand rewrite the learner has to go hunting for. */
function WorkedExample({ example }: { example: ConsumeExample }) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        marginTop: 22,
        background: color.cardAlt,
        border: `1px solid ${color.hairline}`,
        borderLeft: `3px solid ${BLUE}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: BLUE,
          marginBottom: 8,
        }}
      >
        {t.workedExample}
      </div>
      <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
        {example.title}
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {example.steps.map((s, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 11,
              alignItems: "baseline",
              marginBottom: i === example.steps.length - 1 ? 0 : 10,
            }}
          >
            <span
              style={{
                flex: "0 0 auto",
                fontFamily: font.mono,
                fontSize: 10.5,
                color: color.inkGhost,
                paddingTop: 2,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 14.5, lineHeight: 1.6, color: color.ink }}>
              {s}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ConsumeView({
  title,
  topic,
  chunks,
  streaming = false,
  session,
  onExit,
  onAnswer,
  onSkipHook,
  onContinue,
  onFinish,
  onSetVariant,
  onToggleTerm,
  onToggleAside,
  onSkipCrucible,
  onRoutePrereq,
}: ConsumeViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  // The prediction is open-ended by default; the switch reveals the closed form.
  const [mode, setMode] = useState<AnswerMode>("open");

  // Read-aloud: the reading pass is the one place in Atlas long enough to be
  // worth listening to. One section speaks at a time — starting another
  // cancels the first — and the hook cancels on unmount, since
  // `speechSynthesis` would otherwise keep talking after the learner leaves.
  const { readAloud: readAloudPref } = useVoicePrefs();
  const reading = useReadAloud({ language });
  const [spoken, setSpoken] = useState<string | null>(null);
  const voiceOn = reading.supported && readAloudPref;
  const speakingChunk = reading.speaking ? spoken : null;
  const toggleReading = (c: ConsumeChunk) => {
    if (speakingChunk === c.id) {
      if (reading.paused) reading.resume();
      else reading.pause();
      return;
    }
    setSpoken(c.id);
    reading.speak(segmentsForChunk(c));
  };
  // Only sections up to the deepest revealed one are on screen — the pass
  // unfolds in segments, never as a wall.
  const visible = chunks.slice(0, session.idx + 1);

  let simpleCount = 0;
  for (const c of chunks) if (session.variant[c.id] === "simpler") simpleCount++;

  // Overshoot correction: the session's one hook was called correctly and the
  // learner has read to the end → suggest skipping ahead. The header's
  // "already know this?" is the same escape hatch, available from the start.
  const hookAnswer = session.answered[chunks[0]?.id ?? ""];
  const atEnd = session.idx >= chunks.length - 1 && !streaming;
  const overshoot = !!hookAnswer?.correct && atEnd;
  // Missing-prerequisite flag: leaning on "simpler" repeatedly.
  const simpleFlag = simpleCount >= 3;

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
      {/* Header */}
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
          onClick={() => {
            reading.cancel();
            onExit();
          }}
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
        <div
          style={{ width: 1, height: 20, background: color.hairlineStrong }}
        />
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
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.inkGhost,
          }}
        >
          {breadcrumb}
        </span>
        {/* The escape hatch, always open: nobody should have to read past
            what they already know to prove they know it. */}
        <button
          onClick={onSkipCrucible}
          style={{
            background: "none",
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 8,
            padding: "5px 11px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            color: color.inkMuted,
          }}
        >
          {t.iKnowThis}
        </button>
      </div>

      {/* Segment progress */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          gap: 6,
          padding: "12px 24px 0",
        }}
      >
        {chunks.map((c, i) => (
          <div
            key={c.id}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= session.idx ? color.accent : "rgba(44,40,35,0.12)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>

      {/* Reading column */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "40px 32px 120px" }}>
          <div style={{ ...kicker(11), marginBottom: 10 }}>
            {t.kicker}
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 34,
              lineHeight: 1.12,
              margin: "0 0 8px",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 14.5,
              color: color.inkMuted,
              margin: "0 0 34px",
              maxWidth: 640,
              lineHeight: 1.55,
            }}
          >
            {/* While still streaming, `chunks.length` is a running count, not
                the pass's final section count — fall back to the no-count
                phrasing rather than announcing a number that's about to
                change. */}
            {t.intro(streaming ? 0 : chunks.length)}{" "}
            {t.introTail}
          </p>

          {/* The very first open of a fresh node: the screen is already up,
              the first section is still being written. A blank page reads as
              broken; a shape of what's coming reads as "in progress". */}
          {chunks.length === 0 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp .3s both" }}
            >
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11.5,
                  color: color.inkGhost,
                  marginBottom: 4,
                }}
              >
                {t.writingFirst}
              </div>
              {[220, 100, "94%", "88%", "70%"].map((w, i) => (
                <div
                  key={i}
                  style={{
                    height: i === 0 ? 22 : 14,
                    width: typeof w === "number" ? w : w,
                    borderRadius: 5,
                    background: "rgba(44,40,35,0.08)",
                    animation: "pulseGlow 1.6s ease-in-out infinite",
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
          )}

          {visible.map((c, i) => {
            const vkey = session.variant[c.id] ?? null;
            const altText = vkey && c.alt ? c.alt[vkey] : null;
            const isDeepest = i === visible.length - 1;
            // While streaming, the deepest chunk in hand isn't provably the
            // pass's last section yet — never claim "last" until the stream
            // has actually finished.
            const isLast = i === chunks.length - 1 && !streaming;
            const nextArrived = i + 1 < chunks.length;
            const ans = session.answered[c.id];
            // The session's one hook, on the opening section. It sits above
            // the prose and clears once answered or waved off — the material
            // underneath was never waiting on it.
            const hookOpen = !!c.pred && !ans && !session.hookSkipped;
            const verdict =
              c.pred && ans
                ? ans.correct
                  ? { text: c.pred.right, color: RIGHT }
                  : { text: c.pred.wrong, color: WRONG }
                : null;

            return (
              <div
                key={c.id}
                style={{
                  marginBottom: 40,
                  paddingBottom: 40,
                  borderBottom: `1px solid rgba(44,40,35,0.08)`,
                  animation: "fadeUp 0.4s both",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: BLUE,
                    }}
                  >
                    {c.kicker}
                  </span>
                  {voiceOn && (
                    <SpeakerButton
                      active={speakingChunk === c.id}
                      paused={reading.paused}
                      onClick={() => toggleReading(c)}
                    />
                  )}
                </div>

                {/* Pre-taught terms */}
                {c.terms.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 18,
                    }}
                  >
                    {c.terms.map((term) => {
                      const key = `${c.id}:${term.t}`;
                      const open = session.term === key;
                      return (
                        <div
                          key={key}
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <button
                            onClick={() => onToggleTerm(key)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              padding: "5px 11px",
                              background: color.chipBg,
                              border: `1px solid ${color.hairlineStrong}`,
                              borderRadius: 20,
                              fontSize: 12.5,
                              color: color.inkSoft,
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 9,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: color.amberInk,
                              }}
                            >
                              {t.term}
                            </span>
                            {term.t}
                          </button>
                          {open && (
                            <div
                              style={{
                                marginTop: 7,
                                maxWidth: 340,
                                fontSize: 13,
                                lineHeight: 1.5,
                                color: color.inkSoft,
                                background: color.amberBg,
                                border: "1px solid rgba(160,106,48,0.2)",
                                borderRadius: 9,
                                padding: "9px 12px",
                                animation: "fadeUp .25s both",
                              }}
                            >
                              {term.d}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* The one prediction hook — optional, and never a gate. */}
                {hookOpen && c.pred && (
                  <div
                    style={{
                      background: color.card,
                      border: "1px solid rgba(91,127,191,0.28)",
                      borderRadius: 13,
                      padding: "18px 20px",
                      marginBottom: 22,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: BLUE,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: BLUE,
                        }}
                      >
                        {t.optionalGuessFirst}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        <AnswerModeToggle
                          mode={mode}
                          onMode={setMode}
                          accent={BLUE}
                        />
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 20,
                        lineHeight: 1.32,
                        marginBottom: 16,
                      }}
                    >
                      {c.pred.q}
                    </div>
                    {mode === "open" ? (
                      <OpenAnswer
                        topic={topic}
                        nodeLabel={title}
                        question={c.pred.q}
                        options={c.pred.opts.map((o) => o.label)}
                        onResolve={(oi) =>
                          onAnswer(c.id, oi, c.pred!.opts[oi].correct)
                        }
                        placeholder={t.predictPlaceholder}
                        rows={2}
                        accent={BLUE}
                        submitLabel={t.lockInGuess}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 9,
                        }}
                      >
                        {c.pred.opts.map((o, oi) => (
                          <button
                            key={o.label}
                            onClick={() => onAnswer(c.id, oi, o.correct)}
                            style={{
                              textAlign: "left",
                              padding: "13px 16px",
                              borderRadius: 10,
                              fontSize: 14.5,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              border: `1px solid ${color.hairlineStrong}`,
                              background: color.card,
                              color: color.ink,
                              transition: "all .15s",
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={onSkipHook}
                      style={{
                        marginTop: 14,
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontFamily: "inherit",
                        fontSize: 13,
                        color: color.inkMuted,
                        cursor: "pointer",
                      }}
                    >
                      {t.skipTeachMe}
                    </button>
                  </div>
                )}

                {/* The verdict outlives the hook; the guess still gets caught. */}
                {verdict && (
                  <div
                    style={{
                      display: "flex",
                      gap: 11,
                      alignItems: "baseline",
                      marginBottom: 22,
                      paddingLeft: 14,
                      borderLeft: `3px solid ${verdict.color}`,
                      animation: "softIn .3s both",
                    }}
                  >
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontFamily: font.mono,
                        fontSize: 9.5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: verdict.color,
                      }}
                    >
                      {t.yourGuess}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: color.inkSoft,
                      }}
                    >
                      {verdict.text}
                    </span>
                  </div>
                )}

                {/* The material — dual-coded, and on screen from the start. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 300px",
                    gap: 30,
                    alignItems: "start",
                  }}
                >
                  <div>
                    {c.body.map((para, pi) => {
                      // Body paragraphs lead the spoken segments, so the
                      // reading index maps straight onto them.
                      const spokenNow = speakingChunk === c.id && reading.index === pi;
                      return (
                        <p
                          key={pi}
                          style={{
                            fontFamily: font.serif,
                            fontSize: 19,
                            lineHeight: 1.68,
                            margin: "0 -8px 18px",
                            padding: "2px 8px",
                            borderRadius: 7,
                            background: spokenNow ? color.accentBg : "transparent",
                            transition: "background .25s",
                            color: color.ink,
                          }}
                        >
                          {para}
                        </p>
                      );
                    })}

                    <WorkedExample example={c.example} />

                    <div
                      style={{
                        marginTop: 22,
                        display: "flex",
                        gap: 12,
                        alignItems: "baseline",
                        background: color.accentBg,
                        border: "1px solid rgba(47,107,79,0.18)",
                        borderRadius: 10,
                        padding: "13px 16px",
                      }}
                    >
                      <span
                        style={{
                          flex: "0 0 auto",
                          fontFamily: font.mono,
                          fontSize: 9.5,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: color.accent,
                        }}
                      >
                        {t.takeaway}
                      </span>
                      <span
                        style={{
                          fontFamily: font.serif,
                          fontSize: 16.5,
                          lineHeight: 1.5,
                          color: color.ink,
                        }}
                      >
                        {c.takeaway}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        fontSize: 12,
                        color: color.inkFaint,
                        margin: "18px 0",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 9,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: color.amberInk,
                          border: "1px solid rgba(160,106,48,0.3)",
                          borderRadius: 5,
                          padding: "1px 6px",
                        }}
                      >
                        {t.source}
                      </span>
                      {c.cite}
                    </div>

                    {/* Adaptive-modality rewrites — generated after the
                        reading itself, so on a fresh (uncached) open they
                        may still be on the way for a few seconds. */}
                    {c.alt ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {ALT_CONTROLS.map(([key, label]) => {
                          const active = vkey === key;
                          return (
                            <button
                              key={key}
                              onClick={() => onSetVariant(c.id, key)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: font.mono,
                                border: `1px solid ${
                                  active ? color.accent : color.hairlineStrong
                                }`,
                                background: active ? color.accentBg : color.card,
                                color: active ? color.accent : color.inkMuted,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: color.inkGhost,
                        }}
                      >
                        {t.rewritesWriting}
                      </div>
                    )}
                    {altText && (
                      <div
                        style={{
                          marginTop: 11,
                          fontSize: 15,
                          lineHeight: 1.62,
                          color: color.inkSoft,
                          background: color.chipBg,
                          borderRadius: 10,
                          padding: "15px 17px",
                          whiteSpace: "pre-line",
                          animation: "fadeUp .3s both",
                        }}
                      >
                        {altText}
                      </div>
                    )}

                    {/* Highlight → ask (mini-Socratic aside) */}
                    <div style={{ marginTop: 16 }}>
                      <button
                        onClick={() => onToggleAside(c.id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: 13,
                          color: color.accent,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: 3,
                        }}
                      >
                        {t.askAboutPassage}
                      </button>
                      {session.aside === c.id && (
                        <div
                          style={{
                            marginTop: 11,
                            borderLeft: `3px solid ${color.accent}`,
                            padding: "2px 0 2px 14px",
                            animation: "fadeUp .3s both",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12.5,
                              color: color.inkFaint,
                              marginBottom: 6,
                            }}
                          >
                            {t.socraticAside}
                          </div>
                          <div
                            style={{
                              fontFamily: font.serif,
                              fontSize: 16,
                              lineHeight: 1.45,
                              color: color.ink,
                            }}
                          >
                            {c.ask}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ position: "sticky", top: 12 }}>
                    {c.figure && <Figure id={c.id} figure={c.figure} />}
                    <div
                      style={{
                        marginTop: 9,
                        fontFamily: font.mono,
                        fontSize: 10.5,
                        lineHeight: 1.45,
                        color: color.inkFaint,
                      }}
                    >
                      {t.diagramLabel} {c.diagram}
                    </div>
                  </div>
                </div>

                {/* Continue / finish — only on the deepest revealed section */}
                {isDeepest &&
                  (nextArrived || isLast ? (
                    <div style={{ marginTop: 30 }}>
                      <button
                        onClick={() => (isLast ? onFinish() : onContinue(i))}
                        style={
                          isLast
                            ? {
                                padding: "14px 24px",
                                background: color.accent,
                                color: color.accentInk,
                                border: "none",
                                borderRadius: 12,
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
                              }
                            : {
                                padding: "12px 20px",
                                background: color.card,
                                color: color.ink,
                                border: `1px solid ${color.hairlineStrong}`,
                                borderRadius: 11,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }
                        }
                      >
                        {isLast
                          ? t.finishBeginSocratic
                          : t.continueSection(sectionName(chunks[i + 1].kicker))}
                      </button>
                    </div>
                  ) : (
                    // Caught up to the writer — the next section is still
                    // being generated.
                    <div
                      style={{
                        marginTop: 30,
                        fontSize: 13,
                        color: color.inkFaint,
                        fontStyle: "italic",
                      }}
                    >
                      {t.writingNext}
                    </div>
                  ))}
              </div>
            );
          })}

          {/* Edge case: diagnostic overshoot */}
          {overshoot && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: color.successBg,
                border: "1px solid rgba(76,139,99,0.3)",
                borderRadius: 13,
                padding: "18px 22px",
                marginBottom: 16,
                animation: "fadeUp .4s both",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    marginBottom: 3,
                  }}
                >
                  {t.overshootTitle}
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted }}>
                  {t.overshootBody}
                </div>
              </div>
              <button
                onClick={onSkipCrucible}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  background: color.accent,
                  color: color.accentInk,
                  border: "none",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.skipToCrucible}
              </button>
            </div>
          )}

          {/* Edge case: leaning on "simpler" — flag a missing prerequisite */}
          {simpleFlag && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: color.amberBg,
                border: "1px solid rgba(160,106,48,0.28)",
                borderRadius: 13,
                padding: "18px 22px",
                animation: "fadeUp .4s both",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 19,
                    marginBottom: 3,
                  }}
                >
                  {t.simplifyingTitle}
                </div>
                <div style={{ fontSize: 13.5, color: color.inkMuted }}>
                  {t.simplifyingBody}
                </div>
              </div>
              <button
                onClick={onRoutePrereq}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 18px",
                  background: color.card,
                  color: color.amberInk,
                  border: "1px solid rgba(160,106,48,0.4)",
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.reviewPrereq}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
