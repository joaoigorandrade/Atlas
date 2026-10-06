"use client";

// Explain — a model explanation, one card at a time, then one check: a
// listener voices the misconception and the learner chooses what to say back.
//
// The reply is asked in the learner's own words first (AGENTS.md: every
// question is open-ended first) and mapped onto the replies by the `choice`
// judge. A reply already ruled out is not offered again, so a wrong one
// teaches why it fails and the next try is a real choice.

import { useState } from "react";
import {
  EXPLAIN_CARDS,
  EXPLAIN_COLOR,
  explainCopy,
  type ExplainContent,
  type ExplainSession,
  type PhaseId,
} from "@/lib/curriculum";
import { AnswerModeToggle, OpenAnswer, type AnswerMode } from "@/components/OpenAnswer";
import PhaseShell from "@/components/session/parts/PhaseShell";
import Rich from "@/components/Rich";
import Plate from "@/components/ui/Plate";
import Button from "@/components/ui/Button";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    of: (a: number, b: number) => `${a} of ${b}`,
    reveal: "Next card →",
    placeholder: "What would you say back to them?…",
    submit: "Say it →",
    finish: "Continue →",
  },
  "pt-BR": {
    of: (a: number, b: number) => `${a} de ${b}`,
    reveal: "Próximo cartão →",
    placeholder: "O que você responderia?…",
    submit: "Responder →",
    finish: "Continuar →",
  },
} as const;

const label = {
  fontFamily: font.mono,
  fontSize: 10.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: color.inkFaint,
} as const;

export default function ExplainView({
  topic,
  title,
  plan,
  content,
  session,
  onExit,
  onReveal,
  onPick,
  onAdvance,
}: {
  topic: string;
  title: string;
  plan: readonly PhaseId[];
  content: ExplainContent;
  session: ExplainSession;
  onExit: () => void;
  onReveal: () => void;
  onPick: (index: number, read?: string) => void;
  onAdvance: () => void;
}) {
  const t = useT(STRINGS);
  const lang = useLanguage().language;
  const copy = explainCopy(lang);
  const { accent, soft, border } = EXPLAIN_COLOR;
  const [mode, setMode] = useState<AnswerMode>("open");

  const { replies } = content.listener;
  const open = replies.map((_, i) => i).filter((i) => !session.tried.includes(i));
  const checking = session.revealed >= EXPLAIN_CARDS.length;
  const picked = session.picked === undefined ? undefined : replies[session.picked];

  const body = (card: (typeof EXPLAIN_CARDS)[number]) => {
    const aside = (head: string, text: string) => (
      <div style={{ marginTop: 10, fontSize: 14.5, color: color.inkMuted }}>
        <span style={{ ...label, fontSize: 10, marginRight: 8 }}>{head}</span>
        <Rich text={text} />
      </div>
    );
    switch (card) {
      case "problem":
        return <Rich text={content.problem} />;
      case "analogy":
        return (
          <>
            <Rich text={content.analogy.text} />
            {aside(copy.breaks, content.analogy.breaks)}
          </>
        );
      case "order":
        return (
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {content.order.map((idea, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <Rich text={idea} />
              </li>
            ))}
          </ol>
        );
      case "misconception":
        return (
          <>
            <Rich text={content.misconception.belief} />
            {aside(copy.tempting, content.misconception.tempting)}
          </>
        );
      case "checkBack":
        return (
          <>
            <Rich text={content.checkBack.question} />
            {aside(copy.rightAnswer, content.checkBack.rightAnswer)}
          </>
        );
    }
  };

  return (
    <PhaseShell
      phase="explain"
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
          {t.of(session.revealed, EXPLAIN_CARDS.length)}
        </span>
      }
    >
      <div style={{ ...label, letterSpacing: "0.14em", marginBottom: 16 }}>
        {copy.lead}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {EXPLAIN_CARDS.slice(0, session.revealed).map((card) => (
          <Plate
            key={card}
            data-testid={`explain-card-${card}`}
            style={{ animation: "fadeUp .3s both" }}
          >
            <div style={{ ...label, color: accent, marginBottom: 8 }}>
              {copy.cards[card]}
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 16, lineHeight: 1.55 }}>
              {body(card)}
            </div>
          </Plate>
        ))}
      </div>

      {!checking && (
        <Button
          data-testid="action-reveal"
          onClick={onReveal}
          accent={accent}
          style={{ marginTop: 18 }}
        >
          {t.reveal}
        </Button>
      )}

      {checking && (
        <div style={{ marginTop: 26, animation: "fadeUp .3s both" }}>
          <div style={label}>{copy.listener}</div>
          <div
            data-testid="explain-listener"
            style={{
              marginTop: 8,
              padding: "14px 18px",
              borderRadius: 3,
              background: soft,
              border: `1px solid ${border}`,
              fontFamily: font.serif,
              fontSize: 16.5,
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            <Rich text={content.listener.says} />
          </div>

          {picked && (
            <div
              data-testid={picked.correct ? "reply-right" : "reply-wrong"}
              style={{
                marginTop: 14,
                padding: "12px 15px",
                borderRadius: 3,
                border: `1px solid ${picked.correct ? accent : "rgba(160,106,48,0.45)"}`,
                background: color.card,
              }}
            >
              <div
                style={{
                  ...label,
                  color: picked.correct ? accent : color.amberInk,
                  marginBottom: 6,
                }}
              >
                {picked.correct ? copy.works : copy.fails}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45 }}>{picked.label}</div>
              <div style={{ marginTop: 8, fontSize: 14, color: color.inkMuted }}>
                <Rich text={picked.why} />
              </div>
              {session.read && (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: font.serif,
                    fontSize: 13.5,
                    fontStyle: "italic",
                    color: color.inkMuted,
                  }}
                >
                  {session.read}
                </div>
              )}
              {!picked.correct && (
                <div style={{ marginTop: 8, fontSize: 14, color: color.amberInk }}>
                  {copy.tryAgain}
                </div>
              )}
            </div>
          )}

          {!session.done && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 12 }}>
                {copy.pickReply}
              </div>
              <div style={{ marginBottom: 12 }}>
                <AnswerModeToggle mode={mode} onMode={setMode} accent={accent} />
              </div>
              {/* The choice judge needs two options to map onto. */}
              {mode === "open" && open.length > 1 ? (
                <OpenAnswer
                  key={session.tried.length}
                  topic={topic}
                  nodeLabel={title}
                  question={`${content.listener.says}\n\n${copy.pickReply}`}
                  options={open.map((i) => replies[i].label)}
                  accent={accent}
                  placeholder={t.placeholder}
                  submitLabel={t.submit}
                  onResolve={(index, read) => onPick(open[index], read)}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {open.map((i) => (
                    <button
                      key={i}
                      className="at-press"
                      data-testid={`action-reply-${i}`}
                      onClick={() => onPick(i)}
                      style={{
                        textAlign: "left",
                        padding: "12px 15px",
                        borderRadius: 3,
                        border: `1px solid ${color.hairlineStrong}`,
                        background: color.card,
                        fontSize: 14.5,
                        lineHeight: 1.45,
                        color: color.ink,
                        cursor: "pointer",
                      }}
                    >
                      {replies[i].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {session.done && (
            <Button
              data-testid="action-finish"
              onClick={onAdvance}
              style={{ marginTop: 22 }}
            >
              {t.finish}
            </Button>
          )}
        </div>
      )}
    </PhaseShell>
  );
}
