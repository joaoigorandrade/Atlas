"use client";

// Fixing one gap in the Gap Report: that sub-point, explained again in the
// learner's own words, and judged against the same rubric row the teach-back
// was (`mustConvey`) — a one-row Feynman judgement.
//
// It used to be a pick among written replies, with each wrong one struck out,
// so a gap could be closed by elimination. A gap found in unaided production
// closes the same way it was found.

import { useState } from "react";
import type { FeynmanBeat } from "@/lib/curriculum";
import { fetchJudgeFeynman } from "@/lib/api";
import { MicButton } from "@/components/VoiceInput";
import { useLanguage, useT } from "@/lib/i18n";
import { color } from "@/lib/theme";

const STRINGS = {
  en: {
    placeholder: "Explain just this part, in your own words…",
    submit: "Check it →",
    reading: "Reading it…",
    retry: " — try again.",
  },
  "pt-BR": {
    placeholder: "Explique só esta parte, com suas palavras…",
    submit: "Conferir →",
    reading: "Lendo…",
    retry: " — tente de novo.",
  },
} as const;

export default function FixAnswer({
  beat,
  topic,
  nodeLabel,
  accent,
  onJudged,
}: {
  beat: FeynmanBeat;
  topic: string;
  nodeLabel: string;
  accent: string;
  onJudged: (judged: { good: boolean; response: string }) => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const [text, setText] = useState("");
  const [judging, setJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const answer = text.trim();
    if (!answer || judging) return;
    setJudging(true);
    setError(null);
    fetchJudgeFeynman({
      topic,
      nodeLabel,
      rubric: [{ subPoint: beat.subPoint, mustConvey: beat.mustConvey }],
      answer,
      language,
    })
      .then((j) =>
        onJudged({ good: j.verdicts[0]?.verdict === "good", response: j.response }),
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setJudging(false));
  };

  return (
    <div>
      <textarea
        data-testid="field-fix"
        value={text}
        rows={3}
        disabled={judging}
        placeholder={judging ? t.reading : t.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          borderRadius: 3,
          fontSize: 14,
          lineHeight: 1.5,
          fontFamily: "inherit",
          border: `1px solid ${color.hairlineStrong}`,
          background: color.card,
          color: color.ink,
        }}
      />
      <MicButton value={text} onChange={setText} disabled={judging} accent={accent} />
      <button
        className="at-press"
        data-testid="action-fix-submit"
        onClick={submit}
        disabled={judging || !text.trim()}
        style={{
          marginTop: 8,
          padding: "9px 16px",
          borderRadius: 3,
          border: "none",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: judging || !text.trim() ? "default" : "pointer",
          background: judging || !text.trim() ? "rgba(43,33,24,0.07)" : accent,
          color: judging || !text.trim() ? color.inkGhost : color.accentInk,
        }}
      >
        {judging ? t.reading : t.submit}
      </button>
      {error && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: color.amberInk }}>
          {error}
          {t.retry}
        </div>
      )}
    </div>
  );
}
