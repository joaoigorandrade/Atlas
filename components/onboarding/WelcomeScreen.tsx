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
import ScopeOffers from "@/components/onboarding/ScopeOffers";
import { CompassRose, Fleuron } from "@/components/ui/Ornaments";
import { color, font, kicker, motion } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Atlas · learn anything, deeply",
    title: "What do you want to learn?",
    topicPlaceholder: "A topic, a pasted syllabus…",
    dropPrefix: "or drop a PDF / course outline here · ",
    browse: "browse",
    dropSuffix: " · we ground the map in a real source",
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
  /** Take every offer at once, as one continent (`useContinents.chartAll`). */
  onChartContinent: () => void;
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
  onChartContinent,
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
    // The atlas opened at its cover: marbled endpapers, and the first leaf —
    // torn-edged, hand-made — laid over them.
    <div
      data-testid="screen-welcome"
      className="at-endpaper"
      style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "56px 24px" }}
    >
      <div
        className="at-deckle"
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "54px 60px 64px",
          background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
          boxShadow: "0 30px 60px rgba(10,8,6,0.45), 0 2px 0 rgba(10,8,6,0.2)",
          animation: `fadeUp ${motion.duration.deliberate}ms ${motion.ease.enter} both`,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <CompassRose size={46} />
          <div style={{ ...kicker(12, "0.22em"), margin: "14px 0 12px" }}>{t.kicker}</div>
          <h1
            style={{
              fontFamily: font.display,
              fontWeight: 400,
              fontSize: 48,
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            {t.title}
          </h1>
          <Fleuron style={{ margin: "22px 60px 0" }} />
        </div>

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
            borderRadius: 3,
            padding: 6,
            marginBottom: 8,
            boxShadow: "0 4px 18px rgba(43,33,24,0.05)",
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
          <ScopeOffers
            topic={form.topic}
            scopes={scopes}
            onPick={onPickScope}
            onChartAll={onChartContinent}
          />
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
                  borderRadius: 3,
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
              borderRadius: 3,
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

        <Button data-testid="action-build" onClick={onBuild}>
          {t.build}
        </Button>
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
