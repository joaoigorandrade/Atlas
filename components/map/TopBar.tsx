"use client";

import type { AdherenceState, DailyQueue } from "@/lib/curriculum";
import { color, font } from "@/lib/theme";
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

export default function TopBar({
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
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 58,
        background: "rgba(248,246,240,0.88)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${color.hairline}`,
        display: "flex",
        alignItems: "center",
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
            fontFamily: font.serif,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            cursor: "pointer",
          }}
        >
          {/* The wordmark's compass point — the same rose the map frames with. */}
          <svg width={18} height={18} viewBox="-10 -10 20 20" aria-hidden>
            <circle r={9} fill="none" stroke={color.ink} strokeWidth={1.1} />
            <path d="M0,-7.5 L2.2,0 L0,7.5 L-2.2,0 Z" fill={color.ink} />
            <path d="M0,-7.5 L2.2,0 L-2.2,0 Z" fill={color.accent} />
          </svg>
          Atlas
        </div>
      </HoverHint>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: color.chipBg,
          border: "1px solid rgba(44,40,35,0.09)",
          borderRadius: 10,
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
                padding: "6px 15px",
                borderRadius: 8,
                border: "none",
                fontSize: 13.5,
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
                background: active ? color.card : "transparent",
                color: active ? color.ink : color.inkFaint,
                boxShadow: active ? "0 1px 3px rgba(44,40,35,0.1)" : "none",
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
          borderRadius: 9,
          padding: "8px 12px",
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
            fontSize: 14,
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
            border: "1px solid rgba(47,107,79,0.22)",
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
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {(userEmail[0] ?? "A").toUpperCase()}
        </button>
      </HoverHint>
    </div>
  );
}
