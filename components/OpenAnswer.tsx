"use client";

// Every question in Atlas is asked open-ended first. The surfaces that also
// have a closed form (placement, the Consume hook, the Feynman fix pass)
// render <AnswerModeToggle> beside the question and start in "open": the
// learner writes in their own words, the judge maps that answer onto the
// option index the closed path already keys on, so nothing downstream changes.

import { useState } from "react";
import { MicButton } from "@/components/VoiceInput";
import { fetchJudgeChoice } from "@/lib/api";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

export type AnswerMode = "open" | "choices";

const TOGGLE_STRINGS = {
  en: { open: "Own words", choices: "Choices" },
  "pt-BR": { open: "Suas palavras", choices: "Alternativas" },
} as const;

const ANSWER_STRINGS = {
  en: {
    placeholder: "Answer in your own words…",
    reading: "Reading your answer…",
    submitLabel: "Submit answer →",
    errorSuffix: " — try again, or switch to Choices.",
    hint: "⌘↵ to submit",
  },
  "pt-BR": {
    placeholder: "Responda com suas próprias palavras…",
    reading: "Lendo sua resposta…",
    submitLabel: "Enviar resposta →",
    errorSuffix: " — tente de novo, ou mude para Alternativas.",
    hint: "⌘↵ para enviar",
  },
} as const;

export function AnswerModeToggle({
  mode,
  onMode,
  accent = color.accent,
}: {
  mode: AnswerMode;
  onMode: (m: AnswerMode) => void;
  accent?: string;
}) {
  const t = useT(TOGGLE_STRINGS);
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        gap: 2,
        borderRadius: 8,
        background: color.chipBg,
        border: `1px solid ${color.hairline}`,
      }}
    >
      {(
        [
          ["open", t.open],
          ["choices", t.choices],
        ] as const
      ).map(([key, label]) => {
        const active = mode === key;
        return (
          <button
            key={key}
            onClick={() => onMode(key)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              cursor: active ? "default" : "pointer",
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: "0.04em",
              background: active ? accent : "transparent",
              color: active ? color.accentInk : color.inkMuted,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** The open-ended answer box: types, judges, resolves to an option index. */
export function OpenAnswer({
  topic,
  nodeLabel,
  question,
  options,
  onResolve,
  placeholder,
  rows = 3,
  accent = color.accent,
  submitLabel,
}: {
  topic: string;
  nodeLabel?: string;
  question: string;
  /** The closed-form labels the answer is mapped onto. */
  options: string[];
  /** Called with the matched option index and the judge's one-line read. */
  onResolve: (index: number, response: string) => void;
  placeholder?: string;
  rows?: number;
  accent?: string;
  submitLabel?: string;
}) {
  const t = useT(ANSWER_STRINGS);
  const { language } = useLanguage();
  const [text, setText] = useState("");
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedPlaceholder = placeholder ?? t.placeholder;
  const resolvedSubmitLabel = submitLabel ?? t.submitLabel;

  const submit = () => {
    const answer = text.trim();
    if (!answer || judging) return;
    setJudging(true);
    setError(null);
    fetchJudgeChoice({ topic, nodeLabel, question, options, answer, language })
      .then((j) => onResolve(j.index, j.response))
      .catch((e: Error) => setError(e.message))
      .finally(() => setJudging(false));
  };

  return (
    <div>
      <textarea
        value={text}
        disabled={judging}
        rows={rows}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={judging ? t.reading : resolvedPlaceholder}
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
          opacity: judging ? 0.6 : 1,
        }}
      />
      <MicButton
        value={text}
        onChange={setText}
        disabled={judging}
        accent={accent}
      />
      <button
        onClick={submit}
        disabled={judging || !text.trim()}
        style={{
          marginTop: 10,
          width: "100%",
          padding: 13,
          borderRadius: 11,
          border: "none",
          fontSize: 14.5,
          fontWeight: 600,
          cursor: judging || !text.trim() ? "default" : "pointer",
          background: judging || !text.trim() ? "rgba(44,40,35,0.07)" : accent,
          color: judging || !text.trim() ? color.inkGhost : color.accentInk,
        }}
      >
        {judging ? t.reading : resolvedSubmitLabel}
      </button>
      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            lineHeight: 1.5,
            color: color.amberInk,
          }}
        >
          {error}{t.errorSuffix}
        </div>
      )}
      <div style={{ ...kicker(9.5, "0.1em"), marginTop: 10 }}>{t.hint}</div>
    </div>
  );
}
