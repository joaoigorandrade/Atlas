"use client";

import { InkRule } from "@/components/Pending";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Generating your map",
    body: "Assembling the territory, foundations first…",
  },
  "pt-BR": {
    kicker: "Gerando seu mapa",
    body: "Montando o território, começando pelas fundações…",
  },
} as const;

export default function BuildingOverlay() {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 64,
        pointerEvents: "none",
      }}
    >
      <div style={{ textAlign: "center", animation: "fadeUp 0.6s both" }}>
        <div style={{ ...kicker(11, "0.18em"), marginBottom: 10 }}>
          {t.kicker}
        </div>
        <div
          style={{
            fontFamily: font.serif,
            fontSize: 26,
            color: color.ink,
            marginBottom: 22,
          }}
        >
          {t.body}
        </div>
        <InkRule width={260} />
      </div>
    </div>
  );
}
