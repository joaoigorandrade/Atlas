"use client";

import type { AdherenceState, DailyQueue } from "@/lib/curriculum";
import { memo } from "react";
import { color, font } from "@/lib/theme";
import { mastheadBar } from "@/components/ui/Masthead";
import { CompassRose } from "@/components/ui/Ornaments";
import StreakFlame from "@/components/map/StreakFlame";
import HoverHint from "@/components/HoverHint";
import { useT } from "@/lib/i18n";

export type Surface = "map" | "session" | "review";

const STRINGS = {
  en: {
    surfaces: { map: "Map", session: "Session", review: "Review" },
    searchPlaceholder: "Search concepts…",
    queueClear: "Today's queue is clear",
    queueDue: (cards: number) =>
      `${cards} cards due now — framed in minutes, not a card wall`,
    reviewClear: "Review · clear ✓",
    reviewWaiting: (cards: number) => `Review · budget spent, ${cards} waiting`,
    queueWaiting: (cards: number) =>
      `Today's budget is spent — ${cards} card${cards === 1 ? "" : "s"} still due`,
    reviewMinutes: (min: number) => `Review · ~${min} min`,
    profileWith: (email: string) => `Profile · ${email}`,
    profile: "Profile",
    homeHint: "Back to the dashboard — every subject you have a map for.",
  },
  "pt-BR": {
    surfaces: { map: "Mapa", session: "Sessão", review: "Revisão" },
    searchPlaceholder: "Buscar conceitos…",
    queueClear: "A fila de hoje está limpa",
    queueDue: (cards: number) =>
      `${cards} cartões vencidos agora — em minutos, não um mural de cartões`,
    reviewClear: "Revisão · limpa ✓",
    reviewWaiting: (cards: number) => `Revisão · meta cumprida, ${cards} esperando`,
    queueWaiting: (cards: number) =>
      `A meta de hoje foi cumprida — ainda ${cards === 1 ? "há 1 cartão vencido" : `há ${cards} cartões vencidos`}`,
    reviewMinutes: (min: number) => `Revisão · ~${min} min`,
    profileWith: (email: string) => `Perfil · ${email}`,
    profile: "Perfil",
    homeHint: "Voltar ao painel — todos os assuntos com mapa.",
  },
} as const;

const SURFACE_KEYS: Surface[] = ["map", "session", "review"];

interface TopBarProps {
  query: string;
  onQuery: (value: string) => void;
  onSurface: (surface: Surface) => void;
  /** Adherence state — drives the flame + freeze badge. */
  adherence: AdherenceState;
  /** The honest queue: minutes against the daily target, never a card wall. */
  queue: DailyQueue;
  /** Arm / disarm the right-moment reminder from the flame popover. */
  onToggleReminder: () => void;
  /** Signed-in account — the avatar shows its initial and opens the profile. */
  userEmail: string;
  /** The "Atlas" wordmark returns to the dashboard (Home). */
  onHome: () => void;
  /** The avatar opens the profile, where sign-out now lives. */
  onProfile: () => void;
}

export default memo(function TopBar({
  query,
  onQuery,
  onSurface,
  adherence,
  queue,
  onToggleReminder,
  userEmail,
  onHome,
  onProfile,
}: TopBarProps) {
  const t = useT(STRINGS);
  return (
    <div
      style={{
        ...mastheadBar,
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        padding: "0 20px 0 24px",
        gap: 18,
        zIndex: 20,
      }}
    >
      <HoverHint place="bottom" hint={t.homeHint}>
        <div
          onClick={onHome}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: font.display,
            fontSize: 23,
            cursor: "pointer",
          }}
        >
          {/* The wordmark's compass rose — the same rose the map frames with. */}
          <CompassRose size={20} />
          Atlas
        </div>
      </HoverHint>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: color.chipBg,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 3,
          padding: 3,
          marginLeft: 6,
        }}
      >
        {SURFACE_KEYS.map((key) => {
          const active = key === "map";
          return (
            <button
              className="at-press"
              key={key}
              onClick={() => onSurface(key)}
              style={{
                padding: "5px 15px",
                borderRadius: 2,
                border: "none",
                fontFamily: font.caps,
                fontSize: 15,
                letterSpacing: "0.04em",
                cursor: "pointer",
                background: active ? color.card : "transparent",
                color: active ? color.ink : color.inkFaint,
                boxShadow: active ? `inset 0 0 0 1px ${color.hairlineStrong}` : "none",
              }}
            >
              {t.surfaces[key]}
            </button>
          );
        })}
      </div>
      <div
        style={{
          flex: 1,
          maxWidth: 300,
          marginLeft: 8,
          display: "flex",
          alignItems: "center",
          gap: 9,
          background: color.card,
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 3,
          padding: "7px 12px",
        }}
      >
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
          <circle
            cx={6}
            cy={6}
            r={4.3}
            fill="none"
            stroke={color.inkFaint}
            strokeWidth={1.4}
          />
          <path
            d="M9.2 9.2 L12.6 12.6"
            stroke={color.inkFaint}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            fontFamily: font.serif,
            fontStyle: "italic",
            fontSize: 15.5,
            color: color.ink,
          }}
        />
      </div>
      <div style={{ flex: 1 }} />
      <StreakFlame adherence={adherence} onToggleReminder={onToggleReminder} />
      <HoverHint
        place="bottom"
        hint={
          // "Clear" has to mean the queue is empty, not merely that the daily
          // budget is spent: this chip used to say so with cards still due,
          // while the review screen's own chip said the opposite.
          !queue.cards
            ? t.queueClear
            : adherence.metToday
              ? t.queueWaiting(queue.cards)
              : t.queueDue(queue.cards)
        }
      >
        <button
          className="at-press"
          onClick={() => onSurface("review")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: color.accentBg,
            border: "1px solid rgba(58,106,85,0.22)",
            borderRadius: 20,
            padding: "6px 13px",
            fontSize: 13,
            color: color.accent,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: color.accent,
            }}
          />
          {!queue.cards
            ? t.reviewClear
            : adherence.metToday
              ? t.reviewWaiting(queue.cards)
              : t.reviewMinutes(queue.minutes)}
        </button>
      </HoverHint>
      <HoverHint place="bottom" hint={userEmail ? t.profileWith(userEmail) : t.profile}>
        <button
          className="at-press"
          onClick={onProfile}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: color.ink,
            color: color.accentInk,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.display,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: `0 0 0 2px ${color.card}, 0 0 0 3px ${color.ink}`,
          }}
        >
          {(userEmail[0] ?? "A").toUpperCase()}
        </button>
      </HoverHint>
    </div>
  );
});
