"use client";

// The plate at the foot of the chart that offers the one thing worth doing from
// the whole map rather than from a node.
//
// While there is a frontier it offers the Frontier Feed, a round of the next
// readings' pretests bet in ink, and only once a reading on it has been written.
// Once every concept is mastered it offers the mock exam instead, and nowhere
// before: until the map is done there is a frontier to work, and the exam would
// test unlearned ground.

import { pressable } from "@/components/ui/Button";
import { plateStyle } from "@/components/ui/Plate";
import { CompassRose, WaxSeal } from "@/components/ui/Ornaments";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    done: "Map complete",
    line: "Test the whole map with a mock exam",
    cta: "Start →",
    feedKicker: (ink: number) => `Frontier feed · ${ink} ink`,
    feedLine: "Bet your ink on what the next readings ask",
    feedCta: "Deal →",
  },
  "pt-BR": {
    done: "Mapa concluído",
    line: "Teste o mapa inteiro com um simulado",
    cta: "Começar →",
    feedKicker: (ink: number) => `Feed da fronteira · ${ink} de tinta`,
    feedLine: "Aposte sua tinta no que as próximas leituras perguntam",
    feedCta: "Distribuir →",
  },
} as const;

export default function MapInvite({
  feedInk,
  onOpen,
  insetLeft,
  insetRight,
}: {
  /** The map's ink when this plate offers the feed; absent for the exam. */
  feedInk?: number;
  onOpen: () => void;
  /** The rails over the canvas, so the seal centres on the chart itself. */
  insetLeft: number;
  insetRight: number;
}) {
  const t = useT(STRINGS);
  const feed = feedInk !== undefined;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 22,
        left: insetLeft + 16,
        right: insetRight + 16,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 14,
      }}
    >
      <div
        className="at-lift"
        data-testid={feed ? "action-feed-open" : "action-exam-open"}
        {...pressable(onOpen)}
        style={{
          ...plateStyle,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "11px 18px 11px 14px",
          cursor: "pointer",
          boxShadow: "0 6px 22px rgba(43,33,24,0.14)",
          maxWidth: "100%",
        }}
      >
        {feed ? <CompassRose size={30} /> : <WaxSeal size={30} />}
        <div style={{ minWidth: 0 }}>
          <div style={kicker(9.5, "0.12em", color.gilt)}>
            {feed ? t.feedKicker(feedInk) : t.done}
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 15.5, color: color.ink }}>
            {feed ? t.feedLine : t.line}
          </div>
        </div>
        <span
          style={{
            fontFamily: font.caps,
            fontSize: 14,
            color: color.gilt,
            whiteSpace: "nowrap",
          }}
        >
          {feed ? t.feedCta : t.cta}
        </span>
      </div>
    </div>
  );
}
