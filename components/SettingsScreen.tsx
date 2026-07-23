"use client";

import type { CSSProperties } from "react";
import {
  DAILY_TARGETS,
  GOALS,
  localDay,
  reminderCopy,
  STATE_COLOR,
  type AdherenceState,
  type OnboardingForm,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

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
          ← Back
        </button>
        <div style={{ ...kicker(11, "0.2em"), marginBottom: 14 }}>Settings</div>
        <h1
          style={{
            fontFamily: font.serif,
            fontWeight: 500,
            fontSize: 34,
            lineHeight: 1.1,
            margin: "0 0 36px",
          }}
        >
          Tune the run
        </h1>

        <Section label="Goal" hint="steers what we prune and prioritize">
          <div style={{ display: "flex", gap: 10 }}>
            {GOALS.map(([key, label]) => (
              <button
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
                Exam date{" "}
                <span style={{ color: color.inkGhost }}>
                  — the countdown and pace math read this
                </span>
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

        <Section label="Daily target" hint="streak unit & honest queue budget">
          <div style={{ display: "flex", gap: 10 }}>
            {DAILY_TARGETS.map((minutes) => (
              <button
                key={minutes}
                onClick={() => onChange({ target: minutes })}
                style={optionStyle(form.target === minutes, false)}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </Section>

        <Section label="Interests" hint="analogies & examples draw from these">
          <input
            value={form.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
            placeholder="e.g. chess, investing, cooking"
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

        <Section label="Reminder">
          <button
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
                transition: "background .2s",
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
                  transition: "left .2s",
                }}
              />
            </span>
            {reminderCopy(adherence)}
          </button>
        </Section>

        <Section label="Your data" hint="it's yours — take it anywhere">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={onExportMap} style={exportStyle}>
              Export map · nodes, edges &amp; mastery states (JSON)
            </button>
            <button onClick={onExportCardsJson} style={exportStyle}>
              Export cards · full deck with scheduling (JSON)
            </button>
            <button onClick={onExportCardsCsv} style={exportStyle}>
              Export cards · Anki-importable (CSV)
            </button>
          </div>
        </Section>

        <Section label="Account" hint="delete everything — no take-backs">
          <button
            onClick={onDeleteAccount}
            style={{
              ...exportStyle,
              width: "100%",
              color: STATE_COLOR.gap,
              border: `1px solid ${STATE_COLOR.gap}`,
            }}
          >
            Delete account &amp; all data
          </button>
          <div style={{ marginTop: 16, fontSize: 12.5, color: color.inkGhost }}>
            <a href="/privacy" style={{ color: color.inkMuted }}>
              Privacy &amp; data
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}
