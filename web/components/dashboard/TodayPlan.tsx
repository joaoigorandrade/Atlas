"use client";

// Today, across every map (W4.6): what each map asks of today — the cards due,
// then the next open rung — ranked by what is due and how close its date is,
// and cut at the learner's daily minutes. Each row opens its map.

import { phaseLabel } from "@/lib/curriculum";
import type { DayItem } from "@/lib/dailyPlan";
import { useT } from "@/lib/i18n";
import { color, font, kicker } from "@/lib/theme";
import { pressable } from "@/components/ui/Button";

const STRINGS = {
  en: {
    title: "Today, across your maps",
    cards: (n: number) => (n === 1 ? "1 card due" : `${n} cards due`),
    then: (phase: string, label: string) => `${phase} on ${label}`,
    daysTo: (n: number) => (n === 1 ? "1 day to your date" : `${n} days to your date`),
    minutes: (n: number) => `~${n} min`,
  },
  "pt-BR": {
    title: "Hoje, em todos os seus mapas",
    cards: (n: number) => (n === 1 ? "1 cartão vencido" : `${n} cartões vencidos`),
    then: (phase: string, label: string) => `${phase} em ${label}`,
    daysTo: (n: number) => (n === 1 ? "1 dia até sua data" : `${n} dias até sua data`),
    minutes: (n: number) => `~${n} min`,
  },
} as const;

export function TodayPlan({
  items,
  onOpen,
}: {
  items: readonly DayItem[];
  onOpen: (subject: string) => void;
}) {
  const t = useT(STRINGS);
  return (
    <div data-testid="today-plan" style={{ marginBottom: 44 }}>
      <div style={{ ...kicker(10.5, "0.12em"), color: color.accent, marginBottom: 12 }}>
        {t.title}
      </div>
      {items.map((i) => (
        <div
          key={i.subject}
          className="at-tint"
          {...pressable(() => onOpen(i.subject))}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 14,
            padding: "12px 4px",
            borderBottom: `1px solid ${color.hairline}`,
            cursor: "pointer",
          }}
        >
          <span style={{ fontFamily: font.serif, fontSize: 18, flex: "0 0 auto" }}>
            {i.subject}
          </span>
          <span style={{ fontSize: 13.5, color: color.inkMuted, flex: 1 }}>
            {[
              i.due > 0 ? t.cards(i.due) : null,
              i.next ? t.then(phaseLabel(i.next.phase), i.next.label) : null,
              i.daysLeft !== null ? t.daysTo(i.daysLeft) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span style={{ fontFamily: font.caps, fontSize: 12, color: color.inkFaint }}>
            {t.minutes(i.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}
