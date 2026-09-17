"use client";

// The three placement probes that are not a list of options.
//
// A four-option question measures RECOGNITION, which is the right instrument
// for a general topic and the wrong one everywhere else — it cannot tell
// whether a learner can row-reduce, and for a language it measures the axis
// learners are most often mis-placed on. Placement decides what the map prunes,
// so the probe has to be shaped like the domain.
//
// All three grade locally (`gradeDiagnostic`). Nothing here reaches a model:
// this sits on the onboarding path, where a round trip per answer would be the
// whole experience.

import { useState } from "react";
import type {
  DiagnosticAnswer,
  DiagnosticOption,
  DiagnosticQuestion,
} from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";
import Rich from "@/components/Rich";
import { color, font } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    computePlaceholder: "The answer — a number, a fraction, a percentage…",
    speakPlaceholder: "Say it out loud…",
    orderHint: "Tap them in order, earliest first.",
    submit: "Answer →",
    clear: "Start over",
  },
  "pt-BR": {
    computePlaceholder: "A resposta — um número, uma fração, uma porcentagem…",
    speakPlaceholder: "Diga em voz alta…",
    orderHint: "Toque na ordem certa, do mais antigo para o mais recente.",
    submit: "Responder →",
    clear: "Recomeçar",
  },
} as const;

const box = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 11,
  border: `1px solid ${color.hairlineStrong}`,
  background: color.card,
  fontFamily: font.sans,
  fontSize: 15,
  lineHeight: 1.5,
  color: color.ink,
} as const;

function Submit({
  disabled,
  accent,
  label,
  onClick,
}: {
  disabled: boolean;
  accent: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="at-press"
      data-testid="action-answer"
      disabled={disabled}
      onClick={onClick}
      style={{
        marginTop: 12,
        width: "100%",
        padding: 14,
        borderRadius: 12,
        border: "none",
        background: disabled ? color.hairlineStrong : accent,
        color: color.accentInk,
        fontSize: 14.5,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

/** `formal`: the learner works it out. Checked arithmetically, so a comma
 *  decimal, a fraction and a percentage are all the same answer. */
export function ComputeAnswer({
  accent,
  onAnswer,
}: {
  accent: string;
  onAnswer: (value: string) => void;
}) {
  const t = useT(STRINGS);
  const [value, setValue] = useState("");
  return (
    <div>
      <input
        data-testid="field-compute"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && onAnswer(value)}
        placeholder={t.computePlaceholder}
        style={{ ...box, fontFamily: font.mono }}
      />
      <Submit
        disabled={!value.trim()}
        accent={accent}
        label={t.submit}
        onClick={() => onAnswer(value)}
      />
    </div>
  );
}

/** `performative`: the learner says it. This is the whole point of the probe —
 *  recognising a word you could never produce is exactly the mis-placement a
 *  four-option question makes. */
export function SpeakAnswer({
  accent,
  onAnswer,
}: {
  accent: string;
  onAnswer: (said: string) => void;
}) {
  const t = useT(STRINGS);
  const [said, setSaid] = useState("");
  return (
    <div>
      <div style={{ position: "relative" }}>
        <input
          data-testid="field-speak"
          value={said}
          onChange={(e) => setSaid(e.target.value)}
          placeholder={t.speakPlaceholder}
          style={{ ...box, paddingRight: 46 }}
        />
        <div style={{ position: "absolute", right: 8, top: 7 }}>
          <MicButton value={said} onChange={setSaid} accent={accent} />
        </div>
      </div>
      <Submit
        disabled={!said.trim()}
        accent={accent}
        label={t.submit}
        onClick={() => onAnswer(said)}
      />
    </div>
  );
}

/** `interpretive`: chronology is the spine a learner either has or does not,
 *  which makes it the honest placement probe for a topic read in time. */
export function OrderAnswer({
  accent,
  opts,
  onAnswer,
}: {
  accent: string;
  opts: DiagnosticOption[];
  onAnswer: (order: string[]) => void;
}) {
  const t = useT(STRINGS);
  const [order, setOrder] = useState<string[]>([]);
  const remaining = opts.filter((o) => !order.includes(o.label));
  return (
    <div>
      <div style={{ fontSize: 13, color: color.inkMuted, marginBottom: 10 }}>
        {t.orderHint}
      </div>
      {order.length > 0 && (
        <div
          data-testid="order-chosen"
          style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}
        >
          {order.map((label, i) => (
            <div
              key={label}
              style={{
                ...box,
                padding: "10px 14px",
                background: color.chipBg,
                fontSize: 14,
              }}
            >
              <span style={{ fontFamily: font.mono, color: color.inkGhost }}>
                {i + 1}.
              </span>{" "}
              {label}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {remaining.map((o, i) => (
          <button
            key={o.label}
            className="at-press"
            data-testid={`action-order-${i}`}
            onClick={() => setOrder([...order, o.label])}
            style={{
              ...box,
              textAlign: "left",
              padding: "11px 14px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {order.length > 0 && (
        <button
          className="at-press"
          data-testid="action-order-clear"
          onClick={() => setOrder([])}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 13,
            color: color.inkMuted,
            cursor: "pointer",
          }}
        >
          {t.clear}
        </button>
      )}
      <Submit
        disabled={remaining.length > 0}
        accent={accent}
        label={t.submit}
        onClick={() => onAnswer(order)}
      />
    </div>
  );
}

/**
 * One placement probe's answer surface, whichever kind it is.
 *
 * The panel around this knows nothing about the four kinds: it hands the
 * question down and takes an answer back, and `gradeDiagnostic` rules all four
 * the same way. Adding a fifth kind is a branch here, nowhere else.
 */
export default function DiagnosticAnswer({
  question,
  picked,
  correct,
  onAnswer,
}: {
  question: DiagnosticQuestion;
  /** The answer already given, if this question has been answered. */
  picked: DiagnosticAnswer | undefined;
  correct: boolean;
  onAnswer: (answer: DiagnosticAnswer) => void;
}) {
  return (
    <>
      {/* Each kind is answered the way its domain is actually practised —
            see `DiagnosticAnswers`. Everything downstream of here takes a
            boolean, so nothing else has to know which one was asked. */}
      {question.type === "compute" && picked === undefined && (
        <ComputeAnswer accent={color.accent} onAnswer={(v) => onAnswer(v)} />
      )}
      {question.type === "speak" && picked === undefined && (
        <SpeakAnswer accent={color.accent} onAnswer={(v) => onAnswer(v)} />
      )}
      {question.type === "order" && picked === undefined && (
        <OrderAnswer
          accent={color.accent}
          opts={question.opts}
          onAnswer={(v) => onAnswer(v)}
        />
      )}
      {/* Rendered, not hidden. `hidden` is a UA-stylesheet `display: none`, so
          the inline `display: flex` below beat it and the options list drew
          under every shaped item — an `order` question arrived with its five
          events listed twice, once to sequence and once to pick from. Nobody
          saw it until the domain reached the probe and the type could be
          anything but `mcq`. */}
      {(question.type ?? "mcq") === "mcq" && (
        <div
          role="radiogroup"
          style={{ display: "flex", flexDirection: "column", gap: 11 }}
        >
          {question.opts.map((opt, oi) => {
            const isAnswer = picked !== undefined && oi === question.correctIndex;
            const isWrongPick = oi === picked && !correct;
            return (
              <button
                className="at-press"
                key={opt.label}
                data-testid={`action-answer-${oi}`}
                role="radio"
                aria-checked={oi === picked}
                disabled={!picked === undefined}
                onClick={() => {
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
      )}
    </>
  );
}
