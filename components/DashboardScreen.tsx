"use client";

import { useState } from "react";
import { STATE_COLOR, type DailyQueue } from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    dayStreak: "day streak",
    profile: "Profile",
    frontierIntro: (n: number) =>
      `You're on the frontier of ${n} concept${n === 1 ? "" : "s"}. Pick up where you left off.`,
    fullyMastered: "Your map is fully mastered. Keep the memories fresh with review.",
    todaysReview: "Today’s review",
    queueClear: "Queue clear ✓",
    cardsDue: (n: number) => `${n} card${n === 1 ? "" : "s"} due`,
    nothingDueYet: "Nothing due yet",
    metTodayBody: "You've met today's target. New cards surface as memories start to fade.",
    cardsDueBody: (min: number) =>
      `~${min} min · timed to the moment these memories are about to fade.`,
    nothingDueBody: "Learn a concept to the end and it starts feeding the review queue.",
    startReview: "Start review →",
    yourFrontier: "Your frontier",
    allCaughtUp: "All caught up",
    frontierBody: (subject: string) =>
      `The next concept you're ready to learn in ${subject}.`,
    frontierDoneBody: (subject: string) => `Every concept in ${subject} is under way.`,
    openMap: "Open the map →",
    yourMaps: "Your maps",
    newMap: "+ New map",
    complete: "Complete",
    inProgress: "In progress",
    justStarted: "Just started",
    masteredPct: (pct: number) => `${pct}% mastered`,
    onFrontier: (n: number) => `${n} on frontier`,
    exclude: "Exclude this topic",
    excludeKicker: "Exclude topic",
    excludeAsk: (subject: string) => `Exclude “${subject}”?`,
    excludeBody:
      "The map, its mastery states, its cards and everything generated for it are deleted. Your streak stays. This can't be undone.",
    excludeConfirm: "Exclude",
    excludeCancel: "Keep it",
  },
  "pt-BR": {
    dayStreak: "dias de sequência",
    profile: "Perfil",
    frontierIntro: (n: number) =>
      `Você está na fronteira de ${n} conceito${n === 1 ? "" : "s"}. Continue de onde parou.`,
    fullyMastered: "Seu mapa está totalmente dominado. Mantenha as memórias frescas com revisão.",
    todaysReview: "Revisão de hoje",
    queueClear: "Fila limpa ✓",
    cardsDue: (n: number) => `${n} cartã${n === 1 ? "o" : "os"} pendente${n === 1 ? "" : "s"}`,
    nothingDueYet: "Nada pendente ainda",
    metTodayBody: "Você cumpriu a meta de hoje. Novos cartões surgem à medida que as memórias começam a desvanecer.",
    cardsDueBody: (min: number) =>
      `~${min} min · no momento exato em que essas memórias estão prestes a desvanecer.`,
    nothingDueBody: "Aprenda um conceito até o fim e ele passa a alimentar a fila de revisão.",
    startReview: "Iniciar revisão →",
    yourFrontier: "Sua fronteira",
    allCaughtUp: "Tudo em dia",
    frontierBody: (subject: string) =>
      `O próximo conceito que você está pronto para aprender em ${subject}.`,
    frontierDoneBody: (subject: string) => `Todo conceito em ${subject} está em andamento.`,
    openMap: "Abrir o mapa →",
    yourMaps: "Seus mapas",
    newMap: "+ Novo mapa",
    complete: "Completo",
    inProgress: "Em andamento",
    justStarted: "Recém-iniciado",
    masteredPct: (pct: number) => `${pct}% dominado`,
    onFrontier: (n: number) => `${n} na fronteira`,
    exclude: "Excluir este tópico",
    excludeKicker: "Excluir tópico",
    excludeAsk: (subject: string) => `Excluir “${subject}”?`,
    excludeBody:
      "O mapa, seus estados de domínio, seus cartões e tudo que foi gerado para ele são apagados. Sua sequência permanece. Não dá para desfazer.",
    excludeConfirm: "Excluir",
    excludeCancel: "Manter",
  },
} as const;

/** One card's worth of a saved map — the "Your maps" grid. */
export interface MapCardSummary {
  subject: string;
  goalLabel: string;
  masteryPct: number;
  frontierTotal: number;
}

interface DashboardScreenProps {
  /** Time-of-day greeting ("Good morning") and the friendly display name. */
  greeting: string;
  name: string;
  /** Monospace date kicker at the top of the page. */
  dateLabel: string;
  /** Avatar initials for the profile button. */
  initials: string;
  /** Current adherence streak in days — honest, never fabricated. */
  streak: number;
  /** The honest review queue: minutes budget + cards due now. */
  queue: DailyQueue;
  /** True once today's target is met — the queue reads clear. */
  metToday: boolean;
  /** The subject of the current run (map title). */
  subject: string;
  /** Which map (by subject) is the live one — highlights its card and skips
   *  the reload when its own card is opened. */
  activeSubject: string;
  /** The top frontier concept, or null when nothing is on the frontier yet. */
  frontierConcept: string | null;
  /** How many concepts sit on the frontier right now. */
  frontierTotal: number;
  /** Every saved map, active one included — the "Your maps" grid. */
  maps: MapCardSummary[];
  /** Opens the live map — the "Your frontier" hero card only ever means that one. */
  onOpenMap: () => void;
  /** Opens (or switches to) the given map from the grid. */
  onSelectMap: (subject: string) => void;
  onReview: () => void;
  onProfile: () => void;
  onNewMap: () => void;
  /** Drop the given topic's run for good — confirmed here before it fires. */
  onExcludeTopic: (subject: string) => void;
  /** True while a delete is in flight; the confirm buttons go inert. */
  excluding: boolean;
}

const headerStyle = {
  flex: "0 0 auto",
  height: 58,
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 24px",
  background: "rgba(248,246,240,0.9)",
  backdropFilter: "blur(8px)",
  borderBottom: `1px solid ${color.hairline}`,
} as const;

const cardBase = {
  background: color.card,
  borderRadius: 16,
  padding: "24px 26px",
  cursor: "pointer",
  transition: "transform .12s, box-shadow .12s",
} as const;

/** The quiet "×" that opens the exclude confirmation on a map card. */
const excludeButtonStyle = {
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  borderRadius: 6,
  background: "none",
  border: "none",
  color: color.inkGhost,
  fontFamily: font.sans,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
} as const;

const confirmButtonBase = {
  padding: "7px 13px",
  borderRadius: 8,
  fontFamily: font.sans,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
} as const;

export default function DashboardScreen({
  greeting,
  name,
  dateLabel,
  initials,
  streak,
  queue,
  metToday,
  subject,
  activeSubject,
  frontierConcept,
  frontierTotal,
  maps,
  onOpenMap,
  onSelectMap,
  onReview,
  onProfile,
  onNewMap,
  onExcludeTopic,
  excluding,
}: DashboardScreenProps) {
  const t = useT(STRINGS);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color.paper,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={headerStyle}>
        <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600 }}>
          Atlas
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            color: color.inkMuted,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#c99a2e",
              boxShadow: "0 0 8px rgba(201,154,46,0.6)",
            }}
          />
          <span style={{ fontWeight: 600, color: color.ink }}>{streak}</span>{" "}
          {t.dayStreak}
        </div>
        <button
          onClick={onProfile}
          title={t.profile}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: color.ink,
            color: "#f7f5ef",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.mono,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {initials}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "44px 40px 80px",
            animation: "fadeUp .5s both",
          }}
        >
          <div style={{ ...kicker(11), marginBottom: 10 }}>{dateLabel}</div>
          <h1
            style={{
              fontFamily: font.serif,
              fontWeight: 500,
              fontSize: 38,
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
              margin: "0 0 6px",
            }}
          >
            {greeting}, {name}
          </h1>
          <div
            style={{
              fontSize: 15,
              color: color.inkMuted,
              marginBottom: 36,
            }}
          >
            {frontierTotal > 0
              ? t.frontierIntro(frontierTotal)
              : t.fullyMastered}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 44,
            }}
          >
            <div
              onClick={onReview}
              style={{
                ...cardBase,
                border: "1px solid rgba(47,107,79,0.22)",
                boxShadow: "0 4px 16px rgba(47,107,79,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  ...kicker(10.5, "0.12em"),
                  color: color.accent,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: color.accent,
                  }}
                />
                {t.todaysReview}
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 28,
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                {metToday
                  ? t.queueClear
                  : queue.cards > 0
                    ? t.cardsDue(queue.cards)
                    : t.nothingDueYet}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {metToday
                  ? t.metTodayBody
                  : queue.cards > 0
                    ? t.cardsDueBody(queue.minutes)
                    : t.nothingDueBody}
              </div>
              <div
                style={{ fontSize: 13.5, color: color.accent, fontWeight: 600 }}
              >
                {t.startReview}
              </div>
            </div>

            <div
              onClick={onOpenMap}
              style={{
                ...cardBase,
                border: "1px solid rgba(201,154,46,0.28)",
                boxShadow: "0 4px 16px rgba(201,154,46,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  ...kicker(10.5, "0.12em"),
                  color: color.amberInk,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#c99a2e",
                    boxShadow: "0 0 8px rgba(201,154,46,0.6)",
                  }}
                />
                {t.yourFrontier}
              </div>
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 28,
                  lineHeight: 1.1,
                  marginBottom: 6,
                }}
              >
                {frontierConcept ?? t.allCaughtUp}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.inkMuted,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {frontierConcept
                  ? t.frontierBody(subject)
                  : t.frontierDoneBody(subject)}
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: color.amberInk,
                  fontWeight: 600,
                }}
              >
                {t.openMap}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: font.serif, fontSize: 22 }}>{t.yourMaps}</div>
            <button
              onClick={onNewMap}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 13.5,
                fontFamily: font.sans,
                color: color.accent,
                cursor: "pointer",
              }}
            >
              {t.newMap}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 16,
            }}
          >
            {maps.map((m) => (
              <MapCard
                key={m.subject}
                map={m}
                active={m.subject === activeSubject}
                onOpen={() => onSelectMap(m.subject)}
                onExclude={() => onExcludeTopic(m.subject)}
                excluding={excluding}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapCard({
  map,
  active,
  onOpen,
  onExclude,
  excluding,
  t,
}: {
  map: MapCardSummary;
  active: boolean;
  onOpen: () => void;
  onExclude: () => void;
  excluding: boolean;
  t: (typeof STRINGS)["en"];
}) {
  // Purely local: whether this card is asking "are you sure?". Nothing
  // outside this card ever reads it, so it stays out of AtlasApp's state
  // machine.
  const [confirming, setConfirming] = useState(false);
  const mapStatus =
    map.masteryPct >= 100
      ? t.complete
      : map.masteryPct > 0
        ? t.inProgress
        : t.justStarted;

  return (
    <div
      onClick={confirming ? undefined : onOpen}
      style={{
        background: color.card,
        border: `1px solid ${
          confirming
            ? "rgba(193,87,74,0.45)"
            : active
              ? "rgba(201,154,46,0.35)"
              : color.hairlineStrong
        }`,
        borderRadius: 16,
        padding: "22px 22px 20px",
        cursor: confirming ? "default" : "pointer",
        transition: "transform .12s, box-shadow .12s",
      }}
    >
      {confirming ? (
        <div style={{ animation: "softIn .18s both" }}>
          <div
            style={{
              ...kicker(10, "0.1em"),
              color: STATE_COLOR.gap,
              marginBottom: 12,
            }}
          >
            {t.excludeKicker}
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 19,
              lineHeight: 1.15,
              marginBottom: 8,
            }}
          >
            {t.excludeAsk(map.subject)}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: color.inkMuted,
              lineHeight: 1.5,
              marginBottom: 16,
            }}
          >
            {t.excludeBody}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onExclude}
              disabled={excluding}
              style={{
                ...confirmButtonBase,
                color: "#fbf9f4",
                background: STATE_COLOR.gap,
                border: `1px solid ${STATE_COLOR.gap}`,
                opacity: excluding ? 0.6 : 1,
              }}
            >
              {t.excludeConfirm}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={excluding}
              style={{
                ...confirmButtonBase,
                color: color.inkMuted,
                background: "none",
                border: `1px solid ${color.hairlineStrong}`,
              }}
            >
              {t.excludeCancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span style={kicker(10, "0.1em")}>{map.goalLabel}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: color.accent,
                  background: color.accentBg,
                  border: "1px solid rgba(47,107,79,0.2)",
                  borderRadius: 20,
                  padding: "3px 9px",
                }}
              >
                {mapStatus}
              </span>
              <button
                onClick={(e) => {
                  // The card itself opens the map — the × must not.
                  e.stopPropagation();
                  setConfirming(true);
                }}
                title={t.exclude}
                aria-label={t.exclude}
                style={excludeButtonStyle}
              >
                ×
              </button>
            </span>
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 20,
              lineHeight: 1.15,
              marginBottom: 18,
              minHeight: 46,
            }}
          >
            {map.subject}
          </div>
          <div
            style={{
              height: 6,
              background: "#efe9df",
              borderRadius: 5,
              overflow: "hidden",
              marginBottom: 9,
            }}
          >
            <div
              style={{
                width: `${map.masteryPct}%`,
                height: "100%",
                background: color.accent,
                borderRadius: 5,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              color: color.inkFaint,
            }}
          >
            <span>{t.masteredPct(map.masteryPct)}</span>
            <span>{t.onFrontier(map.frontierTotal)}</span>
          </div>
        </>
      )}
    </div>
  );
}
