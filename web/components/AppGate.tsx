"use client";

// The mark held while the saved run loads — delayed past a fast hydration so a
// quick resume never flashes it. (It used to also gate the map below 768px;
// the map now lays itself out for a phone instead.)

import { InkRule } from "@/components/Pending";
import { useT } from "@/lib/i18n";
import { color, font } from "@/lib/theme";

const STRINGS = {
  en: { tagline: "Atlas · learn anything, deeply" },
  "pt-BR": { tagline: "Atlas · aprenda qualquer coisa, a fundo" },
} as const;

export default function AppGate() {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: color.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ textAlign: "center", animation: "softIn 0.5s 0.4s both" }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: color.inkFaint,
            marginBottom: 16,
          }}
        >
          {t.tagline}
        </div>
        <InkRule width={180} />
      </div>
    </div>
  );
}
