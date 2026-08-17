"use client";

import { PassageAsk, STRINGS } from "./shared";
import { InlineError } from "@/components/ErrorState";
import { StreamingText } from "@/components/Pending";
import { useT } from "@/lib/i18n";
import { color, font, kicker } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import { MicButton } from "@/components/VoiceInput";
import Rich from "@/components/Rich";

export function PassagePanel({
  ask,
  suggestion,
  onAsk,
  onClose,
}: {
  ask: PassageAsk;
  /** The model's pre-written question for this section — the "not sure what to
   *  ask?" seed, which is all `chunk.ask` was ever able to be. */
  suggestion: string;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const composing = ask.status === "composing";

  useEffect(() => {
    if (composing) boxRef.current?.focus();
  }, [composing]);

  const submit = () => {
    if (!composing) return;
    onAsk(draft.trim());
  };

  return (
    <div
      style={{
        marginTop: 18,
        borderLeft: `3px solid ${color.accent}`,
        background: color.accentBg,
        borderRadius: "0 10px 10px 0",
        padding: "14px 16px",
        animation: "fadeUp .3s both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 9,
        }}
      >
        <span style={{ ...kicker(9.5, "0.12em"), color: color.accent }}>
          {ask.selection ? t.askAbout : t.askWholeSection}
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="at-press"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontFamily: "inherit",
            fontSize: 12,
            color: color.inkFaint,
            cursor: "pointer",
          }}
        >
          {t.askClose}
        </button>
      </div>

      {ask.selection && (
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 15,
            lineHeight: 1.5,
            color: color.inkSoft,
            fontStyle: "italic",
            marginBottom: 12,
            // A long highlight must not push the answer off the screen.
            maxHeight: 96,
            overflowY: "auto",
          }}
        >
          “{ask.selection}”
        </div>
      )}

      {composing ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={boxRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              rows={2}
              placeholder={t.askPlaceholder}
              style={{
                flex: 1,
                resize: "vertical",
                padding: "10px 12px",
                borderRadius: 9,
                border: `1px solid ${color.hairlineStrong}`,
                background: color.card,
                color: color.ink,
                fontFamily: "inherit",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            />
            <MicButton value={draft} onChange={setDraft} />
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              className="at-press"
              onClick={submit}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "none",
                background: color.accent,
                color: color.accentInk,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {draft.trim() ? t.askSubmit : t.askExplain}
            </button>
            {suggestion && !draft.trim() && (
              <button
                className="at-press"
                onClick={() => setDraft(suggestion)}
                title={suggestion}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {t.askSuggested}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {ask.question && (
            <div
              style={{
                fontSize: 13.5,
                color: color.inkMuted,
                marginBottom: 10,
              }}
            >
              <Rich text={ask.question} />
            </div>
          )}
          {ask.parts.map((p, i) => (
            <p
              key={i}
              style={{
                fontFamily: font.serif,
                fontSize: 16.5,
                lineHeight: 1.62,
                color: color.ink,
                margin: i === 0 ? "0 0 12px" : "0 0 12px",
              }}
            >
              {/* The answer arrives word by word; the nib sits at the end of
                  the paragraph being written, never on the ones behind it. */}
              <StreamingText
                text={p}
                writing={ask.status === "asking" && i === ask.parts.length - 1}
              />
            </p>
          ))}
          {ask.status === "asking" && ask.parts.length === 0 && (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.inkGhost,
                // `breathe`, not `pulseGlow`: this is bare text with no box to
                // cast a shadow, so the glow keyframe animated nothing at all.
                animation: "breathe 1.8s ease-in-out infinite",
              }}
            >
              {t.askThinking}
            </div>
          )}
          {ask.status === "error" && (
            // Was a bare red line with nothing to do about it. The retry
            // re-asks the same question — the learner shouldn't have to
            // re-type it because the network dropped.
            <InlineError
              message={t.askFailed}
              retryLabel={t.askRetry}
              onRetry={onAsk ? () => onAsk(ask.question) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The comprehension check that closes a section. It stays out of the way until
 * the learner has actually scrolled to the end of the reading — the card
 * animates in the first time its slot crosses into view — and the section's
 * Continue only appears once the answer is right. A wrong pick is named and
 * the options stay live: this is a receipt for reading, not a score.
 */
