"use client";

// The papers already sat on this map: a bar per paper, oldest to newest, with
// the pass line dashed across, and the last few listed beneath. Read on the
// setup page, where the learner decides how hard the next one should be.

import { EXAM_PASS_PCT, STATE_COLOR, type ExamAttempt } from "@/lib/curriculum";
import Plate from "@/components/ui/Plate";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    title: "Your papers on this map",
    best: (pct: number) => `Best ${pct}%`,
    last: (pct: number) => `Last ${pct}%`,
    levels: { easy: "Easy", medium: "Medium", hard: "Hard" },
    row: (n: number, level: string) => `${n} questions · ${level}`,
    pass: (pct: number) => `pass ${pct}%`,
  },
  "pt-BR": {
    title: "Suas provas neste mapa",
    best: (pct: number) => `Melhor ${pct}%`,
    last: (pct: number) => `Última ${pct}%`,
    levels: { easy: "Fácil", medium: "Média", hard: "Difícil" },
    row: (n: number, level: string) => `${n} questões · ${level}`,
    pass: (pct: number) => `aprovação ${pct}%`,
  },
} as const;

/** How many of the latest papers are listed by name under the chart. */
const LISTED = 4;
const CHART_H = 64;

const inkFor = (pct: number) =>
  pct >= EXAM_PASS_PCT ? STATE_COLOR.mastered : STATE_COLOR.shaky;

export default function ExamHistory({ attempts }: { attempts: readonly ExamAttempt[] }) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  if (attempts.length === 0) return null;
  const best = Math.max(...attempts.map((a) => a.pct));
  const last = attempts[attempts.length - 1];
  const date = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" });

  return (
    <Plate data-testid="exam-history" style={{ padding: "20px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span style={kicker(10, "0.12em")}>{t.title}</span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkMuted }}>
          {t.best(best)} · {t.last(last.pct)} · {t.pass(EXAM_PASS_PCT)}
        </span>
      </div>

      <div
        role="img"
        aria-label={attempts.map((a) => `${a.pct}%`).join(", ")}
        style={{
          position: "relative",
          height: CHART_H,
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          borderBottom: `1px solid ${color.hairlineStrong}`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: (CHART_H * EXAM_PASS_PCT) / 100,
            borderTop: `1px dashed ${color.hairlineStrong}`,
          }}
        />
        {attempts.map((a) => (
          <div
            key={a.id}
            style={{
              flex: 1,
              maxWidth: 28,
              height: Math.max(2, (CHART_H * a.pct) / 100),
              background: inkFor(a.pct),
              opacity: a === last ? 1 : 0.55,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {attempts
          .slice(-LISTED)
          .reverse()
          .map((a) => (
            <div
              key={a.id}
              style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 14 }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: color.inkFaint,
                  minWidth: 52,
                }}
              >
                {date.format(new Date(a.at))}
              </span>
              <span style={{ flex: 1, color: color.inkSoft }}>
                {t.row(a.total, t.levels[a.difficulty])}
              </span>
              <span
                style={{ fontFamily: font.mono, fontSize: 12.5, color: inkFor(a.pct) }}
              >
                {a.pct}%
              </span>
            </div>
          ))}
      </div>
    </Plate>
  );
}
