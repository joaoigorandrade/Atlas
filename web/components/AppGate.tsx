"use client";

// The mark held while the saved run loads — delayed past a fast hydration so a
// quick resume never flashes it. (It used to also gate the map below 768px;
// the map now lays itself out for a phone instead.)

import { CompassRose } from "@/components/Engravings";
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
          <CompassRose size={88} />
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: color.inkFaint,
          }}
        >
          {t.tagline}
        </div>
      </div>
    </div>
  );
}
