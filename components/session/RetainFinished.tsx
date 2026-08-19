"use client";

// The done-for-today surface, its own file so `RetainView` stays under its
// size ceiling. Rendered by `RetainView` when the queue empties.

import {
  STATE_COLOR,
  STREAK_COLOR,
  reminderCopy,
  type AdherenceState,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import { STRINGS } from "@/components/session/retainCopy";

/** The done-for-today surface: short, winnable, ending on a lit node — and the
 *  streak ticking forward, so the last thing the learner sees is a good feeling. */
export default function Finished({
  litNodes,
  adherence,
  litToday,
  onToggleReminder,
  onExit,
}: {
  litNodes: number;
  adherence: AdherenceState;
  litToday: string[];
  onToggleReminder: () => void;
  onExit: () => void;
}) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  return (
    <div
      style={{
        background: color.card,
        border: "1px solid rgba(76,139,99,0.3)",
        borderRadius: 18,
        padding: "40px 40px 32px",
        textAlign: "center",
        animation: "fadeUp .4s both",
      }}
    >
      <div style={{ ...kicker(11), color: color.accent, marginBottom: 14 }}>
        {t.doneForToday}
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontWeight: 500,
          fontSize: 32,
          lineHeight: 1.15,
          marginBottom: 12,
        }}
      >
        {t.queueClear}
      </div>
      <div
        style={{
          fontSize: 14.5,
          color: color.inkMuted,
          lineHeight: 1.55,
          maxWidth: 440,
          margin: "0 auto 24px",
        }}
      >
        {t.finishedBody}
      </div>

      {/* What lit up — the concrete "you moved the territory" line, when a node
          reached green this run. */}
      {litToday.length > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            background: color.successBg,
            border: "1px solid rgba(76,139,99,0.32)",
            borderRadius: 10,
            padding: "9px 15px",
            margin: "0 auto 24px",
            fontSize: 13.5,
            color: color.accent,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATE_COLOR.mastered,
              boxShadow: `0 0 6px ${STATE_COLOR.mastered}`,
              flex: "0 0 auto",
            }}
          />
          {t.litUpToday(litToday.join(" · "))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <div
          style={{
            background: "rgba(201,154,46,0.1)",
            border: `1px solid ${STREAK_COLOR.flame}44`,
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              color: STREAK_COLOR.flame,
            }}
          >
            {adherence.streak}
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>{t.dayStreak}</div>
        </div>
        <div
          style={{
            background: color.accentBg,
            border: "1px solid rgba(47,107,79,0.22)",
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 26,
              color: color.accent,
            }}
          >
            +1
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>{t.todayIn}</div>
        </div>
        <div
          style={{
            background: color.cardAlt,
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 12,
            padding: "14px 22px",
          }}
        >
          <div style={{ fontFamily: font.serif, fontSize: 26, color: color.ink }}>
            {litNodes}
          </div>
          <div style={{ ...kicker(10, "0.08em"), marginTop: 2 }}>{t.nodesAlive}</div>
        </div>
      </div>

      {/* The forgiving-streak reassurance — the banked freezes, so tomorrow's
          miss never feels like ruin. */}
      {adherence.freezes > 0 && (
        <div
          style={{
            marginTop: 18,
            fontSize: 12.5,
            color: color.inkFaint,
            lineHeight: 1.5,
          }}
        >
          {t.freezesBanked(adherence.freezes)}
        </div>
      )}

      {/* Right-moment reminder — set the nudge for the learner's actual rhythm. */}
      <button
        className="at-press"
        onClick={onToggleReminder}
        style={{
          marginTop: 8,
          background: "none",
          border: "none",
          fontSize: 12.5,
          color: color.accent,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {reminderCopy(adherence, language)}
      </button>

      <div>
        <button
          className="at-press"
          onClick={onExit}
          style={{
            marginTop: 22,
            padding: "14px 26px",
            background: color.accent,
            color: color.accentInk,
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 8px 22px rgba(47,107,79,0.26)",
          }}
        >
          {t.backToMap}
        </button>
      </div>
    </div>
  );
}
