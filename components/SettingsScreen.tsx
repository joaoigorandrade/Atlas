"use client";

import type { CSSProperties } from "react";
import {
  DAILY_TARGETS,
  goals,
  localDay,
  reminderCopy,
  STATE_COLOR,
  type AdherenceState,
  type OnboardingForm,
} from "@/lib/curriculum";
import { useVoicePrefs, useVoiceSupport } from "@/lib/speech";
import { color, font, kicker, transition } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    back: "← Back",
    settings: "Settings",
    tuneTheRun: "Tune the run",
    goal: "Goal",
    goalHint: "steers what we prune and prioritize",
    examDate: "Exam date",
    examDateHint: "the countdown and pace math read this",
    dailyTarget: "Daily target",
    dailyTargetHint: "streak unit & honest queue budget",
    minutes: (min: number) => `${min} min`,
    interests: "Interests",
    interestsHint: "analogies & examples draw from these",
    interestsPlaceholder: "e.g. chess, investing, cooking",
    reminder: "Reminder",
    language: "Language",
    languageHint: "interface & AI-generated content",
    english: "English",
    portuguese: "Português",
    voice: "Voice",
    voiceHint: "speak instead of typing, listen instead of reading",
    dictationOn: "Dictation on — a mic on every answer box",
    dictationOff: "Dictation off — typing only",
    readAloudOn: "Read aloud on — Consume sections can be spoken",
    readAloudOff: "Read aloud off — the reading stays silent",
    voiceUnsupported: "This browser can’t do it — Chrome, Edge and Safari can.",
    yourData: "Your data",
    yourDataHint: "it's yours — take it anywhere",
    exportMap: "Export map · nodes, edges & mastery states (JSON)",
    exportCardsJson: "Export cards · full deck with scheduling (JSON)",
    exportCardsCsv: "Export cards · Anki-importable (CSV)",
    account: "Account",
    accountHint: "delete everything — no take-backs",
    deleteAccount: "Delete account & all data",
    privacyData: "Privacy & data",
  },
  "pt-BR": {
    back: "← Voltar",
    settings: "Configurações",
    tuneTheRun: "Ajuste a jornada",
    goal: "Objetivo",
    goalHint: "orienta o que priorizamos e deixamos de lado",
    examDate: "Data da prova",
    examDateHint: "alimenta a contagem regressiva e o cálculo de ritmo",
    dailyTarget: "Meta diária",
    dailyTargetHint: "unidade de sequência e orçamento honesto de fila",
    minutes: (min: number) => `${min} min`,
    interests: "Interesses",
    interestsHint: "de onde vêm as analogias e exemplos",
    interestsPlaceholder: "ex.: xadrez, investimentos, culinária",
    reminder: "Lembrete",
    language: "Idioma",
    languageHint: "interface e conteúdo gerado por IA",
    english: "English",
    portuguese: "Português",
    voice: "Voz",
    voiceHint: "fale em vez de digitar, ouça em vez de ler",
    dictationOn: "Ditado ligado — microfone em toda caixa de resposta",
    dictationOff: "Ditado desligado — só digitação",
    readAloudOn: "Leitura em voz alta ligada — as seções do Consumir podem ser ouvidas",
    readAloudOff: "Leitura em voz alta desligada — a leitura fica em silêncio",
    voiceUnsupported: "Este navegador não suporta — Chrome, Edge e Safari suportam.",
    yourData: "Seus dados",
    yourDataHint: "são seus — leve para onde quiser",
    exportMap: "Exportar mapa · nós, conexões e domínio (JSON)",
    exportCardsJson: "Exportar cartões · baralho completo com cronograma (JSON)",
    exportCardsCsv: "Exportar cartões · importável no Anki (CSV)",
    account: "Conta",
    accountHint: "excluir tudo — sem volta",
    deleteAccount: "Excluir conta e todos os dados",
    privacyData: "Privacidade e dados",
  },
} as const;

// Settings (§16, #32): the onboarding choices stay editable for the life of a
// run — goal & exam date, daily target, interests, reminders — plus data
// export (map JSON, cards JSON + Anki-importable CSV).

interface SettingsScreenProps {
  form: OnboardingForm;
  adherence: AdherenceState;
  onChange: (patch: Partial<OnboardingForm>) => void;
  onToggleReminder: () => void;
  onExportMap: () => void;
  onExportCardsJson: () => void;
  onExportCardsCsv: () => void;
  onDeleteAccount: () => void;
  onExit: () => void;
}

function optionStyle(active: boolean, grow: boolean): CSSProperties {
  return {
    flex: grow ? 1 : "0 0 auto",
    padding: grow ? "12px 10px" : "11px 18px",
    background: active ? color.accentBg : color.card,
    border: `1px solid ${active ? color.accent : color.hairlineStrong}`,
    borderRadius: 11,
    fontSize: 14,
    cursor: "pointer",
    color: active ? color.accent : color.inkSoft,
    fontWeight: active ? 600 : 400,
  };
}

const exportStyle: CSSProperties = {
  padding: "11px 15px",
  background: color.card,
  border: `1px solid ${color.hairlineStrong}`,
  borderRadius: 11,
  fontSize: 13.5,
  color: color.ink,
  cursor: "pointer",
  textAlign: "left",
};

/** An on/off row: the option chrome every other setting uses, with the same
 *  switch the reminder row carries. */
function ToggleRow({
  on,
  label,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="at-press"
      onClick={onToggle}
      disabled={disabled}
      style={{
        ...optionStyle(on && !disabled, true),
        display: "flex",
        alignItems: "center",
        gap: 11,
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          width: 34,
          height: 20,
          borderRadius: 11,
          background: on && !disabled ? color.accent : "rgba(44,40,35,0.14)",
          position: "relative",
          flex: "0 0 auto",
          transition: transition("background"),
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on && !disabled ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: transition("left", "base", "enter"),
          }}
        />
      </span>
      {label}
    </button>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
        {label}{" "}
        {hint && <span style={{ color: color.inkGhost }}>— {hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsScreen({
  form,
  adherence,
  onChange,
  onToggleReminder,
  onExportMap,
  onExportCardsJson,
  onExportCardsCsv,
  onDeleteAccount,
  onExit,
}: SettingsScreenProps) {
  const t = useT(STRINGS);
  const { language, setLanguage } = useLanguage();
  // Voice is a device-level preference, not part of the run — it's read
  // straight from `lib/speech` here, exactly as the language is.
  const voice = useVoicePrefs();
  const voiceSupport = useVoiceSupport();
  const voiceMissing = !voiceSupport.dictation && !voiceSupport.readAloud;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        background: color.paper,
        zIndex: 30,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          padding: "56px 40px 90px",
          animation: "fadeUp 0.4s both",
        }}
      >
        <button
          className="at-press"
          onClick={onExit}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13.5,
            color: color.inkMuted,
            padding: 0,
            marginBottom: 26,
          }}
        >
          {t.back}
        </button>
        <div style={{ ...kicker(11, "0.2em"), marginBottom: 14 }}>{t.settings}</div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 36px",
          }}
        >
          {t.tuneTheRun}
        </h1>

        <Section label={t.goal} hint={t.goalHint}>
          <div style={{ display: "flex", gap: 10 }}>
            {goals(language).map(([key, label]) => (
              <button
                className="at-press"
                key={key}
                onClick={() => onChange({ goal: key })}
                style={optionStyle(form.goal === key, true)}
              >
                {label}
              </button>
            ))}
          </div>
          {form.goal === "exam" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 12,
              }}
            >
              <span style={{ fontSize: 14, color: color.inkSoft }}>
                {t.examDate}{" "}
                <span style={{ color: color.inkGhost }}>— {t.examDateHint}</span>
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
        </Section>

        <Section label={t.language} hint={t.languageHint}>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="at-press"
              onClick={() => setLanguage("en")}
              style={optionStyle(language === "en", true)}
            >
              {t.english}
            </button>
            <button
              className="at-press"
              onClick={() => setLanguage("pt-BR")}
              style={optionStyle(language === "pt-BR", true)}
            >
              {t.portuguese}
            </button>
          </div>
        </Section>

        <Section label={t.voice} hint={t.voiceHint}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ToggleRow
              on={voice.dictation}
              disabled={!voiceSupport.dictation}
              label={voice.dictation ? t.dictationOn : t.dictationOff}
              onToggle={() => voice.setDictation(!voice.dictation)}
            />
            <ToggleRow
              on={voice.readAloud}
              disabled={!voiceSupport.readAloud}
              label={voice.readAloud ? t.readAloudOn : t.readAloudOff}
              onToggle={() => voice.setReadAloud(!voice.readAloud)}
            />
          </div>
          {voiceMissing && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: color.inkGhost }}>
              {t.voiceUnsupported}
            </div>
          )}
        </Section>

        <Section label={t.dailyTarget} hint={t.dailyTargetHint}>
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
        </Section>

        <Section label={t.interests} hint={t.interestsHint}>
          <input
            value={form.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
            placeholder={t.interestsPlaceholder}
            style={{
              width: "100%",
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
              borderRadius: 11,
              padding: "13px 16px",
              fontSize: 15,
              color: color.ink,
            }}
          />
        </Section>

        <Section label={t.reminder}>
          <button
            className="at-press"
            onClick={onToggleReminder}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              ...exportStyle,
            }}
          >
            <span
              style={{
                width: 34,
                height: 20,
                borderRadius: 11,
                background: adherence.reminderOn
                  ? color.accent
                  : "rgba(44,40,35,0.14)",
                position: "relative",
                flex: "0 0 auto",
                transition: transition("background"),
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: adherence.reminderOn ? 16 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: transition("left", "base", "enter"),
                }}
              />
            </span>
            {reminderCopy(adherence, language)}
          </button>
        </Section>

        <Section label={t.yourData} hint={t.yourDataHint}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="at-press" onClick={onExportMap} style={exportStyle}>
              {t.exportMap}
            </button>
            <button className="at-press" onClick={onExportCardsJson} style={exportStyle}>
              {t.exportCardsJson}
            </button>
            <button className="at-press" onClick={onExportCardsCsv} style={exportStyle}>
              {t.exportCardsCsv}
            </button>
          </div>
        </Section>

        <Section label={t.account} hint={t.accountHint}>
          <button
            className="at-press"
            onClick={onDeleteAccount}
            style={{
              ...exportStyle,
              width: "100%",
              color: STATE_COLOR.gap,
              border: `1px solid ${STATE_COLOR.gap}`,
            }}
          >
            {t.deleteAccount}
          </button>
          <div style={{ marginTop: 16, fontSize: 12.5, color: color.inkGhost }}>
            <a href="/privacy" style={{ color: color.inkMuted }}>
              {t.privacyData}
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}
