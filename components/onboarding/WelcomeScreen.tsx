"use client";

import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  DAILY_TARGETS,
  PARETO_DEFAULT,
  PARETO_LEVELS,
  goals,
  localDay,
  type OnboardingForm,
} from "@/lib/curriculum";
import type { ScopeOffer } from "@/lib/api";
import { InkDots } from "@/components/Pending";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Atlas · learn anything, deeply",
    title: "What do you want to learn?",
    topicPlaceholder: "A topic, a pasted syllabus…",
    dropPrefix: "or drop a PDF / course outline here · ",
    browse: "browse",
    dropSuffix: " · we ground the map in a real source",
    scopeIntro: (topic: string) =>
      `"${topic}" is a continent, not a map. Pick a scoped territory to start with:`,
    goalQuestion: "Why are you learning this?",
    goalHint: "— steers what we prune and prioritize",
    examDate: "Exam date",
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
    build: "Build my map →",
    footer: "~5 minutes to a lit-up map with a clear frontier",
  },
  "pt-BR": {
    kicker: "Atlas · aprenda qualquer coisa, a fundo",
    title: "O que você quer aprender?",
    topicPlaceholder: "Um tema, uma ementa colada…",
    dropPrefix: "ou solte um PDF / ementa aqui · ",
    browse: "procurar",
    dropSuffix: " · fundamentamos o mapa numa fonte real",
    scopeIntro: (topic: string) =>
      `"${topic}" é um continente, não um mapa. Escolha um território mais específico para começar:`,
    goalQuestion: "Por que você está aprendendo isso?",
    goalHint: "— orienta o que priorizamos e deixamos de lado",
    examDate: "Data da prova",
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
    build: "Montar meu mapa →",
    footer: "~5 minutos para um mapa aceso com uma fronteira clara",
  },
} as const;

interface WelcomeScreenProps {
  form: OnboardingForm;
  onChange: (patch: Partial<OnboardingForm>) => void;
  onBuild: () => void;
  /** Uploaded-outline grounding (#30): a chosen file goes up for extraction. */
  onFile: (file: File) => void;
  /** Status line under the drop zone — "Grounded in x.pdf", or honest failure copy. */
  uploadNote: string | null;
  /** True while the dropped file is still being read server-side. */
  uploadBusy: boolean;
  /** Scoped sub-map offers when the topic was too broad, else null (#30). */
  scopes: ScopeOffer[] | null;
  onPickScope: (label: string) => void;
}

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

export default function WelcomeScreen({
  form,
  onChange,
  onBuild,
  onFile,
  uploadNote,
  uploadBusy,
  scopes,
  onPickScope,
}: WelcomeScreenProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      data-testid="screen-welcome"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        background: color.paper,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          padding: "70px 40px 90px",
          animation: "fadeUp 0.5s both",
        }}
      >
        <div style={{ ...kicker(11, "0.2em"), marginBottom: 18 }}>{t.kicker}</div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.08,
            letterSpacing: "-0.015em",
            margin: "0 0 40px",
          }}
        >
          {t.title}
        </h1>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            background: color.card,
            border: `1px ${dragging ? "dashed" : "solid"} ${dragging ? color.accent : color.hairlineStrong}`,
            borderRadius: 14,
            padding: 6,
            marginBottom: 8,
            boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
          }}
        >
          <input
            data-testid="field-topic"
            aria-label={t.title}
            value={form.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
            placeholder={t.topicPlaceholder}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              fontFamily: font.serif,
              fontSize: 22,
              color: color.ink,
              padding: "16px 16px",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 13,
            color: uploadNote ? color.accent : color.inkFaint,
            marginBottom: 38,
            paddingLeft: 4,
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          {uploadNote ? (
            <>
              <span
                style={
                  uploadBusy
                    ? { animation: "breathe 2s ease-in-out infinite" }
                    : { animation: "fadeUp .3s both" }
                }
              >
                {uploadNote}
              </span>
              {uploadBusy && <InkDots size={3.5} tone={color.accent} />}
            </>
          ) : (
            <span>
              {t.dropPrefix}
              <button
                className="at-press"
                onClick={() => fileRef.current?.click()}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  color: color.inkMuted,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                {t.browse}
              </button>
              {t.dropSuffix}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {scopes && (
          <div
            style={{
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.25)",
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 32,
              animation: "fadeUp 0.3s both",
            }}
          >
            <div
              style={{
                fontSize: 14.5,
                color: color.amberInk,
                marginBottom: 14,
              }}
            >
              {t.scopeIntro(form.topic)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scopes.map((scope) => (
                <button
                  className="at-press"
                  key={scope.label}
                  onClick={() => onPickScope(scope.label)}
                  style={{
                    textAlign: "left",
                    padding: "12px 15px",
                    background: color.card,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 11,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 16.5,
                      color: color.ink,
                    }}
                  >
                    {scope.label} →
                  </div>
                  <div style={{ fontSize: 13, color: color.inkSoft, marginTop: 3 }}>
                    {scope.note}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
            {t.goalQuestion} <span style={{ color: color.inkGhost }}>{t.goalHint}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {goals(language).map(([key, label]) => (
              <button
                className="at-press"
                key={key}
                data-testid={`action-goal-${key}`}
                aria-pressed={form.goal === key}
                onClick={() => onChange({ goal: key })}
                style={optionStyle(form.goal === key, true)}
              >
                {label}
              </button>
            ))}
          </div>
          {form.goal === "pareto" && (
            <div style={{ marginTop: 14, animation: "fadeUp 0.25s both" }}>
              <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 10 }}>
                {t.pareto} <span style={{ color: color.inkGhost }}>{t.paretoHint}</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {PARETO_LEVELS.map((pct) => (
                  <button
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
          {form.goal === "exam" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 12,
                animation: "fadeUp 0.25s both",
              }}
            >
              <span style={{ fontSize: 14, color: color.inkSoft }}>
                {t.examDate}{" "}
                <span style={{ color: color.inkGhost }}>{t.examDateHint}</span>
              </span>
              <input
                type="date"
                value={form.examDate}
                min={localDay()}
                onChange={(e) => onChange({ examDate: e.target.value })}
                style={{
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 9,
                  padding: "9px 12px",
                  fontSize: 14,
                  color: color.ink,
                  fontFamily: font.sans,
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
            {t.interests} <span style={{ color: color.inkGhost }}>{t.interestsHint}</span>
          </div>
          <input
            data-testid="field-interests"
            aria-label={t.interests}
            value={form.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
            placeholder={t.interestsPlaceholder}
            style={{
              width: "100%",
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 11,
              padding: "14px 16px",
              fontSize: 15,
              color: color.ink,
            }}
          />
        </div>

        <div style={{ marginBottom: 44 }}>
          <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
            {t.dailyTarget}{" "}
            <span style={{ color: color.inkGhost }}>{t.dailyTargetHint}</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {DAILY_TARGETS.map((minutes) => (
              <button
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

        <button
          className="at-press"
          data-testid="action-build"
          onClick={onBuild}
          style={{
            width: "100%",
            padding: 18,
            background: color.accent,
            color: color.accentInk,
            border: "none",
            borderRadius: 13,
            fontSize: 17,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 10px 28px rgba(47,107,79,0.28)",
          }}
        >
          {t.build}
        </button>
        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 13,
            color: color.inkGhost,
          }}
        >
          {t.footer}
        </div>
      </div>
    </div>
  );
}
