"use client";

import { InkDots, InkRule } from "@/components/Pending";
import { color, font, kicker, motion } from "@/lib/theme";
import { usePresence } from "@/lib/motion";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: { generating: "generating" },
  "pt-BR": { generating: "gerando" },
} as const;

/**
 * The full-screen "the AI is writing this" moment shown while a session's
 * content is generated. Blocks interaction — content arrives in one piece.
 */
export default function GeneratingOverlay({
  open,
  phase,
  message,
}: {
  /** False fades the scrim out; content behind it shouldn't snap into view. */
  open: boolean;
  phase: string;
  message: string;
}) {
  const t = useT(STRINGS);
  const { mounted, state } = usePresence(open, EXIT_MS);
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
        background: "rgba(248,246,240,0.86)",
        backdropFilter: "blur(6px)",
        animation:
          state === "in"
            ? `softIn ${motion.duration.base}ms ${motion.ease.enter} both`
            : `softOut ${EXIT_MS}ms ${motion.ease.exit} both`,
      }}
    >
      <div style={{ textAlign: "center", animation: "fadeUp 0.5s both" }}>
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
        <InkRule />
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
          <InkDots size={3} />
        </div>
      </div>
    </div>
  );
}

const EXIT_MS = motion.duration.base;
