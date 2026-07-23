"use client";

import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  DAILY_TARGETS,
  GOALS,
  localDay,
  type OnboardingForm,
} from "@/lib/curriculum";
import type { ScopeOffer } from "@/lib/api";
import { color, font, kicker } from "@/lib/theme";

interface WelcomeScreenProps {
  form: OnboardingForm;
  onChange: (patch: Partial<OnboardingForm>) => void;
  onBuild: () => void;
  /** Uploaded-outline grounding (#30): a chosen file goes up for extraction. */
  onFile: (file: File) => void;
  /** Status line under the drop zone — "Grounded in x.pdf", or honest failure copy. */
  uploadNote: string | null;
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
    transition: "border-color .15s, background .15s",
  };
}

export default function WelcomeScreen({
  form,
  onChange,
  onBuild,
  onFile,
  uploadNote,
  scopes,
  onPickScope,
}: WelcomeScreenProps) {
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            background: color.card,
            border: `1px ${dragging ? "dashed" : "solid"} ${
              dragging ? color.accent : color.hairlineStrong
            }`,
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
            color: uploadNote ? color.accent : color.inkFaint,
            marginBottom: 38,
            paddingLeft: 4,
          }}
        >
          {uploadNote ?? (
            <>
              or drop a PDF / course outline here ·{" "}
              <button
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
                browse
              </button>{" "}
              · we ground the map in a real source
            </>
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
            <div style={{ fontSize: 14.5, color: color.amberInk, marginBottom: 14 }}>
              “{form.topic}” is a continent, not a map. Pick a scoped territory
              to start with:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scopes.map((scope) => (
                <button
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
                  <div style={{ fontFamily: font.serif, fontSize: 16.5, color: color.ink }}>
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
                Exam date{" "}
                <span style={{ color: color.inkGhost }}>
                  — powers the real countdown &amp; pace (skippable)
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
