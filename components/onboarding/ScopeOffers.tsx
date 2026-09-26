"use client";

// A topic too broad for one map (#30) comes back as 2-3 scoped offers. Pick
// one to build it alone — or take all of them as a continent: the first is
// built now, and the rest wait on the continent as uncharted land.

import type { ScopeOffer } from "@/lib/api";
import { color, font } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    scopeIntro: (topic: string) =>
      `"${topic}" is a continent, not a map. Pick a scoped territory to start with:`,
    chartAll: "Chart the whole continent →",
    chartAllNote:
      "Build the first territory now; the rest wait on the continent, ready to chart.",
  },
  "pt-BR": {
    scopeIntro: (topic: string) =>
      `"${topic}" é um continente, não um mapa. Escolha um território mais específico para começar:`,
    chartAll: "Mapear o continente inteiro →",
    chartAllNote:
      "Construa o primeiro território agora; os outros esperam no continente, prontos para mapear.",
  },
} as const;

const offer = {
  textAlign: "left",
  padding: "12px 15px",
  borderRadius: 3,
  cursor: "pointer",
} as const;

function Offer({
  label,
  note,
  ink,
  ...button
}: { label: string; note: string; ink: string } & React.ComponentProps<"button">) {
  return (
    <button className="at-press" {...button}>
      <div style={{ fontFamily: font.serif, fontSize: 16.5, color: ink }}>{label}</div>
      <div style={{ fontSize: 13, color: color.inkSoft, marginTop: 3 }}>{note}</div>
    </button>
  );
}

export default function ScopeOffers({
  topic,
  scopes,
  onPick,
  onChartAll,
}: {
  topic: string;
  scopes: ScopeOffer[];
  onPick: (label: string) => void;
  onChartAll: () => void;
}) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        background: color.amberBg,
        border: "1px solid rgba(160,106,48,0.25)",
        borderRadius: 3,
        padding: "18px 20px",
        marginBottom: 32,
        animation: "fadeUp 0.3s both",
      }}
    >
      <div style={{ fontSize: 14.5, color: color.amberInk, marginBottom: 14 }}>
        {t.scopeIntro(topic)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {scopes.map((scope) => (
          <Offer
            key={scope.label}
            label={`${scope.label} →`}
            note={scope.note}
            ink={color.ink}
            onClick={() => onPick(scope.label)}
            style={{
              ...offer,
              background: color.card,
              border: `1px solid ${color.hairlineStrong}`,
            }}
          />
        ))}
        <Offer
          data-testid="action-chart-continent"
          label={t.chartAll}
          note={t.chartAllNote}
          ink={color.amberInk}
          onClick={onChartAll}
          style={{ ...offer, background: "none", border: `1px dashed ${color.amberInk}` }}
        />
      </div>
    </div>
  );
}
