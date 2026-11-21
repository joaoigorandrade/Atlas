"use client";

// The finished map's invitation: once every concept is mastered, a seal at the
// foot of the chart offers the mock exam. It appears nowhere else — before the
// map is done there is a frontier to work, and the exam would test unlearned
// ground.

import { pressable } from "@/components/ui/Button";
import { plateStyle } from "@/components/ui/Plate";
import { WaxSeal } from "@/components/ui/Ornaments";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    done: "Map complete",
    line: "Test the whole map with a mock exam",
    cta: "Start →",
  },
  "pt-BR": {
    done: "Mapa concluído",
    line: "Teste o mapa inteiro com um simulado",
    cta: "Começar →",
  },
} as const;

export default function ExamInvite({
  onOpen,
  insetLeft,
  insetRight,
}: {
  onOpen: () => void;
  /** The rails over the canvas, so the seal centres on the chart itself. */
  insetLeft: number;
  insetRight: number;
}) {
  const t = useT(STRINGS);
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
        data-testid="action-exam-open"
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
        <WaxSeal size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={kicker(9.5, "0.12em", color.gilt)}>{t.done}</div>
          <div style={{ fontFamily: font.serif, fontSize: 15.5, color: color.ink }}>
            {t.line}
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
          {t.cta}
        </span>
      </div>
    </div>
  );
}
