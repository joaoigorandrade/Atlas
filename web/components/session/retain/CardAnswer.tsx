"use client";

// Answering a review card before turning it over (W4.3), and what the judge
// made of the answer once it is turned.
//
// "Answer it in your head" left the learner to grade themselves after seeing
// the back — the fluency illusion the calibration surface exists to catch. An
// answer written or spoken first is checked against the back as a one-row
// retrieval (the Recall judge), and the grade it suggests is the learner's to
// take or override. Optional: the head is still a place to answer.

import { useLanguage } from "@/lib/i18n";
import { color, font, kicker } from "@/lib/theme";
import { STATE_COLOR, type RetainSession } from "@/lib/curriculum";
import { MicButton } from "@/components/VoiceInput";

const STRINGS = {
  en: {
    placeholder: "Answer it here first — or in your head, and just turn it",
    came: "Came back",
    missed: "Didn’t come back",
    judging: "Reading your answer…",
  },
  "pt-BR": {
    placeholder: "Responda aqui primeiro — ou de cabeça, e só vire",
    came: "Voltou",
    missed: "Não voltou",
    judging: "Lendo sua resposta…",
  },
} as const;

export function CardAnswer({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = STRINGS[useLanguage().language];
  return (
    <div style={{ position: "relative", margin: "0 34px 12px" }}>
      <textarea
        data-testid="field-card-answer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.placeholder}
        rows={2}
        style={{
          width: "100%",
          padding: "11px 44px 11px 13px",
          borderRadius: 3,
          border: `1px solid ${color.hairlineStrong}`,
          background: color.paper,
          fontFamily: font.serif,
          fontSize: 15.5,
          color: color.ink,
          resize: "none",
        }}
      />
      <div style={{ position: "absolute", right: 8, top: 8 }}>
        <MicButton value={value} onChange={onChange} accent={STATE_COLOR.learning} />
      </div>
    </div>
  );
}

/** What the answer written before the flip came to. */
export function Suggestion({ session }: { session: RetainSession }) {
  const t = STRINGS[useLanguage().language];
  if (!session.said) return null;
  const s = session.suggest;
  const tint = !s
    ? color.inkFaint
    : s.grade === "good"
      ? STATE_COLOR.mastered
      : STATE_COLOR.gap;
  return (
    <div
      data-testid="card-suggestion"
      style={{
        margin: "0 26px 12px",
        paddingLeft: 12,
        borderLeft: `3px solid ${tint}`,
        fontSize: 14,
        lineHeight: 1.5,
        color: color.inkSoft,
      }}
    >
      <div style={{ ...kicker(9.5, "0.1em"), color: tint, marginBottom: 3 }}>
        {!s ? t.judging : s.grade === "good" ? t.came : t.missed}
      </div>
      <div style={{ fontStyle: "italic" }}>“{session.said}”</div>
      {s?.read && <div style={{ marginTop: 3 }}>{s.read}</div>}
    </div>
  );
}
