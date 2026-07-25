"use client";

// Every question in Atlas is asked open-ended first. The surfaces that also
// have a closed form (placement, Consume predictions, the Feynman fix pass)
// render <AnswerModeToggle> beside the question and start in "open": the
// learner writes in their own words, the judge maps that answer onto the
// option index the closed path already keys on, so nothing downstream changes.

import { useState } from "react";
import { fetchJudgeChoice } from "@/lib/api";
import { color, font, kicker } from "@/lib/theme";

export type AnswerMode = "open" | "choices";

export function AnswerModeToggle({
  mode,
  onMode,
  accent = color.accent,
}: {
  mode: AnswerMode;
  onMode: (m: AnswerMode) => void;
  accent?: string;
}) {
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
          ["open", "Own words"],
          ["choices", "Choices"],
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
  placeholder = "Answer in your own words…",
  rows = 3,
  accent = color.accent,
  submitLabel = "Submit answer →",
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
  const [text, setText] = useState("");
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const answer = text.trim();
    if (!answer || judging) return;
    setJudging(true);
    setError(null);
    fetchJudgeChoice({ topic, nodeLabel, question, options, answer })
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
        placeholder={judging ? "Reading your answer…" : placeholder}
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
        {judging ? "Reading your answer…" : submitLabel}
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
          {error} — try again, or switch to Choices.
        </div>
      )}
      <div style={{ ...kicker(9.5, "0.1em"), marginTop: 10 }}>⌘↵ to submit</div>
    </div>
  );
}
