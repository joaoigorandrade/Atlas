"use client";

import type { CSSProperties } from "react";
import {
  DAILY_TARGETS,
  GOALS,
  type OnboardingForm,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface WelcomeScreenProps {
  form: OnboardingForm;
  onChange: (patch: Partial<OnboardingForm>) => void;
  onBuild: () => void;
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
    transition: "border-color .15s, background .15s",
  };
}

export default function WelcomeScreen({
  form,
  onChange,
  onBuild,
}: WelcomeScreenProps) {
  return (
    <div
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
        <div style={{ ...kicker(11, "0.2em"), marginBottom: 18 }}>
          Atlas · learn anything, deeply
        </div>
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
          What do you want to learn?
        </h1>

        <div
          style={{
            background: color.card,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 14,
            padding: 6,
            marginBottom: 8,
            boxShadow: "0 4px 18px rgba(44,40,35,0.05)",
          }}
        >
          <input
            value={form.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
            placeholder="A topic, a pasted syllabus…"
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
            color: color.inkFaint,
            marginBottom: 38,
            paddingLeft: 4,
          }}
        >
          or drop a PDF / course outline · we ground the map in a real source
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
            Why are you learning this?{" "}
            <span style={{ color: color.inkGhost }}>
              — steers what we prune and prioritize
            </span>
          </div>
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
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: color.inkSoft, marginBottom: 12 }}>
            Your interests{" "}
            <span style={{ color: color.inkGhost }}>
              — for analogies &amp; examples (optional)
            </span>
          </div>
          <input
            value={form.interests}
            onChange={(e) => onChange({ interests: e.target.value })}
            placeholder="e.g. chess, investing, cooking"
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
            Daily target{" "}
            <span style={{ color: color.inkGhost }}>
              — your streak unit &amp; honest queue budget
            </span>
          </div>
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
        </div>

        <button
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
          Build my map →
        </button>
        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 13,
            color: color.inkGhost,
          }}
        >
          ~5 minutes to a lit-up map with a clear frontier
        </div>
      </div>
    </div>
  );
}
