"use client";

// The shared mic. Atlas asks the learner to write on six different surfaces;
// this is the one control that lets them speak instead, and it renders the
// same way on all of them.
//
// It appends — speaking never replaces what's already typed — and it returns
// null wherever the browser can't dictate or the learner has voice off, which
// is what makes the fallback free at every call site.

import { useEffect, useRef } from "react";
import { appendTranscript, useDictation, useVoicePrefs } from "@/lib/speech";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    start: "Speak your answer",
    starting: "Opening the mic…",
    listening: "Listening — tap to stop",
    stopLabel: "Stop dictation",
    startLabel: "Start dictation",
    errors: {
      permission: "Mic blocked — allow it in your browser.",
      "no-speech": "Didn’t catch anything — try again.",
      "no-mic": "No microphone found.",
      unknown: "Dictation stopped — try again.",
    },
  },
  "pt-BR": {
    start: "Fale sua resposta",
    starting: "Abrindo o microfone…",
    listening: "Ouvindo — toque para parar",
    stopLabel: "Parar ditado",
    startLabel: "Começar ditado",
    errors: {
      permission: "Microfone bloqueado — libere no navegador.",
      "no-speech": "Não captei nada — tente de novo.",
      "no-mic": "Nenhum microfone encontrado.",
      unknown: "O ditado parou — tente de novo.",
    },
  },
} as const;

function MicGlyph({ tint }: { tint: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.6" y="1.6" width="4.8" height="8" rx="2.4" fill={tint} />
      <path
        d="M3.4 7.4v0.8a4.6 4.6 0 0 0 9.2 0v-0.8"
        stroke={tint}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M8 12.8v1.8" stroke={tint} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** A mic beside a free-text box: finalized speech is appended to `value`,
 *  and the not-yet-final words show live underneath as the learner talks. */
export function MicButton({
  value,
  onChange,
  disabled = false,
  accent = color.accent,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  accent?: string;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const { dictation } = useVoicePrefs();

  // The engine's callback fires long after the render that installed it; the
  // ref keeps it appending to what's in the box *now*, not what was there
  // when the learner started talking.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { supported, listening, starting, interim, error, toggle, stop } = useDictation({
    language,
    onFinal: (text) => onChange(appendTranscript(valueRef.current, text)),
  });

  // The box going busy (judging, submitted) closes the mic with it.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  if (!supported || !dictation) return null;

  const status = error
    ? t.errors[error]
    : starting
      ? t.starting
      : listening
        ? t.listening
        : t.start;

  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? t.stopLabel : t.startLabel}
          title={listening ? t.stopLabel : t.startLabel}
          style={{
            flex: "0 0 auto",
            width: 34,
            height: 34,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: `1px solid ${listening ? accent : color.hairlineStrong}`,
            background: listening ? accent : color.chipBg,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.45 : 1,
            padding: 0,
            transition: "background .15s, border-color .15s",
            animation: starting
              ? "breathe 1.1s ease-in-out infinite"
              : listening
                ? "pulseGlow 1.6s ease-in-out infinite"
                : undefined,
          }}
        >
          <MicGlyph tint={listening ? color.accentInk : color.inkMuted} />
        </button>
        <span
          style={{
            ...kicker(9.5, "0.1em"),
            color: error ? color.amberInk : listening ? accent : color.inkFaint,
          }}
        >
          {status}
        </span>
      </div>
      {listening && interim && (
        <div
          style={{
            marginTop: 7,
            fontFamily: font.serif,
            fontSize: 14,
            lineHeight: 1.5,
            fontStyle: "italic",
            color: color.inkFaint,
          }}
        >
          {interim}
        </div>
      )}
    </div>
  );
}
