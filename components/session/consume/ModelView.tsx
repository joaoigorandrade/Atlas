"use client";

import { sectionName } from "./SpeakerButton";
import { BLUE, STRINGS } from "./shared";
import { SkeletonBars, StreamingText } from "@/components/Pending";
import {
  AltKey,
  ConsumeChunk,
  ConsumeModelBeat,
  altControls,
  lensNote,
} from "@/lib/curriculum";
import { useLanguage, useT } from "@/lib/i18n";
import { usePresence } from "@/lib/motion";
import { color, font, motion } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import Rich from "@/components/Rich";

const BEAT_MS = 3400;
const MODEL_EXIT_MS = motion.duration.fast;

/**
 * The model view: one lens, opened over the section it belongs to.
 *
 * The four controls used to swap the section's prose for a rewrite, which took
 * away the passage the learner was reading in the act of explaining it. This
 * opens on top instead — the section stays exactly where it was, under the
 * backdrop, and closing lands the learner back on the paragraph they left.
 *
 * Beats reveal one at a time rather than all at once, which is the point of a
 * *model* view: a mechanism read in sequence is a mechanism, read as a wall of
 * text it is prose. The cascade is on a timer, so it looks the same whether the
 * beats streamed in over ten seconds or came back cached in ten milliseconds.
 */
export function ModelView({
  open,
  lens,
  chunk,
  beats,
  streaming,
  onClose,
}: {
  /** False plays the leave animation; the dialog unmounts when it finishes. */
  open: boolean;
  lens: AltKey;
  chunk: ConsumeChunk;
  beats: ConsumeModelBeat[];
  streaming: boolean;
  onClose: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const label = new Map(altControls(language)).get(lens) ?? lens;
  const bodyRef = useRef<HTMLDivElement>(null);
  const { mounted, state } = usePresence(open, MODEL_EXIT_MS);

  // Beats on screen so far. Never runs ahead of what has actually arrived, so
  // the cascade and the stream share one counter.
  const [revealed, setRevealed] = useState(1);
  const shown = Math.min(revealed, beats.length);
  const done = shown >= beats.length && !streaming;

  useEffect(() => {
    if (revealed >= beats.length) return;
    const id = window.setTimeout(() => setRevealed((n) => n + 1), BEAT_MS);
    return () => window.clearTimeout(id);
  }, [revealed, beats.length]);

  // A revealed beat below the fold is a beat nobody sees — follow the cascade
  // down. `smooth` on the container, not the page: the reading behind must not
  // move.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — ${chunk.kicker}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(28,25,21,0.42)",
        backdropFilter: "blur(3px)",
        animation:
          state === "in"
            ? `softIn ${motion.duration.base}ms ${motion.ease.enter} both`
            : `softOut ${MODEL_EXIT_MS}ms ${motion.ease.exit} both`,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 100%)",
          maxHeight: "min(78vh, 720px)",
          display: "flex",
          flexDirection: "column",
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(28,25,21,0.28)",
          overflow: "hidden",
          animation:
            state === "in"
              ? `modelIn ${motion.duration.slow}ms ${motion.ease.enter} both`
              : `modelOut ${MODEL_EXIT_MS}ms ${motion.ease.exit} both`,
        }}
      >
        {/* Header — which lens, over which section */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            padding: "18px 22px 14px",
            borderBottom: `1px solid ${color.hairline}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 9.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: BLUE,
                marginBottom: 7,
              }}
            >
              {t.modelKicker} · {sectionName(chunk.kicker)}
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 1.2 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, color: color.inkMuted, marginTop: 5 }}>
              {lensNote(lens, language)}
            </div>
          </div>
          <button
            className="at-press"
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={t.modelClose}
            title={t.modelClose}
            style={{
              flex: "0 0 auto",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: "50%",
              border: `1px solid ${color.hairlineStrong}`,
              background: color.paper,
              color: color.inkMuted,
              fontSize: 15,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* The beats, on their rail */}
        <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          {beats.length === 0 && !streaming ? (
            // Nothing landed and nothing is coming: the generation failed and
            // was already toasted. Say so here rather than leaving a skeleton
            // pulsing at a learner forever.
            <div style={{ fontSize: 14, lineHeight: 1.6, color: color.inkMuted }}>
              {t.modelEmpty}
            </div>
          ) : beats.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.inkGhost,
                  marginBottom: 4,
                }}
              >
                {t.modelOpening}
              </div>
              <SkeletonBars widths={[150, "92%", "84%"]} heights={[12, 15, 15]} />
            </div>
          ) : (
            beats.slice(0, shown).map((beat, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  paddingBottom: i === shown - 1 ? 0 : 18,
                  animation: "fadeUp .45s both",
                }}
              >
                {/* Rail: a filled dot per beat, the thread between them drawn
                    only as far as the walkthrough has actually got. */}
                <div
                  style={{
                    flex: "0 0 auto",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 10,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      marginTop: 6,
                      background: BLUE,
                    }}
                  />
                  {i < shown - 1 && (
                    <span
                      style={{
                        flex: 1,
                        width: 1,
                        background: "rgba(91,127,191,0.32)",
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: color.inkFaint,
                      marginBottom: 6,
                    }}
                  >
                    <Rich text={beat.label} />
                  </div>
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 17,
                      lineHeight: 1.62,
                      color: color.ink,
                    }}
                  >
                    {/* The newest beat is still being written — its words land
                        as they are decoded, with the nib at the end. */}
                    <StreamingText
                      text={beat.text}
                      writing={streaming && i === beats.length - 1}
                    />
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Caught up to the writer. */}
          {beats.length > 0 && streaming && shown >= beats.length && (
            <div
              style={{
                marginTop: 18,
                paddingLeft: 24,
                fontFamily: font.mono,
                fontSize: 11,
                color: color.inkGhost,
                animation: "breathe 1.8s ease-in-out infinite",
              }}
            >
              {t.modelWriting}
            </div>
          )}
        </div>

        {/* Footer — the count, the skip, and the way back to the reading */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "13px 22px",
            borderTop: `1px solid ${color.hairline}`,
            background: color.cardAlt,
          }}
        >
          {beats.length > 0 && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                color: color.inkFaint,
              }}
            >
              {t.modelBeat(shown, beats.length)}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {shown < beats.length && (
            <>
              <button
                className="at-press"
                type="button"
                onClick={() => setRevealed(beats.length)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                }}
              >
                {t.modelRevealAll}
              </button>
              <button
                className="at-press"
                type="button"
                onClick={() => setRevealed((n) => n + 1)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 9,
                  border: `1px solid ${color.hairlineStrong}`,
                  background: color.card,
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: color.ink,
                  cursor: "pointer",
                }}
              >
                {t.modelNext}
              </button>
            </>
          )}
          {done && (
            <button
              className="at-press"
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 15px",
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
              {t.modelBack}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
