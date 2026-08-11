"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MicButton } from "@/components/VoiceInput";
import { SkeletonBars, StreamingText } from "@/components/Pending";
import { InlineError } from "@/components/ErrorState";
import {
  PHASES,
  STATE_COLOR,
  altControls,
  figureLayers,
  lensNote,
  type AltKey,
  type ConsumeChunk,
  type ConsumeExample,
  type ConsumeFigure,
  type ConsumeModelBeat,
  type ConsumePrediction,
  type ConsumeProgress,
} from "@/lib/curriculum";
import { segmentsForChunk, useReadAloud, useVoicePrefs } from "@/lib/speech";
import { color, font, kicker, motion, transition } from "@/lib/theme";
import { usePresence } from "@/lib/motion";
import { useLanguage, useT } from "@/lib/i18n";
import Sheet from "@/components/Sheet";
import type { PresenceState } from "@/lib/motion";

import Rich from "@/components/Rich";
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
    takeaway: "Takeaway",
    furtherReading: "further reading",
    modelKicker: "Model view",
    modelOpening: "Opening this view…",
    modelWriting: "still writing…",
    modelBeat: (n: number, total: number) => `Beat ${n} of ${total}`,
    modelNext: "Next beat ↓",
    modelRevealAll: "Show all",
    modelClose: "Close",
    modelBack: "← Back to the section",
    modelEmpty: "This view came back empty — close it and try another lens.",
    diagramLabel: "diagram ·",
    finishBeginSocratic: "Finish · begin Socratic →",
    continueSection: (next: string) => `Continue · ${next} ↓`,
    writingNext: "Writing the next section…",
    simplifyingTitle: "Simplifying a lot?",
    simplifyingBody:
      "Repeatedly reaching for the simpler version usually means an earlier concept is shaky.",
    reviewPrereq: "Review prerequisite →",
    term: "term",
    readAloud: "Read this section aloud",
    pauseReading: "Pause the reading",
    resumeReading: "Resume the reading",
    startingReading: "Starting the reading…",
    skipSection: "Skip — I know this",
    showFullSection: "Show full section →",
    minLeft: (n: number) => (n > 0 ? `~${n} min left` : ""),
    askFloating: "Ask about this →",
    jumpTo: (n: number, name: string) => `Jump to section ${n} · ${name}`,
    figureOf: (name: string) => `Diagram: ${name}`,
    yourDefault: "your default",
    // ---- ask about this
    askSection: "Ask about this section →",
    askAbout: "You asked about",
    askWholeSection: "About this section",
    askPlaceholder: "What didn’t land? Ask in your own words…",
    askSubmit: "Ask →",
    askExplain: "Explain this →",
    askSuggested: "Not sure what to ask?",
    askThinking: "Reading the passage…",
    askClose: "Close",
    readingIncomplete:
      "The rest of this reading pass didn’t arrive — what’s above is complete.",
    readingRetry: "Fetch the rest",
    askFailed: "Couldn’t answer that one.",
    askRetry: "Ask again",
    // ---- the closing beat
    recapKicker: "Session · Consume — complete",
    recapTitle: (t: string) => `That was ${t}.`,
    recapLead:
      "Everything below came out of the reading you just did. Socratic starts from here — it will ask you to rebuild it without looking.",
    recapSections: (n: number) => `${n} section${n === 1 ? "" : "s"} read`,
    recapMinutes: (n: number) => `~${n} min`,
    recapTerms: (n: number) => `${n} term${n === 1 ? "" : "s"} met`,
    recapTakeaways: "What you took away",
    recapSkipped: "skipped",
    recapTermsHeading: "Terms you opened",
    recapBegin: "Begin Socratic →",
    recapBackToMap: "Back to the map",
    recapReread: "↑ Re-read",
    checkKicker: "Before you continue",
    checkHint: "Answer from what you just read — this unlocks the next section.",
    checkAgain: "Not quite — read that part again, then pick another.",
    checkPassed: "Understood",
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
    takeaway: "Ideia central",
    furtherReading: "para ler depois",
    modelKicker: "Visão do modelo",
    modelOpening: "Abrindo esta visão…",
    modelWriting: "ainda sendo escrito…",
    modelBeat: (n: number, total: number) => `Passo ${n} de ${total}`,
    modelNext: "Próximo passo ↓",
    modelRevealAll: "Mostrar tudo",
    modelClose: "Fechar",
    modelBack: "← Voltar à seção",
    modelEmpty: "Esta visão voltou vazia — feche e tente outra lente.",
    diagramLabel: "diagrama ·",
    finishBeginSocratic: "Concluir · começar o Socrático →",
    continueSection: (next: string) => `Continuar · ${next} ↓`,
    writingNext: "Escrevendo a próxima seção…",
    simplifyingTitle: "Simplificando bastante?",
    simplifyingBody:
      "Recorrer repetidamente à versão mais simples geralmente indica que um conceito anterior está instável.",
    reviewPrereq: "Revisar pré-requisito →",
    term: "termo",
    readAloud: "Ouvir esta seção",
    pauseReading: "Pausar a leitura",
    resumeReading: "Continuar a leitura",
    startingReading: "Iniciando a leitura…",
    skipSection: "Pular — já sei isso",
    showFullSection: "Mostrar seção completa →",
    minLeft: (n: number) => (n > 0 ? `~${n} min restantes` : ""),
    askFloating: "Perguntar sobre isto →",
    jumpTo: (n: number, name: string) => `Ir para a seção ${n} · ${name}`,
    figureOf: (name: string) => `Diagrama: ${name}`,
    yourDefault: "seu padrão",
    // ---- ask about this
    askSection: "Perguntar sobre esta seção →",
    askAbout: "Você perguntou sobre",
    askWholeSection: "Sobre esta seção",
    askPlaceholder: "O que não ficou claro? Pergunte com suas palavras…",
    askSubmit: "Perguntar →",
    askExplain: "Explicar isto →",
    askSuggested: "Não sabe o que perguntar?",
    askThinking: "Lendo o trecho…",
    askClose: "Fechar",
    readingIncomplete:
      "O resto desta leitura não chegou — o que está acima está completo.",
    readingRetry: "Buscar o resto",
    askFailed: "Não consegui responder essa.",
    askRetry: "Perguntar de novo",
    // ---- the closing beat
    recapKicker: "Sessão · Consumir — concluída",
    recapTitle: (t: string) => `Isso foi ${t}.`,
    recapLead:
      "Tudo abaixo saiu da leitura que você acabou de fazer. O Socrático começa daqui — ele vai pedir que você reconstrua isso sem olhar.",
    recapSections: (n: number) => `${n} ${n === 1 ? "seção lida" : "seções lidas"}`,
    recapMinutes: (n: number) => `~${n} min`,
    recapTerms: (n: number) => `${n} ${n === 1 ? "termo visto" : "termos vistos"}`,
    recapTakeaways: "O que você leva daqui",
    recapSkipped: "pulada",
    recapTermsHeading: "Termos que você abriu",
    recapBegin: "Começar o Socrático →",
    recapBackToMap: "Voltar ao mapa",
    recapReread: "↑ Reler",
    checkKicker: "Antes de continuar",
    checkHint: "Responda com o que você acabou de ler — isso libera a próxima seção.",
    checkAgain: "Ainda não — releia esse trecho e escolha outra.",
    checkPassed: "Entendido",
  },
} as const;

/** An open "ask about this" — one per session, held by AtlasApp because the
 *  answer streams in from the server. The draft question stays local to the
 *  panel; only a submitted ask reaches here. */
export interface PassageAsk {
  chunkId: string;
  /** What the learner highlighted, or "" when they asked about the whole
   *  section (the keyboard path — selection is a pointer gesture). */
  selection: string;
  /** The submitted question, or "" for a bare "explain this". */
  question: string;
  /** Answer paragraphs as they stream in. */
  parts: string[];
  status: "composing" | "asking" | "done" | "error";
}

/**
 * The live state of one Consume session — held by AtlasApp, read here.
 *
 * It *is* the persisted `ConsumeProgress` plus the transient UI nobody needs
 * restored: which term pill is open, whether an ask panel is up, whether the
 * closing recap has taken over the screen. Keeping it one type is what makes
 * resuming a session and saving one the same operation minus a spread.
 */
export interface ConsumeSession extends ConsumeProgress {
  nodeId: string;
  /** The pre-taught term expanded inline, keyed `chunkId:term`. */
  term: string | null;
  /** The learned modality this learner reads best in — the lens marked as
   *  theirs on sections they haven't opened one over yet (§6's adaptive
   *  modality). It suggests; it never opens anything by itself. */
  preferred: AltKey | null;
  /** The model view currently open over a section, or null. The section it
   *  belongs to stays mounted underneath — a lens opens over the reading, it
   *  never replaces it. */
  model: { chunkId: string; lens: AltKey } | null;
  /** The open "ask about this", or null. */
  passage: PassageAsk | null;
  /** The reading is done and the closing recap is on screen. */
  recap: boolean;
}

interface ConsumeViewProps {
  /** Enter/leave state for the shared `Sheet` root — AtlasApp holds this
   *  screen mounted through its exit. */
  presence: PresenceState;
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
  /** Beats of the open model view, in order. Empty (or short) while they are
   *  still being written — the view opens on its first one. */
  modelBeats?: ConsumeModelBeat[];
  /** More beats are still on the way for the open view. */
  modelStreaming?: boolean;
  onExit: () => void;
  /** The end-of-section check was answered — right or wrong. */
  onCheck: (chunkId: string, oi: number, correct: boolean) => void;
  onContinue: (chunkIndex: number) => void;
  /** The last section is done — show the recap. */
  onFinish: () => void;
  /** The recap's CTA: hand off to Socratic. */
  onBeginSocratic: () => void;
  /** Open a lens over a section. The whole chunk travels up because the model
   *  view is written for this section's exact prose — the caller keys its
   *  request on it. */
  onOpenModel: (chunk: ConsumeChunk, lens: AltKey) => void;
  onCloseModel: () => void;
  onToggleTerm: (key: string) => void;
  onToggleCollapse: (chunkId: string) => void;
  /** Open the ask panel on a chunk. `selection` is "" for the whole section. */
  onOpenPassage: (chunkId: string, selection: string) => void;
  onClosePassage: () => void;
  /** Submit the question — the answer streams back into `session.passage`. */
  onAskPassage: (question: string) => void;
  onSkipCrucible: () => void;
  onRoutePrereq: () => void;
  /** Set when the reading pass stopped mid-stream. The sections that landed
   *  stay exactly as they are; this is the notice pinned under them. */
  incomplete?: { onRetry: () => void };
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

// SVG <text> can't hold <Rich>'s HTML span — it renders as an unknown element
// in the SVG namespace, i.e. an empty box. Labels are short, so drop the
// markdown punctuation instead of styling it.
function plain(label: string): string {
  return label.replace(/`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g, "$1$2$3$4");
}

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

function Figure({
  id,
  figure,
  caption,
}: {
  id: string;
  figure: ConsumeFigure;
  /** The diagram's own caption — becomes the figure's accessible name, so a
   *  screen reader gets what the picture is about rather than "graphic". */
  caption: string;
}) {
  const t = useT(STRINGS);
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
    const laid = row.map((n) => wrap(plain(n.label), w));
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
      aria-labelledby={`figt-${id}`}
      style={{
        width: "100%",
        height: "auto",
        borderRadius: 12,
        border: `1px solid ${color.hairline}`,
        background: color.card,
        display: "block",
      }}
    >
      {/* The accessible name. Without it this is an unlabeled `role="img"` —
          announced as a graphic with nothing in it. */}
      <title id={`figt-${id}`}>{t.figureOf(caption)}</title>
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
                {plain(e.label)}
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
  loading,
  onClick,
}: {
  active: boolean;
  paused: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const t = useT(STRINGS);
  const label = !active
    ? t.readAloud
    : loading
      ? t.startingReading
      : paused
        ? t.resumeReading
        : t.pauseReading;
  // Waiting on the engine is neither playing nor paused: the pause bars would
  // be a lie, so it keeps the speaker glyph and breathes instead.
  const showPause = active && !paused && !loading;
  return (
    <button
      className="at-press"
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
        animation: active && loading ? "breathe 1.1s ease-in-out infinite" : undefined,
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
        <Rich text={example.title} />
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
              <Rich text={s} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * "Ask about this" — the learner's own question about the passage they just
 * highlighted, answered against this section.
 *
 * The draft question is local state on purpose: lifting every keystroke into
 * the session would re-render the whole reading column per character. Only a
 * submitted ask goes up, and the streamed answer comes back down.
 */
function PassagePanel({
  ask,
  suggestion,
  onAsk,
  onClose,
}: {
  ask: PassageAsk;
  /** The model's pre-written question for this section — the "not sure what to
   *  ask?" seed, which is all `chunk.ask` was ever able to be. */
  suggestion: string;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const composing = ask.status === "composing";

  useEffect(() => {
    if (composing) boxRef.current?.focus();
  }, [composing]);

  const submit = () => {
    if (!composing) return;
    onAsk(draft.trim());
  };

  return (
    <div
      style={{
        marginTop: 18,
        borderLeft: `3px solid ${color.accent}`,
        background: color.accentBg,
        borderRadius: "0 10px 10px 0",
        padding: "14px 16px",
        animation: "fadeUp .3s both",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 9 }}>
        <span style={{ ...kicker(9.5, "0.12em"), color: color.accent }}>
          {ask.selection ? t.askAbout : t.askWholeSection}
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="at-press"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
            fontSize: 12,
            color: color.inkFaint,
            cursor: "pointer",
          }}
        >
          {t.askClose}
        </button>
      </div>

      {ask.selection && (
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 15,
            lineHeight: 1.5,
            color: color.inkSoft,
            fontStyle: "italic",
            marginBottom: 12,
            // A long highlight must not push the answer off the screen.
            maxHeight: 96,
            overflowY: "auto",
          }}
        >
          “{ask.selection}”
        </div>
      )}

      {composing ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={boxRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              rows={2}
              placeholder={t.askPlaceholder}
              style={{
                flex: 1,
                resize: "vertical",
                padding: "10px 12px",
                borderRadius: 9,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.card,
                color: color.ink,
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            />
            <MicButton value={draft} onChange={setDraft} />
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              className="at-press"
              onClick={submit}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "none",
                background: color.accent,
                color: color.accentInk,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {draft.trim() ? t.askSubmit : t.askExplain}
            </button>
            {suggestion && !draft.trim() && (
              <button
                className="at-press"
                onClick={() => setDraft(suggestion)}
                title={suggestion}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {t.askSuggested}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {ask.question && (
            <div
              style={{
                fontSize: 13.5,
                color: color.inkMuted,
                marginBottom: 10,
              }}
            >
              <Rich text={ask.question} />
            </div>
          )}
          {ask.parts.map((p, i) => (
            <p
              key={i}
              style={{
                fontFamily: font.serif,
                fontSize: 16.5,
                lineHeight: 1.62,
                color: color.ink,
                margin: i === 0 ? "0 0 12px" : "0 0 12px",
              }}
            >
              {/* The answer arrives word by word; the nib sits at the end of
                  the paragraph being written, never on the ones behind it. */}
              <StreamingText
                text={p}
                writing={ask.status === "asking" && i === ask.parts.length - 1}
              />
            </p>
          ))}
          {ask.status === "asking" && ask.parts.length === 0 && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.inkGhost,
                // `breathe`, not `pulseGlow`: this is bare text with no box to
                // cast a shadow, so the glow keyframe animated nothing at all.
                animation: "breathe 1.8s ease-in-out infinite",
              }}
            >
              {t.askThinking}
            </div>
          )}
          {ask.status === "error" && (
            // Was a bare red line with nothing to do about it. The retry
            // re-asks the same question — the learner shouldn't have to
            // re-type it because the network dropped.
            <InlineError
              message={t.askFailed}
              retryLabel={t.askRetry}
              onRetry={onAsk ? () => onAsk(ask.question) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The comprehension check that closes a section. It stays out of the way until
 * the learner has actually scrolled to the end of the reading — the card
 * animates in the first time its slot crosses into view — and the section's
 * Continue only appears once the answer is right. A wrong pick is named and
 * the options stay live: this is a receipt for reading, not a score.
 */
function SectionCheck({
  check,
  answer,
  onAnswer,
}: {
  check: ConsumePrediction;
  answer?: { oi: number; correct: boolean };
  onAnswer: (oi: number, correct: boolean) => void;
}) {
  const t = useT(STRINGS);
  const slot = useRef<HTMLDivElement>(null);
  // Answered before this mounted (re-render after a scroll away) → already in.
  const [revealed, setRevealed] = useState(!!answer);
  useEffect(() => {
    if (revealed || !slot.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setRevealed(true);
      },
      // Not merely peeking over the fold — the end of the section has to be
      // properly on screen.
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(slot.current);
    return () => io.disconnect();
  }, [revealed]);

  const passed = !!answer?.correct;

  return (
    <div ref={slot} style={{ minHeight: 1, marginTop: 30 }}>
      {revealed && (
        <div
          style={{
            background: color.card,
            border: `1px solid ${passed ? "rgba(76,139,99,0.4)" : "rgba(91,127,191,0.28)"}`,
            borderRadius: 13,
            padding: "18px 20px",
            animation: "fadeUp .45s both",
            transition: transition("border-color"),
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
                background: passed ? RIGHT : BLUE,
              }}
            />
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: passed ? RIGHT : BLUE,
              }}
            >
              {passed ? t.checkPassed : t.checkKicker}
            </span>
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 20,
              lineHeight: 1.32,
              marginBottom: 6,
            }}
          >
            <Rich text={check.q} />
          </div>
          {!passed && (
            <div
              style={{ fontSize: 13, color: color.inkFaint, marginBottom: 14 }}
            >
              {t.checkHint}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {check.opts.map((o, oi) => {
              const picked = answer?.oi === oi;
              const shown = passed ? o.correct : picked;
              return (
                <button
                  className="at-press"
                  key={o.label}
                  onClick={passed ? undefined : () => onAnswer(oi, o.correct)}
                  disabled={passed}
                  style={{
                    textAlign: "left",
                    padding: "13px 16px",
                    borderRadius: 10,
                    fontSize: 14.5,
                    fontFamily: "inherit",
                    cursor: passed ? "default" : "pointer",
                    border: `1px solid ${
                      shown
                        ? o.correct
                          ? RIGHT
                          : WRONG
                        : color.hairlineStrong
                    }`,
                    background: shown
                      ? o.correct
                        ? color.successBg
                        : color.card
                      : color.card,
                    color: color.ink,
                    opacity: passed && !o.correct ? 0.5 : 1,
                  }}
                >
                  <Rich text={o.label} />
                </button>
              );
            })}
          </div>
          {answer && (
            <div
              style={{
                marginTop: 14,
                paddingLeft: 13,
                borderLeft: `3px solid ${passed ? RIGHT : WRONG}`,
                fontSize: 14,
                lineHeight: 1.55,
                color: color.inkSoft,
                animation: "softIn .3s both",
              }}
            >
              {passed ? check.right : `${t.checkAgain} ${check.wrong}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** How long one beat holds the floor before the next reveals itself. Long
 *  enough to read a couple of sentences, short enough that nobody sits waiting
 *  — and skippable either way ("Next beat", "Show all"). */
const BEAT_MS = 3400;
const MODEL_EXIT_MS = motion.duration.fast;

/**
 * The model view: one lens, opened over the section it belongs to.
 *
 * The four controls used to swap the section's prose for a rewrite, which took
 * away the passage the learner was reading in the act of explaining it. This
 * opens on top instead — the section stays exactly where it was, under the
 * backdrop, and closing lands the learner back on the paragraph they left.
 *
 * Beats reveal one at a time rather than all at once, which is the point of a
 * *model* view: a mechanism read in sequence is a mechanism, read as a wall of
 * text it is prose. The cascade is on a timer, so it looks the same whether the
 * beats streamed in over ten seconds or came back cached in ten milliseconds.
 */
function ModelView({
  open,
  lens,
  chunk,
  beats,
  streaming,
  onClose,
}: {
  /** False plays the leave animation; the dialog unmounts when it finishes. */
  open: boolean;
  lens: AltKey;
  chunk: ConsumeChunk;
  beats: ConsumeModelBeat[];
  streaming: boolean;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const label = new Map(altControls(language)).get(lens) ?? lens;
  const bodyRef = useRef<HTMLDivElement>(null);
  const { mounted, state } = usePresence(open, MODEL_EXIT_MS);

  // Beats on screen so far. Never runs ahead of what has actually arrived, so
  // the cascade and the stream share one counter.
  const [revealed, setRevealed] = useState(1);
  const shown = Math.min(revealed, beats.length);
  const done = shown >= beats.length && !streaming;

  useEffect(() => {
    if (revealed >= beats.length) return;
    const id = window.setTimeout(() => setRevealed((n) => n + 1), BEAT_MS);
    return () => window.clearTimeout(id);
  }, [revealed, beats.length]);

  // A revealed beat below the fold is a beat nobody sees — follow the cascade
  // down. `smooth` on the container, not the page: the reading behind must not
  // move.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — ${chunk.kicker}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(28,25,21,0.42)",
        backdropFilter: "blur(3px)",
        animation:
          state === "in"
            ? `softIn ${motion.duration.base}ms ${motion.ease.enter} both`
            : `softOut ${MODEL_EXIT_MS}ms ${motion.ease.exit} both`,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 100%)",
          maxHeight: "min(78vh, 720px)",
          display: "flex",
          flexDirection: "column",
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(28,25,21,0.28)",
          overflow: "hidden",
          animation:
            state === "in"
              ? `modelIn ${motion.duration.slow}ms ${motion.ease.enter} both`
              : `modelOut ${MODEL_EXIT_MS}ms ${motion.ease.exit} both`,
        }}
      >
        {/* Header — which lens, over which section */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            padding: "18px 22px 14px",
            borderBottom: `1px solid ${color.hairline}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: BLUE,
                marginBottom: 7,
              }}
            >
              {t.modelKicker} · {sectionName(chunk.kicker)}
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 1.2 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, color: color.inkMuted, marginTop: 5 }}>
              {lensNote(lens, language)}
            </div>
          </div>
          <button
            className="at-press"
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={t.modelClose}
            title={t.modelClose}
            style={{
              flex: "0 0 auto",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: "50%",
              border: `1px solid ${color.hairlineStrong}`,
              background: color.paper,
              color: color.inkMuted,
              fontSize: 15,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* The beats, on their rail */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          {beats.length === 0 && !streaming ? (
            // Nothing landed and nothing is coming: the generation failed and
            // was already toasted. Say so here rather than leaving a skeleton
            // pulsing at a learner forever.
            <div style={{ fontSize: 14, lineHeight: 1.6, color: color.inkMuted }}>
              {t.modelEmpty}
            </div>
          ) : beats.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.inkGhost,
                  marginBottom: 4,
                }}
              >
                {t.modelOpening}
              </div>
              <SkeletonBars widths={[150, "92%", "84%"]} heights={[12, 15, 15]} />
            </div>
          ) : (
            beats.slice(0, shown).map((beat, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  paddingBottom: i === shown - 1 ? 0 : 18,
                  animation: "fadeUp .45s both",
                }}
              >
                {/* Rail: a filled dot per beat, the thread between them drawn
                    only as far as the walkthrough has actually got. */}
                <div
                  style={{
                    flex: "0 0 auto",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 10,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      marginTop: 6,
                      background: BLUE,
                    }}
                  />
                  {i < shown - 1 && (
                    <span
                      style={{ flex: 1, width: 1, background: "rgba(91,127,191,0.32)" }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: color.inkFaint,
                      marginBottom: 6,
                    }}
                  >
                    <Rich text={beat.label} />
                  </div>
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 17,
                      lineHeight: 1.62,
                      color: color.ink,
                    }}
                  >
                    {/* The newest beat is still being written — its words land
                        as they are decoded, with the nib at the end. */}
                    <StreamingText
                      text={beat.text}
                      writing={streaming && i === beats.length - 1}
                    />
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Caught up to the writer. */}
          {beats.length > 0 && streaming && shown >= beats.length && (
            <div
              style={{
                marginTop: 18,
                paddingLeft: 24,
                fontFamily: font.mono,
                fontSize: 11,
                color: color.inkGhost,
                animation: "breathe 1.8s ease-in-out infinite",
              }}
            >
              {t.modelWriting}
            </div>
          )}
        </div>

        {/* Footer — the count, the skip, and the way back to the reading */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 22px",
            borderTop: `1px solid ${color.hairline}`,
            background: color.cardAlt,
          }}
        >
          {beats.length > 0 && (
            <span
              style={{ fontFamily: font.mono, fontSize: 10.5, color: color.inkFaint }}
            >
              {t.modelBeat(shown, beats.length)}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {shown < beats.length && (
            <>
              <button
                className="at-press"
                type="button"
                onClick={() => setRevealed(beats.length)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                }}
              >
                {t.modelRevealAll}
              </button>
              <button
                className="at-press"
                type="button"
                onClick={() => setRevealed((n) => n + 1)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 9,
                  border: `1px solid ${color.hairlineStrong}`,
                  background: color.card,
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: color.ink,
                  cursor: "pointer",
                }}
              >
                {t.modelNext}
              </button>
            </>
          )}
          {done && (
            <button
              className="at-press"
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 15px",
                borderRadius: 9,
                border: "none",
                background: color.accent,
                color: color.accentInk,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.modelBack}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConsumeView({
  title,
  topic,
  chunks,
  streaming = false,
  session,
  modelBeats,
  modelStreaming = false,
  onExit,
  onCheck,
  onContinue,
  onFinish,
  onBeginSocratic,
  onOpenModel,
  onCloseModel,
  onToggleTerm,
  onToggleCollapse,
  onOpenPassage,
  onClosePassage,
  onAskPassage,
  onSkipCrucible,
  onRoutePrereq,
  incomplete,
  presence,
}: ConsumeViewProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const controls = altControls(language);

  /** The lens last opened over a chunk, or null. This is a record of what the
   *  learner reached for — it marks a control, it never changes the prose. */
  const lensOf = (chunkId: string): AltKey | null => session.variant[chunkId] ?? null;
  /** …and whether the learned default is what's being suggested here, because
   *  they haven't opened a lens over this section themselves. */
  const suggestsDefault = (chunkId: string) =>
    !session.variant[chunkId] && session.preferred !== null;

  // Read-aloud: the reading pass is the one place in Atlas long enough to be
  // worth listening to. One section speaks at a time — starting another
  // cancels the first — and the hook cancels on unmount, since
  // `speechSynthesis` would otherwise keep talking after the learner leaves.
  const { readAloud: readAloudPref } = useVoicePrefs();
  const reading = useReadAloud({ language });
  const [spoken, setSpoken] = useState<string | null>(null);
  const voiceOn = reading.supported && readAloudPref;
  const speakingChunk = reading.speaking ? spoken : null;
  /** What a chunk reads aloud: its prose, its worked example, its takeaway.
   *  The voice reads what's on the page — and since a lens now opens *over*
   *  the section instead of rewriting it, that is never anything but this. */
  const segmentsOf = (c: ConsumeChunk) => segmentsForChunk(c);
  const toggleReading = (c: ConsumeChunk) => {
    if (speakingChunk === c.id) {
      if (reading.paused) reading.resume();
      else reading.pause();
      return;
    }
    setSpoken(c.id);
    reading.speak(segmentsOf(c));
  };

  // Only sections up to the deepest revealed one are on screen — the pass
  // unfolds in segments, never as a wall.
  const visible = chunks.slice(0, session.idx + 1);

  // The section the open lens belongs to, looked up rather than carried in
  // session state: while the pass is still streaming a section can be replaced
  // in place, and the view must render the copy that is actually on screen.
  const modelChunk = session.model
    ? chunks.find((c) => c.id === session.model?.chunkId)
    : undefined;
  // The lens dialog animates out after `session.model` has already cleared, so
  // the last open one is held back for those frames.
  const lastModel = useRef<{
    key: string;
    lens: AltKey;
    chunk: ConsumeChunk;
  } | null>(null);
  if (session.model && modelChunk) {
    lastModel.current = {
      key: `${session.model.chunkId}:${session.model.lens}`,
      lens: session.model.lens,
      chunk: modelChunk,
    };
  }

  let simpleCount = 0;
  for (const c of chunks) if (lensOf(c.id) === "simpler") simpleCount++;

  // Missing-prerequisite flag: leaning on "simpler" repeatedly. A learned
  // preference doesn't count as reaching for it — it's a default they set once.
  const simpleFlag = simpleCount >= 3 && session.preferred !== "simpler";

  const breadcrumb = PHASES.slice(0, 6).join(" → ");

  // Honest time-left estimate: word count of what's left, at ~200wpm.
  // ponytail: while still streaming we don't yet know the pass's true length
  // (4-6 sections), so the average size of what's landed so far stands in
  // for sections not yet written — close enough to plan a skim vs. a read.
  const wordsOf = (c: ConsumeChunk) =>
    c.body.join(" ").split(/\s+/).filter(Boolean).length +
    c.example.steps.join(" ").split(/\s+/).filter(Boolean).length;
  const readWords = chunks
    .slice(0, session.idx + 1)
    .reduce((sum, c) => sum + wordsOf(c), 0);
  const knownWords = chunks.reduce((sum, c) => sum + wordsOf(c), 0);
  const avgWords = chunks.length ? knownWords / chunks.length : 0;
  const projectedTotal = streaming ? Math.max(knownWords, avgWords * 5) : knownWords;
  const minutesLeft = Math.round(Math.max(0, projectedTotal - readWords) / 200);

  // Highlight → ask: a small floating button follows text selection inside
  // any section's prose, instead of a permanent link under every one of them.
  const [askHint, setAskHint] = useState<{
    chunkId: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.isCollapsed || !text) {
        setAskHint(null);
        return;
      }
      const anchor = sel.anchorNode;
      const el = anchor instanceof Element ? anchor : anchor?.parentElement;
      const prose = el?.closest("[data-chunk-id]") as HTMLElement | null;
      if (!prose) {
        setAskHint(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const parentRect = prose.getBoundingClientRect();
      setAskHint({
        chunkId: prose.dataset.chunkId!,
        text,
        x: rect.left - parentRect.left + rect.width / 2,
        y: rect.top - parentRect.top,
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // ---- the closing beat ---------------------------------------------------
  // Finishing the last section used to drop the learner straight into
  // Socratic. The reading is 8-15 minutes of work; it earns a beat that says
  // what it added before the next phase starts taking it away again.
  const totalWords = knownWords;
  const readMinutes = Math.max(1, Math.round(totalWords / 200));
  const termLabels = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const c of chunks)
      for (const term of c.terms) byKey.set(`${c.id}:${term.t}`, term.t);
    return session.termsSeen
      .map((k) => byKey.get(k))
      .filter((v): v is string => !!v);
  }, [chunks, session.termsSeen]);

  if (session.recap) {
    const stat = (text: string) => (
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: color.inkMuted,
        }}
      >
        <Rich text={text} />
      </span>
    );

    return (
      <Sheet
        presence={presence}
        style={{
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "72px 32px 100px" }}>
          <div style={{ ...kicker(11), color: color.accent, marginBottom: 12 }}>
            {t.recapKicker}
          </div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 36,
              lineHeight: 1.12,
              margin: "0 0 12px",
            }}
          >
            {t.recapTitle(title)}
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: color.inkMuted,
              margin: "0 0 18px",
            }}
          >
            {t.recapLead}
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 38 }}>
            {stat(t.recapSections(chunks.length))}
            {stat(t.recapMinutes(readMinutes))}
            {termLabels.length > 0 && stat(t.recapTerms(termLabels.length))}
          </div>

          <div style={{ ...kicker(10), marginBottom: 14 }}>{t.recapTakeaways}</div>
          <ol style={{ margin: "0 0 36px", padding: 0, listStyle: "none" }}>
            {chunks.map((c, i) => (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "baseline",
                  padding: "13px 0",
                  borderBottom: `1px solid ${color.hairline}`,
                }}
              >
                <span
                  style={{
                    flex: "0 0 auto",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.inkGhost,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      fontFamily: font.serif,
                      fontSize: 17,
                      lineHeight: 1.5,
                      color: color.ink,
                    }}
                  >
                    <Rich text={c.takeaway} />
                  </span>
                  {session.collapsed[c.id] && (
                    <span
                      style={{
                        marginLeft: 9,
                        fontFamily: font.mono,
                        fontSize: 9.5,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: color.inkGhost,
                      }}
                    >
                      {t.recapSkipped}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {termLabels.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ ...kicker(10), marginBottom: 12 }}>
                {t.recapTermsHeading}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {termLabels.map((label) => (
                  <span
                    key={label}
                    style={{
                      padding: "5px 11px",
                      background: color.chipBg,
                      border: `1px solid ${color.hairlineStrong}`,
                      borderRadius: 20,
                      fontSize: 12.5,
                      color: color.inkSoft,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <button
              className="at-press"
              onClick={onBeginSocratic}
              style={{
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
              }}
            >
              {t.recapBegin}
            </button>
            <button
              className="at-press"
              onClick={onExit}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                fontSize: 13.5,
                color: color.inkMuted,
                cursor: "pointer",
              }}
            >
              {t.recapBackToMap}
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet presence={presence}>
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
          className="at-press"
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
          className="at-press"
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

      {/* Segment progress — each revealed segment jumps straight to its
          section, instead of scroll-then-Continue being the only way back to
          it. Real buttons: this is navigation, and navigation has to be
          reachable from the keyboard. */}
      <nav
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 24px 0",
        }}
      >
        <div style={{ flex: 1, display: "flex", gap: 6 }}>
          {chunks.map((c, i) => {
            const reachable = i <= session.idx;
            return (
              <button
                className="at-press"
                key={c.id}
                type="button"
                disabled={!reachable}
                aria-label={t.jumpTo(i + 1, sectionName(c.kicker))}
                aria-current={i === session.idx ? "step" : undefined}
                onClick={() =>
                  document
                    .getElementById(c.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                style={{
                  flex: 1,
                  // The bar is 3px; the button is tall enough to hit, with the
                  // bar drawn inside it.
                  height: 14,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  background: "none",
                  border: "none",
                  cursor: reachable ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    height: 3,
                    borderRadius: 2,
                    background: reachable ? color.accent : "rgba(44,40,35,0.12)",
                    transition: transition("background"),
                  }}
                />
              </button>
            );
          })}
        </div>
        {minutesLeft > 0 && (
          <span
            style={{
              flex: "0 0 auto",
              fontFamily: font.mono,
              fontSize: 10.5,
              color: color.inkGhost,
            }}
          >
            {t.minLeft(minutesLeft)}
          </span>
        )}
      </nav>

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
              <SkeletonBars
                widths={[220, 100, "94%", "88%", "70%"]}
                heights={[22, 14, 14, 14, 14]}
              />
            </div>
          )}

          {visible.map((c, i) => {
            const vkey = lensOf(c.id);
            const isDeepest = i === visible.length - 1;
            // While streaming, the deepest chunk in hand isn't provably the
            // pass's last section yet — never claim "last" until the stream
            // has actually finished.
            const isLast = i === chunks.length - 1 && !streaming;
            const nextArrived = i + 1 < chunks.length;
            const collapsed = !!session.collapsed[c.id];
            // The prose stays put. A lens (below) opens *over* it — the
            // passage a learner is mid-way through is the last thing that
            // should disappear when they ask for help with it.
            const paragraphs = c.body;
            const checkPassed = !c.check || !!session.checks[c.id]?.correct;

            return (
              <div
                key={c.id}
                id={c.id}
                style={{
                  marginBottom: 40,
                  paddingBottom: 40,
                  borderBottom: `1px solid rgba(44,40,35,0.08)`,
                  animation: "fadeUp 0.4s both",
                  scrollMarginTop: 24,
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
                  {voiceOn && !collapsed && (
                    <SpeakerButton
                      active={speakingChunk === c.id}
                      paused={reading.paused}
                      loading={reading.loading}
                      onClick={() => toggleReading(c)}
                    />
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    className="at-press"
                    onClick={() => onToggleCollapse(c.id)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: 12,
                      color: color.inkFaint,
                      cursor: "pointer",
                    }}
                  >
                    {collapsed ? t.showFullSection : t.skipSection}
                  </button>
                </div>

                {collapsed && (
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 16,
                      color: color.inkSoft,
                      paddingLeft: 14,
                      borderLeft: `3px solid ${color.hairlineStrong}`,
                    }}
                  >
                    <Rich text={c.takeaway} />
                  </div>
                )}

                {/* Pre-taught terms */}
                {!collapsed && (
                <>

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
                            className="at-press"
                            onClick={() => onToggleTerm(key)}
                            aria-expanded={open}
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
                            <Rich text={term.t} />
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
                              <Rich text={term.d} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* The material — dual-coded, and on screen from the start. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: c.figure ? "1fr 300px" : "1fr",
                    gap: 30,
                    alignItems: "start",
                  }}
                >
                  <div data-chunk-id={c.id} style={{ position: "relative" }}>
                    {askHint?.chunkId === c.id && (
                      <button
                        className="at-press"
                        onClick={() => {
                          const text = askHint.text;
                          window.getSelection()?.removeAllRanges();
                          setAskHint(null);
                          onOpenPassage(c.id, text);
                        }}
                        style={{
                          position: "absolute",
                          left: askHint.x,
                          top: askHint.y - 34,
                          transform: "translateX(-50%)",
                          zIndex: 5,
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: color.accent,
                          color: color.accentInk,
                          fontSize: 12.5,
                          fontFamily: "inherit",
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.askFloating}
                      </button>
                    )}
                    {/* The prose itself. It is always the section's own — a
                        lens opens over it, never in place of it — so the
                        read-aloud highlight tracks these paragraphs directly. */}
                    {paragraphs.map((para, pi) => {
                      // Prose paragraphs lead the spoken segments, so the
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
                            transition: transition("background"),
                            color: color.ink,
                          }}
                        >
                          <Rich text={para} />
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
                        <Rich text={c.takeaway} />
                      </span>
                    </div>

                    {/* Where to go next on this, not a citation of the prose
                        above — the app can't verify a source, and dressing a
                        model-written reference as one buys trust it hasn't
                        earned. Named as what it is. */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 12,
                        flexWrap: "wrap",
                        margin: "14px 0",
                      }}
                    >
                      <span style={{ fontSize: 11, color: color.inkFaint }}>
                        {t.furtherReading} · {c.cite}
                      </span>
                      <div style={{ flex: 1 }} />
                      {/* The keyboard path to the same panel the highlight
                          gesture opens — selecting text is a pointer move. */}
                      <button
                        className="at-press"
                        onClick={() => onOpenPassage(c.id, "")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontFamily: "inherit",
                          fontSize: 12,
                          color: color.accent,
                          cursor: "pointer",
                        }}
                      >
                        {t.askSection}
                      </button>
                    </div>

                    {/* The four lenses. Each opens a model view over this
                        section — generated on demand for this section's exact
                        prose, so there is nothing to wait for before they are
                        offered. The one last opened stays marked: that is the
                        adaptive-modality record, and what the
                        missing-prerequisite flag counts. */}
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
                    >
                      {controls.map(([key, label]) => {
                        const used = vkey === key;
                        // The learned default is marked on sections the
                        // learner hasn't opened a lens over themselves — it
                        // leads them to it without opening anything for them.
                        const suggested = suggestsDefault(c.id) && session.preferred === key;
                        return (
                          <button
                            className="at-press"
                            key={key}
                            onClick={() => onOpenModel(c, key)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              cursor: "pointer",
                              fontFamily: font.mono,
                              border: `1px solid ${
                                used || suggested ? color.accent : color.hairlineStrong
                              }`,
                              background: used ? color.accentBg : color.card,
                              color: used || suggested ? color.accent : color.inkMuted,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {/* Says which one is theirs, so a marked control never
                          looks like a glitch. */}
                      {suggestsDefault(c.id) && (
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: color.inkGhost,
                          }}
                        >
                          {t.yourDefault}
                        </span>
                      )}
                    </div>

                    {/* Ask about this — the learner's own question about the
                        passage they highlighted, answered against this
                        section. */}
                    {session.passage?.chunkId === c.id && (
                      <PassagePanel
                        ask={session.passage}
                        suggestion={c.ask}
                        onAsk={onAskPassage}
                        onClose={onClosePassage}
                      />
                    )}
                  </div>
                  {c.figure && (
                    <div style={{ position: "sticky", top: 12 }}>
                      <Figure
                        id={c.id}
                        figure={c.figure}
                        caption={c.diagram ?? sectionName(c.kicker)}
                      />
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
                  )}
                </div>
                </>
                )}

                {/* The section's receipt: answered right, the way onward
                    appears; until then it is the only thing down here. */}
                {c.check && (
                  <SectionCheck
                    check={c.check}
                    answer={session.checks[c.id]}
                    onAnswer={(oi, correct) => onCheck(c.id, oi, correct)}
                  />
                )}

                {/* Continue / finish — only on the deepest revealed section,
                    and only once its check is passed (sections cached before
                    checks existed carry none, and stay ungated). */}
                {isDeepest &&
                  checkPassed &&
                  (nextArrived || isLast ? (
                    <div style={{ marginTop: 30 }}>
                      <button
                        className="at-press"
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

          {/* The stream died after some sections had landed. Everything above
              is real and readable; this says the rest isn't coming, which is
              the one thing a pass that simply stops can't say for itself. */}
          {incomplete && (
            <div style={{ margin: "8px 0 28px", maxWidth: 640 }}>
              <InlineError
                message={t.readingIncomplete}
                retryLabel={t.readingRetry}
                onRetry={incomplete.onRetry}
              />
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
                className="at-press"
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

      {/* The open lens. Mounted last and fixed-positioned, so the section it
          belongs to is still there — and still scrolled where the learner
          left it — the moment this closes. Keyed on section + lens so
          switching lenses restarts the cascade rather than continuing the
          previous one's count. */}
      {(modelChunk && session.model ? true : lastModel.current !== null) && (
        <ModelView
          key={
            modelChunk && session.model
              ? `${session.model.chunkId}:${session.model.lens}`
              : lastModel.current!.key
          }
          open={Boolean(modelChunk && session.model)}
          lens={
            session.model?.lens ?? (lastModel.current!.lens as AltKey)
          }
          chunk={modelChunk ?? lastModel.current!.chunk}
          beats={modelBeats ?? []}
          streaming={modelStreaming}
          onClose={onCloseModel}
        />
      )}
    </Sheet>
  );
}
