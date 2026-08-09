"use client";

import { useEffect, useRef, useState } from "react";
import {
  HELP_COLOR,
  PHASES,
  STATE_COLOR,
  helpLabels,
  socraticOutcome,
  type HelpLevel,
  type SocraticSession,
  type SocraticTurn,
} from "@/lib/curriculum";
import { InkDots, StreamingText } from "@/components/Pending";
import { MicButton } from "@/components/VoiceInput";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

import Rich from "@/components/Rich";
const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session · Socratic",
    scaffolding: "Scaffolding",
    breadcrumbLead:
      "Construct the idea · I catch wrong turns, I don’t smooth them over",
    doneGap: "Sub-point rebuilt — this gap can close.",
    doneUnderstood: "Understanding established — you reconstructed it unaided.",
    doneAssisted: "Understanding built — with a nudge along the way.",
    doneFlagged: "Leaning on being told — let's shore up the basics first.",
    advanceGap: "Close the gap · back to the map →",
    advanceTeach: "Teach it back · Feynman →",
    advanceBack: "Back to the map →",
    yourAnswer: "Your answer — in your own words",
    placeholderJudging: "Reading your answer…",
    placeholderWriting: "Writing the next probe…",
    placeholderAnswer: "Type what you think — wrong turns get caught, not judged",
    send: "Send",
    stuck: "I’m stuck · more help",
    tellMe: "Just tell me",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão · Socrático",
    scaffolding: "Apoio",
    breadcrumbLead:
      "Construa a ideia · eu flagro raciocínios errados, não deixo passar",
    doneGap: "Subponto reconstruído — essa lacuna pode se fechar.",
    doneUnderstood: "Compreensão estabelecida — você reconstruiu isso sozinho.",
    doneAssisted: "Compreensão construída — com uma ajuda pelo caminho.",
    doneFlagged: "Dependendo de respostas prontas — vamos reforçar a base primeiro.",
    advanceGap: "Fechar a lacuna · voltar ao mapa →",
    advanceTeach: "Ensinar de volta · Feynman →",
    advanceBack: "Voltar ao mapa →",
    yourAnswer: "Sua resposta — com suas próprias palavras",
    placeholderJudging: "Lendo sua resposta…",
    placeholderWriting: "Escrevendo a próxima pergunta…",
    placeholderAnswer: "Digite o que você pensa — raciocínios errados são flagrados, não julgados",
    send: "Enviar",
    stuck: "Estou travado · mais ajuda",
    tellMe: "Só me conte",
  },
} as const;

// Socratic borrows the shared state colors: learning blue for the phase label,
// mastered green for "understanding established", the scaffolding warmth from
// HELP_COLOR, and shaky/amber for a caught wrong turn.
const BLUE = STATE_COLOR.learning;
const GREEN = STATE_COLOR.mastered;

interface SocraticViewProps {
  /** The node this session teaches — titles the view. */
  title: string;
  session: SocraticSession;
  /** True while the server judge is classifying the typed answer (#25). */
  judging: boolean;
  /** A targeted pass on a red gap node (#12) — completing it closes the gap. */
  gapMode: boolean;
  onExit: () => void;
  /** Submit the learner's own typed answer for judging. */
  onAnswer: (text: string) => void;
  onStuck: () => void;
  onTell: () => void;
  /** The learner sets the scaffolding dial by hand (#B) — it no longer only
   *  fades on its own. */
  onHelpChange: (level: HelpLevel) => void;
  onAdvance: () => void;
}

/** Per-tone accent for an AI bubble: a caught error, an affirmation, teaching. */
function toneColor(tone: SocraticTurn["tone"]): string {
  switch (tone) {
    case "catch":
      return STATE_COLOR.shaky;
    case "affirm":
      return GREEN;
    case "teach":
      return BLUE;
    default:
      return color.hairlineStrong;
  }
}

export default function SocraticView({
  title,
  session,
  judging,
  gapMode,
  onExit,
  onAnswer,
  onStuck,
  onTell,
  onHelpChange,
  onAdvance,
}: SocraticViewProps) {
  const t = useT(STRINGS);
  // The pass streams its probes in one at a time. While the next one is still
  // being written there is nothing to answer, so the surface locks exactly the
  // way it does while an answer is being judged.
  const writing = session.awaitingNext;
  const busy = judging || writing;
  // The learner's own answer, typed. Cleared on submit, and again whenever a
  // new step opens — but NOT on "I'm stuck" or a failed judge call, either of
  // which used to wipe a still-relevant draft out from under the learner.
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [session.step]);
  const submitDraft = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onAnswer(text);
  };

  // ---- the transcript scrolls to the newest turn, including as a pending
  // bubble is typed into (not just when a whole new turn lands) -----------
  const logRef = useRef<HTMLDivElement | null>(null);
  const lastText = session.log.at(-1)?.text;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.log.length, lastText]);

  const breadcrumb = PHASES.slice(0, 6).join(" → ");
  // What the pass earned (#C) — only meaningful once it's done.
  const outcome = session.done ? socraticOutcome(session, gapMode) : null;
  const doneColor = outcome === "flagged" ? STATE_COLOR.shaky : GREEN;
  const doneText =
    outcome === "flagged"
      ? t.doneFlagged
      : outcome === "assisted"
        ? t.doneAssisted
        : gapMode
          ? t.doneGap
          : t.doneUnderstood;
  const advanceLabel =
    outcome === "flagged" ? t.advanceBack : gapMode ? t.advanceGap : t.advanceTeach;

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
      {/* Header — ← Map · Session · Socratic · title · scaffolding dial */}
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
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: color.inkFaint,
          }}
        >
          {t.scaffolding}
        </span>
        <HelpDial help={session.help} onChange={onHelpChange} />
      </div>

      {/* Body — the dialogue */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "30px 32px" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: color.inkFaint,
                  marginBottom: 22,
                }}
              >
                {t.breadcrumbLead}
              </div>
              {session.log.map((m, i) => (
                <Turn key={i} turn={m} />
              ))}
            </div>
          </div>

          {/* Input dock — replies, or the "understood" advance panel */}
          <div
            style={{
              flex: "0 0 auto",
              borderTop: `1px solid ${color.hairline}`,
              padding: "16px 32px 20px",
              background: "rgba(248,246,240,0.55)",
            }}
          >
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              {session.done ? (
                <div style={{ animation: "fadeUp .4s both" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                      fontSize: 13.5,
                      color: doneColor,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: doneColor,
                      }}
                    />
                    {doneText}
                  </div>
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
                    {advanceLabel}
                  </button>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: color.inkGhost,
                      marginBottom: 9,
                    }}
                  >
                    {t.yourAnswer}
                  </div>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
                    <textarea
                      value={draft}
                      disabled={busy}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitDraft();
                        }
                      }}
                      placeholder={
                        writing
                          ? t.placeholderWriting
                          : judging
                            ? t.placeholderJudging
                            : t.placeholderAnswer
                      }
                      rows={2}
                      style={{
                        flex: 1,
                        resize: "none",
                        padding: "12px 15px",
                        borderRadius: 10,
                        fontSize: 14,
                        lineHeight: 1.45,
                        fontFamily: "inherit",
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        color: color.ink,
                        opacity: busy ? 0.6 : 1,
                      }}
                    />
                    <button
                      onClick={submitDraft}
                      disabled={busy || !draft.trim()}
                      style={{
                        flex: "0 0 auto",
                        padding: "12px 17px",
                        background:
                          busy || !draft.trim() ? "rgba(44,40,35,0.07)" : color.accent,
                        color:
                          busy || !draft.trim() ? color.inkGhost : color.accentInk,
                        border: "none",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: busy || !draft.trim() ? "default" : "pointer",
                      }}
                    >
                      {busy ? <InkDots size={3.5} /> : t.send}
                    </button>
                  </div>
                  <MicButton value={draft} onChange={setDraft} disabled={busy} />
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      onClick={onStuck}
                      disabled={busy}
                      style={{
                        padding: "9px 14px",
                        background: color.card,
                        border: "1px solid rgba(160,106,48,0.4)",
                        borderRadius: 9,
                        fontSize: 13,
                        color: color.amberInk,
                        cursor: "pointer",
                      }}
                    >
                      {t.stuck}
                    </button>
                    <button
                      onClick={onTell}
                      disabled={busy}
                      style={{
                        padding: "9px 14px",
                        background: color.card,
                        border: `1px solid ${color.hairlineStrong}`,
                        borderRadius: 9,
                        fontSize: 13,
                        color: color.inkMuted,
                        cursor: "pointer",
                      }}
                    >
                      {t.tellMe}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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

/** The Silent · Hint · Guide · Show me dial; the active cell warms with help.
 *  Clickable (#B) — the learner sets it by hand, and the judge follows it. */
function HelpDial({
  help,
  onChange,
}: {
  help: HelpLevel;
  onChange: (level: HelpLevel) => void;
}) {
  const { language } = useLanguage();
  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        background: color.chipBg,
        border: `1px solid rgba(44,40,35,0.09)`,
        borderRadius: 9,
        padding: 3,
      }}
    >
      {helpLabels(language).map((label, i) => {
        const active = i === help;
        const c = HELP_COLOR[i as HelpLevel];
        return (
          <button
            key={label}
            onClick={() => onChange(i as HelpLevel)}
            style={{
              padding: "5px 11px",
              borderRadius: 6,
              border: "none",
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.04em",
              background: active ? c : "transparent",
              color: active ? color.accentInk : color.inkFaint,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              transition: "background .25s, color .25s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** One transcript line — an AI probe with its move tag, or a learner reply. */
function Turn({ turn }: { turn: SocraticTurn }) {
  if (turn.role === "learner") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div
          style={{
            maxWidth: "82%",
            background: color.chipBg,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: "12px 12px 3px 12px",
            padding: "10px 14px",
            fontSize: 14,
            lineHeight: 1.45,
            color: color.inkSoft,
            animation: "fadeUp .25s both",
          }}
        >
          <Rich text={turn.text} />
        </div>
      </div>
    );
  }
  const accent = toneColor(turn.tone);
  return (
    <div style={{ marginBottom: 18, animation: "fadeUp .3s both" }}>
      {turn.move && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: color.inkGhost,
            marginBottom: 6,
          }}
        >
          {turn.move}
        </div>
      )}
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
        {/* The verdict has landed and the tutor's wording is still arriving —
            it types itself into the bubble rather than swapping in whole. */}
        <StreamingText text={turn.text} writing={!!turn.pending} />
      </div>
    </div>
  );
}
