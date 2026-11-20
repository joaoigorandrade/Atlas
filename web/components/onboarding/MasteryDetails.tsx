"use client";

// The full setup a mastery map always asked for — goal, date, interests, daily
// target. Unfolded under the welcome screen's "Mastery" card; a "just want to
// know" map asks none of it. The source upload lives in the topic composer,
// since either mode can be grounded in one.

import type { CSSProperties } from "react";
import {
  DAILY_TARGETS,
  PARETO_DEFAULT,
  PARETO_LEVELS,
  goals,
  goalDateLabel,
  localDay,
  type OnboardingForm,
} from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    goalQuestion: "Why are you learning this?",
    goalHint: "— steers what we prune and prioritize",
    examDateHint: "— powers the real countdown & pace (skippable)",
    interests: "Your interests",
    interestsHint: "— for analogies & examples (optional)",
    interestsPlaceholder: "e.g. chess, investing, cooking",
    pareto: "How much of the topic?",
    paretoHint: "— the share of real results you want, at least effort",
    paretoPct: (pct: number) => `top ${pct}%`,
    paretoNote: (pct: number) =>
      `A smaller map: only the concepts carrying the top ${pct}% of real-world results — edge cases and completeness pruned.`,
    dailyTarget: "Daily target",
    dailyTargetHint: "— your streak unit & honest queue budget",
    minutes: (min: number) => `${min} min`,
  },
  "pt-BR": {
    goalQuestion: "Por que você está aprendendo isso?",
    goalHint: "— orienta o que priorizamos e deixamos de lado",
    examDateHint: "— alimenta a contagem regressiva e o ritmo (opcional)",
    interests: "Seus interesses",
    interestsHint: "— para analogias e exemplos (opcional)",
    interestsPlaceholder: "ex.: xadrez, investimentos, culinária",
    pareto: "Quanto do tema?",
    paretoHint: "— a fatia de resultado real que você quer, com menos esforço",
    paretoPct: (pct: number) => `top ${pct}%`,
    paretoNote: (pct: number) =>
      `Um mapa menor: só os conceitos que carregam os ${pct}% mais úteis na prática — casos de borda e completude podados.`,
    dailyTarget: "Meta diária",
    dailyTargetHint: "— sua unidade de sequência e orçamento honesto de fila",
    minutes: (min: number) => `${min} min`,
  },
} as const;

const label: CSSProperties = { fontSize: 14, color: color.inkSoft, marginBottom: 12 };
const field: CSSProperties = {
  background: color.card,
  border: `1px solid ${color.hairlineStrong}`,
  borderRadius: 3,
  color: color.ink,
};

function optionStyle(active: boolean, grow: boolean): CSSProperties {
  return {
    flex: grow ? 1 : "0 0 auto",
    padding: grow ? "13px 10px" : "12px 20px",
    background: active ? color.accentBg : color.card,
    border: `1px solid ${active ? color.accent : color.hairlineStrong}`,
    borderRadius: 11,
    fontSize: 14,
    cursor: "pointer",
    color: active ? color.accent : color.inkSoft,
    fontWeight: active ? 600 : 400,
  };
}

/** The full setup, exactly what building a map always asked — only for mastery. */
export default function MasteryDetails(props: {
  form: OnboardingForm;
  onChange: (patch: Partial<OnboardingForm>) => void;
}) {
  const { form, onChange } = props;
  const t = useT(STRINGS);
  const { language } = useLanguage();
  return (
    <>
      <div style={{ marginBottom: 32 }}>
        <div style={label}>
          {t.goalQuestion} <span style={{ color: color.inkGhost }}>{t.goalHint}</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {goals(language).map(([key, name]) => (
            <button
              type="button"
              className="at-press"
              key={key}
              data-testid={`action-goal-${key}`}
              aria-pressed={form.goal === key}
              onClick={() => onChange({ goal: key })}
              style={optionStyle(form.goal === key, true)}
            >
              {name}
            </button>
          ))}
        </div>
        {form.goal === "pareto" && (
          <div style={{ marginTop: 14, animation: "fadeUp 0.25s both" }}>
            <div style={{ ...label, marginBottom: 10 }}>
              {t.pareto} <span style={{ color: color.inkGhost }}>{t.paretoHint}</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {PARETO_LEVELS.map((pct) => (
                <button
                  type="button"
                  className="at-press"
                  key={pct}
                  onClick={() => onChange({ paretoPct: pct })}
                  style={optionStyle((form.paretoPct ?? PARETO_DEFAULT) === pct, false)}
                >
                  {t.paretoPct(pct)}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: color.inkGhost, marginTop: 10 }}>
              {t.paretoNote(form.paretoPct ?? PARETO_DEFAULT)}
            </div>
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14, color: color.inkSoft }}>
            {goalDateLabel(form.goal, language)}{" "}
            <span style={{ color: color.inkGhost }}>{t.examDateHint}</span>
          </span>
          <input
            type="date"
            value={form.examDate}
            min={localDay()}
            onChange={(e) => onChange({ examDate: e.target.value })}
            style={{ ...field, padding: "9px 12px", fontSize: 14, fontFamily: font.sans }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={label}>
          {t.interests} <span style={{ color: color.inkGhost }}>{t.interestsHint}</span>
        </div>
        <input
          data-testid="field-interests"
          aria-label={t.interests}
          value={form.interests}
          onChange={(e) => onChange({ interests: e.target.value })}
          placeholder={t.interestsPlaceholder}
          style={{ ...field, width: "100%", padding: "14px 16px", fontSize: 15 }}
        />
      </div>

      <div>
        <div style={label}>
          {t.dailyTarget}{" "}
          <span style={{ color: color.inkGhost }}>{t.dailyTargetHint}</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {DAILY_TARGETS.map((minutes) => (
            <button
              type="button"
              className="at-press"
              key={minutes}
              onClick={() => onChange({ target: minutes })}
              style={optionStyle(form.target === minutes, false)}
            >
              {t.minutes(minutes)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
