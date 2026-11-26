"use client";

// Perform's work area: the run written out, or drawn — a diagram, a
// construction, boxes and arrows. Both go to the checker; the tabs only pick
// which one is on screen, and neither is cleared by switching.

import { useState, type Ref } from "react";
import { MicButton } from "@/components/VoiceInput";
import SketchPad from "@/components/session/perform/SketchPad";
import { performCopy, PERFORM_COLOR } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

type Copy = ReturnType<typeof performCopy>;

export default function PerformWork({
  copy,
  work,
  sketch,
  busy,
  field,
  onWork,
  onSketch,
  onSubmit,
}: {
  copy: Copy;
  work: string;
  sketch: string | undefined;
  busy: boolean;
  field: Ref<HTMLTextAreaElement>;
  onWork: (value: string) => void;
  onSketch: (png: string | undefined) => void;
  onSubmit: () => void;
}) {
  const [tab, setTab] = useState<"write" | "draw">(
    sketch && !work.trim() ? "draw" : "write",
  );
  // A two-way segmented switch beside the label, not three look-alike
  // kickers: on a phone it is the one thumb target the row needs.
  const tabStyle = (on: boolean) =>
    ({
      ...kicker(10, "0.1em", on ? color.accentInk : color.inkMuted),
      minHeight: 32,
      padding: "0 14px",
      background: on ? PERFORM_COLOR.accent : "none",
      border: "none",
      borderRadius: 2,
      cursor: "pointer",
    }) as const;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 9,
        }}
      >
        <span style={kicker(10, "0.1em", color.inkGhost)}>{copy.yourWork}</span>
        <div
          role="tablist"
          style={{
            display: "flex",
            padding: 2,
            borderRadius: 3,
            border: `1px solid ${color.hairlineStrong}`,
            background: color.card,
          }}
        >
          {(["write", "draw"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              data-testid={`perform-tab-${t}`}
              onClick={() => setTab(t)}
              style={tabStyle(tab === t)}
            >
              {copy[t]}
              {t === "draw" && sketch ? " •" : ""}
            </button>
          ))}
        </div>
      </div>
      {tab === "draw" ? (
        <SketchPad
          value={sketch}
          onChange={onSketch}
          disabled={busy}
          labels={{ undo: copy.undo, clear: copy.clear }}
        />
      ) : (
        <>
          <textarea
            ref={field}
            data-testid="field-answer"
            value={work}
            disabled={busy}
            onChange={(e) => onWork(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if ((work.trim() || sketch) && !busy) onSubmit();
              }
            }}
            placeholder={busy ? copy.judging : copy.placeholder}
            rows={12}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "14px 16px",
              borderRadius: 3,
              fontSize: 14.5,
              lineHeight: 1.6,
              fontFamily: font.serif,
              border: `1px solid ${color.hairlineStrong}`,
              background: color.card,
              color: color.ink,
              opacity: busy ? 0.6 : 1,
            }}
          />
          <MicButton value={work} onChange={onWork} disabled={busy} />
        </>
      )}
    </>
  );
}
