"use client";

import { QuillMark } from "@/components/Engravings";
import { color, font, kicker, motion } from "@/lib/theme";
import { usePresence } from "@/lib/motion";
import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";

const STRINGS = {
  en: {
    generating: "generating",
    back: "Cancel",
    slow: "Still writing — it is written for you, so this can take up to a minute.",
  },
  "pt-BR": {
    generating: "gerando",
    back: "Cancelar",
    slow: "Ainda escrevendo — é escrito para você, então pode levar até um minuto.",
  },
} as const;

/** What the overlay says — AtlasApp's `loading` state, while it is up. */
export type Loading = { phase: string; message: string };

/**
 * The full-screen "the AI is writing this" moment shown while a session's
 * content is generated. Blocks interaction — content arrives in one piece.
 */
export default function GeneratingOverlay({
  open,
  phase,
  message,
  onCancel,
}: Loading & {
  /** False fades the scrim out; content behind it shouldn't snap into view. */
  open: boolean;
  /** A slow model can hold this for minutes; the learner is never trapped. */
  onCancel: () => void;
}) {
  const t = useT(STRINGS);
  const { mounted, state } = usePresence(open, EXIT_MS);
  // A wait past this reads as a hang unless something says it isn't one.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!open) return;
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [open, message]);
  if (!mounted) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // A flat wash of paper, not a blur: the map under it is still moving.
        // Near-opaque: at 0.9 the sheet's text read through the title.
        background: "rgba(var(--paper),.97)",
        padding: "0 24px",
        animation:
          state === "in"
            ? `softIn ${motion.duration.base}ms ${motion.ease.enter} both`
            : `softOut ${EXIT_MS}ms ${motion.ease.exit} both`,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 520, animation: "fadeUp 0.5s both" }}>
        <div style={{ ...kicker(11, "0.18em"), marginBottom: 10 }}>{phase}</div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 24,
            color: color.ink,
            marginBottom: 20,
          }}
        >
          {message}
        </div>
        <QuillMark />
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: "0.08em",
            color: color.inkGhost,
            animation: "breathe 2.4s ease-in-out infinite",
          }}
        >
          {t.generating}
        </div>
        {slow && (
          <div style={{ marginTop: 12, fontSize: 14, color: color.inkMuted }}>
            {t.slow}
          </div>
        )}
        <Button variant="quiet" onClick={onCancel} style={{ marginTop: 18 }}>
          {t.back}
        </Button>
      </div>
    </div>
  );
}

const EXIT_MS = motion.duration.base;
const SLOW_MS = 12_000;
