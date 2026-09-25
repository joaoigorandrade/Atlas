"use client";

// Produce — one spoken turn at a time, microphone first.
//
// The cue is in the learner's own language on purpose: reading a target-language
// sentence aloud is not production, and a surface that shows one has quietly
// become a pronunciation drill.
//
// `thin` gets its own colour and its own line. Understood-but-avoided looks
// like success to a speaker and to everyone they talk to, which is why it has
// to be named here.

import { useState } from "react";
import {
  PRODUCE_COLOR,
  produceAvoided,
  produceCopy,
  producePassed,
  produceScore,
  type PhaseId,
  type ProduceContent,
  type ProduceSession,
} from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    seconds: (n: number) => `${n}s`,
    placeholder: "Speak — or type it if you must…",
    submit: "That's what I said →",
    judging: "Listening…",
    score: (a: number, b: number) => `${a} of ${b} landed`,
    advance: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    seconds: (n: number) => `${n}s`,
    placeholder: "Fale — ou digite, se precisar…",
    submit: "Foi isso que eu disse →",
    judging: "Ouvindo…",
    score: (a: number, b: number) => `${a} de ${b} saíram`,
    advance: "Continuar →",
  },
} as const;

/** One turn's answer box. Its own component so the turn's `key` remounts it:
 *  the draft clears itself, with no effect and no state in the shell. */
function SayIt({
  accent,
  judging,
  placeholder,
  submitLabel,
  onSubmit,
}: {
  accent: string;
  judging: boolean;
  placeholder: string;
  submitLabel: string;
  onSubmit: (said: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const blocked = judging || !draft.trim();
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ position: "relative" }}>
        <textarea
          data-testid="field-said"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{
            width: "100%",
            padding: "13px 15px",
            paddingRight: 46,
            borderRadius: 3,
            border: `1px solid ${color.hairlineStrong}`,
            background: color.card,
            fontFamily: font.sans,
            fontSize: 15,
            lineHeight: 1.55,
            color: color.ink,
            resize: "vertical",
          }}
        />
        {/* The microphone is the point here, not a convenience. */}
        <div style={{ position: "absolute", right: 10, top: 10 }}>
          <MicButton value={draft} onChange={setDraft} accent={accent} />
        </div>
      </div>
      <button
        className="at-press"
        data-testid="action-submit"
        disabled={blocked}
        onClick={() => onSubmit(draft)}
        style={{
          marginTop: 14,
          width: "100%",
          padding: 14,
          borderRadius: 3,
          border: "none",
          background: blocked ? color.hairlineStrong : accent,
          color: color.accentInk,
          fontSize: 14.5,
          fontFamily: font.caps,
          letterSpacing: "0.06em",
          cursor: blocked ? "default" : "pointer",
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export default function ProduceView({
  title,
  plan,
  content,
  session,
  judging,
  onExit,
  onSubmit,
  onNext,
  onAdvance,
}: {
  title: string;
  plan: readonly PhaseId[];
  content: ProduceContent;
  session: ProduceSession;
  judging: boolean;
  onExit: () => void;
  onSubmit: (said: string) => void;
  onNext: () => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = produceCopy(lang);
  const { accent, soft, border } = PRODUCE_COLOR;

  const turn = content.turns[session.index];
  const verdict = turn ? session.verdicts[turn.id] : undefined;
  const answered = verdict !== undefined;
  const avoided = produceAvoided(session, content);
  const passed = producePassed(session, content);
  const verdictColor =
    verdict === "good"
      ? color.accent
      : verdict === "thin"
        ? color.amberInk
        : color.dangerInk;

  return (
    <PhaseShell
      phase="produce"
      kicker={copy.kicker}
      accent={accent}
      title={title}
      plan={plan}
      lang={lang}
      onExit={onExit}
      headerRight={
        <span
          data-testid="phase-progress"
          style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}
        >
          {t.of(Math.min(session.index + 1, content.turns.length), content.turns.length)}
        </span>
      }
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: color.inkFaint,
          marginBottom: 16,
        }}
      >
        {copy.lead}
      </div>

      <div
        data-testid="produce-scene"
        style={{
          padding: "14px 17px",
          borderRadius: 3,
          background: soft,
          border: `1px solid ${border}`,
          fontSize: 14.5,
          lineHeight: 1.5,
          color: color.inkMuted,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: color.inkGhost,
            marginBottom: 6,
          }}
        >
          {copy.theScene}
        </div>
        <Rich text={content.scene} />
      </div>

      {turn && !session.done && (
        <div key={turn.id} style={{ marginTop: 20, animation: "fadeUp .3s both" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: color.inkGhost,
              }}
            >
              {copy.yourTurn}
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}>
              {t.seconds(turn.seconds)}
            </span>
          </div>
          <div
            data-testid="produce-cue"
            style={{ fontFamily: font.serif, fontSize: 18, lineHeight: 1.45 }}
          >
            <Rich text={turn.cue} />
          </div>

          {!answered && (
            <SayIt
              accent={accent}
              judging={judging}
              placeholder={t.placeholder}
              submitLabel={judging ? t.judging : t.submit}
              onSubmit={onSubmit}
            />
          )}

          {answered && (
            <div style={{ marginTop: 16, animation: "fadeUp .3s both" }}>
              <div
                data-testid={`produce-verdict-${verdict}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: verdictColor,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: verdictColor,
                  }}
                />
                {verdict ? copy[verdict] : ""}
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontFamily: font.mono,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: color.inkGhost,
                  marginBottom: 6,
                }}
              >
                {copy.youSaid}
              </div>
              <div
                style={{
                  padding: "12px 15px",
                  borderRadius: 3,
                  border: `1px solid ${color.hairline}`,
                  background: color.card,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                  color: color.inkMuted,
                }}
              >
                {session.saidBy[turn.id]}
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: color.ink,
                }}
              >
                <Rich text={session.reads[turn.id] ?? ""} />
              </div>

              <Button
                data-testid="action-next"
                onClick={onNext}
                accent={accent}
                style={{ marginTop: 18 }}
              >
                {copy.next}
              </Button>
            </div>
          )}
        </div>
      )}

      {session.done && (
        <div style={{ marginTop: 22, animation: "fadeUp .4s both" }}>
          <div
            data-testid="phase-score"
            style={{ fontFamily: font.serif, fontSize: 21, marginBottom: 6 }}
          >
            {t.score(produceScore(session, content), content.turns.length)}
          </div>
          {avoided.length > 0 && (
            <div
              data-testid="produce-avoided"
              style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}
            >
              {copy.avoided}
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: passed ? color.inkMuted : color.amberInk,
            }}
          >
            {passed ? copy.passed : copy.missed}
          </div>
          <Button
            data-testid="action-finish"
            onClick={onAdvance}
            style={{ marginTop: 22 }}
          >
            {t.advance}
          </Button>
        </div>
      )}
    </PhaseShell>
  );
}
