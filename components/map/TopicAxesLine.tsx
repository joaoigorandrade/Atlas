"use client";

// The topic's own axes, under its title on the map: the language a language
// map teaches, with a one-tap change of variant (W1.1), and — on a
// confessional or contested subject — the lens it is read through (W2.6).
//
// Both are the learner's to choose and the server's to use: this writes the
// topic row, and every generation after it is stamped from that row
// (`withTopicAxes`), so neither client ever carries one into a request.

import { patchTopic } from "@/lib/persistence";
import { generationTopic } from "@/lib/generationTopic";
import { setTopicAxes, useTopicAxes } from "@/lib/topicAxesStore";
import { useLanguage, useT } from "@/lib/i18n";
import { color, font, kicker } from "@/lib/theme";
import { logWarning } from "@/lib/log";

/** The variants offered per language — the ones a learner plausibly means. */
const VARIANTS: Record<string, string[]> = {
  es: ["es-ES", "es-MX", "es-AR", "es-CO"],
  en: ["en-US", "en-GB", "en-AU"],
  pt: ["pt-BR", "pt-PT"],
  fr: ["fr-FR", "fr-CA"],
  de: ["de-DE", "de-AT", "de-CH"],
  it: ["it-IT"],
};

const STRINGS = {
  en: {
    speaking: "Spoken as",
    readThrough: "Read through",
    pickLens: "Pick the reading this map follows:",
  },
  "pt-BR": {
    speaking: "Falado como",
    readThrough: "Lido pela",
    pickLens: "Escolha a leitura que este mapa segue:",
  },
} as const;

export default function TopicAxesLine() {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const axes = useTopicAxes();
  if (!axes) return null;
  const save = (patch: { targetLanguage?: string; lens?: string }) => {
    const id = generationTopic();
    setTopicAxes({ ...axes, ...patch });
    if (id)
      patchTopic(id, patch).catch((e: unknown) => logWarning("topic_axis_failed", e));
  };
  const name = (tag: string) => {
    try {
      return new Intl.DisplayNames([language], { type: "language" }).of(tag) ?? tag;
    } catch {
      return tag;
    }
  };
  const tag = axes.targetLanguage;
  const variants = tag ? (VARIANTS[tag.split("-")[0]] ?? [tag]) : [];
  return (
    <div style={{ marginTop: 8, fontSize: 12.5, color: color.inkMuted }}>
      {tag && (
        <label style={{ display: "block" }}>
          <span style={{ ...kicker(9.5) }}>{t.speaking} </span>
          <select
            data-testid="field-target-language"
            value={tag}
            onChange={(e) => save({ targetLanguage: e.target.value })}
            style={{
              font: `13px ${font.serif}`,
              color: color.ink,
              background: "transparent",
              border: "none",
              borderBottom: `1px dotted ${color.hairlineStrong}`,
            }}
          >
            {[...new Set([tag, ...variants])].map((v) => (
              <option key={v} value={v}>
                {name(v)}
              </option>
            ))}
          </select>
        </label>
      )}
      {axes.lenses.length === 2 && (
        <div data-testid="topic-lens" style={{ marginTop: 6 }}>
          <span style={{ ...kicker(9.5) }}>
            {axes.lens ? t.readThrough : t.pickLens}{" "}
          </span>
          {axes.lenses.map((lens) => (
            <button
              key={lens}
              className="at-press"
              data-testid="action-lens"
              aria-pressed={axes.lens === lens}
              onClick={() => save({ lens })}
              style={{
                margin: "4px 4px 0 0",
                padding: "3px 8px",
                borderRadius: 2,
                fontSize: 12,
                cursor: "pointer",
                border: `1px solid ${axes.lens === lens ? color.ink : color.hairlineStrong}`,
                background: axes.lens === lens ? color.chipBg : "transparent",
                color: color.ink,
              }}
            >
              {lens}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
