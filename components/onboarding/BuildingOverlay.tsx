"use client";

import { useEffect, useState } from "react";
import { InkRule } from "@/components/Pending";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    kicker: "Generating your map",
    body: [
      "Surveying the territory…",
      "Placing the foundations…",
      "Charting the prerequisites…",
      "Lighting the frontier…",
    ],
  },
  "pt-BR": {
    kicker: "Gerando seu mapa",
    body: [
      "Explorando o território…",
      "Assentando as fundações…",
      "Mapeando os pré-requisitos…",
      "Acendendo a fronteira…",
    ],
  },
} as const;

/** `note` names what has actually arrived ("14 concepts placed"), so the beat
 *  reads as progress rather than as a spinner with better typography. `body`
 *  rotates through a few lines on its own timer — the wait is real, so the
 *  copy should feel like it's narrating work, not stalling on one sentence. */
export default function BuildingOverlay({ note }: { note?: string | null }) {
  const t = useT(STRINGS);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % t.body.length), 1400);
    return () => clearInterval(id);
  }, [t.body.length]);
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
          key={line}
          style={{
            fontFamily: font.serif,
            fontSize: 26,
            color: color.ink,
            marginBottom: 22,
            animation: "softIn .4s both",
          }}
        >
          {t.body[line]}
        </div>
        <InkRule width={260} />
        {note && (
          <div
            style={{
              marginTop: 14,
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.08em",
              color: color.inkGhost,
              animation: "softIn .3s both",
            }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}
