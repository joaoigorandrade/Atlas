"use client";

import {
  STATE_COLOR,
  goalOrderCaption,
  stateLabel,
  type GoalKind,
  type NodeState,
  type PaceStatus,
  type PlanEntry,
} from "@/lib/curriculum";
import { color, font, kicker, transition } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import { useCountUp } from "@/lib/motion";

const STRINGS = {
  en: {
    subject: "Subject",
    finalExam: (days: number) => `Final exam · ${days} days`,
    onPace: (neededPerDay: number, remaining: number) =>
      `On pace — ~${neededPerDay} min/day covers the ${remaining} concepts left.`,
    behindPace: (neededPerDay: number, targetPerDay: number) =>
      `Behind pace — the map needs ~${neededPerDay} min/day; your target is ${targetPerDay}. Skip what you already know.`,
    nextUp: "Next up",
    territoryMastered: "Territory mastered",
    jumpToFrontier: "Jump to frontier",
    calibration: "Calibration",
    over: (n: number) => `${n} over`,
    states: "States",
    stopReplay: "Stop replay",
    momentumReplay: "Momentum replay",
    placementDiagnostic: "Placement diagnostic",
    week: (n: number) => `Week ${n} of 3`,
    watchLightUp: " — watch it light up",
  },
  "pt-BR": {
    subject: "Assunto",
    finalExam: (days: number) => `Prova final · ${days} dias`,
    onPace: (neededPerDay: number, remaining: number) =>
      `No ritmo — ~${neededPerDay} min/dia cobre os ${remaining} conceitos restantes.`,
    behindPace: (neededPerDay: number, targetPerDay: number) =>
      `Atrás do ritmo — o mapa precisa de ~${neededPerDay} min/dia; sua meta é ${targetPerDay}. Pule o que você já sabe.`,
    nextUp: "A seguir",
    territoryMastered: "Território dominado",
    jumpToFrontier: "Ir para a fronteira",
    calibration: "Calibração",
    over: (n: number) => `${n} acima`,
    states: "Estados",
    stopReplay: "Parar replay",
    momentumReplay: "Replay do progresso",
    placementDiagnostic: "Diagnóstico de nivelamento",
    week: (n: number) => `Semana ${n} de 3`,
    watchLightUp: " — veja o mapa se acender",
  },
} as const;

const LEGEND_ORDER: NodeState[] = [
  "frontier",
  "learning",
  "shaky",
  "mastered",
  "gap",
  "unknown",
];

interface LeftRailProps {
  subject: string;
  goal: GoalKind;
  /** Pace against the deadline — null when the goal has no deadline. */
  pace: PaceStatus | null;
  /** Goal-ordered frontier: the plan's next moves. */
  nextUp: PlanEntry[];
  masteryPct: number;
  /** How many nodes read overconfident — the Calibration alert count. */
  calibOver: number;
  momentumPlaying: boolean;
  momentumWeek: number;
  onJumpFrontier: () => void;
  onCalibration: () => void;
  onToggleMomentum: () => void;
  onPickNode: (id: string) => void;
}

export default function LeftRail({
  subject,
  goal,
  pace,
  nextUp,
  masteryPct,
  calibOver,
  momentumPlaying,
  momentumWeek,
  onJumpFrontier,
  onCalibration,
  onToggleMomentum,
  onPickNode,
}: LeftRailProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  // The bar was already easing its width while the number beside it jumped.
  // One value drives both now — and it snaps on the first read, so a restored
  // run doesn't count up from zero every time the map opens.
  const shownPct = useCountUp(masteryPct);
  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        bottom: 0,
        left: 0,
        width: 262,
        background: "rgba(248,246,240,0.94)",
        borderRight: `1px solid ${color.hairline}`,
        padding: "26px 22px",
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        overflowY: "auto",
      }}
    >
      <div>
        <div style={{ ...kicker(10), marginBottom: 8 }}>{t.subject}</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, lineHeight: 1.1 }}>
          {subject}
        </div>
        {pace && (
          <div
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              color: color.amberInk,
              background: color.amberBg,
              border: "1px solid rgba(160,106,48,0.24)",
              borderRadius: 7,
              padding: "4px 9px",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#c99a2e",
              }}
            />
            {t.finalExam(pace.daysLeft)}
          </div>
        )}
        {pace && (
          <div
            style={{
              marginTop: 9,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: pace.onTrack ? color.accent : color.amberInk,
            }}
          >
            {pace.onTrack
              ? t.onPace(pace.neededPerDay, pace.remaining)
              : t.behindPace(pace.neededPerDay, pace.targetPerDay)}
          </div>
        )}
      </div>

      {nextUp.length > 0 && (
        <div>
          <div style={{ ...kicker(10), marginBottom: 5 }}>{t.nextUp}</div>
          <div
            style={{
              fontSize: 11.5,
              color: color.inkGhost,
              marginBottom: 10,
            }}
          >
            {goalOrderCaption(goal, language)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {nextUp.map(({ node, unlocks }) => (
              <button
                className="at-press"
                key={node.id}
                onClick={() => onPickNode(node.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 11px",
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 9,
                  fontSize: 13.5,
                  color: color.ink,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATE_COLOR.frontier,
                    boxShadow: `0 0 6px ${STATE_COLOR.frontier}`,
                    flex: "0 0 auto",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: font.serif,
                  }}
                >
                  {node.label}
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.inkFaint,
                    flex: "0 0 auto",
                  }}
                >
                  +{unlocks}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, color: color.inkMuted }}>
            {t.territoryMastered}
          </span>
          <span
            style={{ fontFamily: font.serif, fontSize: 22, color: color.accent }}
          >
            {/* Travels with the bar beside it rather than snapping ahead of it. */}
            {Math.round(shownPct)}%
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 5,
            background: "rgba(44,40,35,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${shownPct}%`,
              height: "100%",
              background: color.accent,
              borderRadius: 5,
              transition: transition("width", "deliberate", "enter"),
            }}
          />
        </div>
      </div>

      <button
        className="at-press"
        onClick={onJumpFrontier}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 15px",
          background: color.card,
          border: "1px solid rgba(44,40,35,0.16)",
          borderRadius: 11,
          fontSize: 14,
          color: color.ink,
          cursor: "pointer",
        }}
      >
        <span>{t.jumpToFrontier}</span>
        <span style={{ color: "#c99a2e" }}>→</span>
      </button>

      <button
        className="at-press"
        onClick={onCalibration}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 15px",
          background: color.card,
          border: "1px solid rgba(44,40,35,0.16)",
          borderRadius: 11,
          fontSize: 14,
          color: color.ink,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATE_COLOR.shaky,
            }}
          />
          {t.calibration}
        </span>
        {calibOver > 0 ? (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              color: STATE_COLOR.shaky,
              border: `1px solid ${STATE_COLOR.shaky}66`,
              borderRadius: 6,
              padding: "2px 7px",
            }}
          >
            {t.over(calibOver)}
          </span>
        ) : (
          <span style={{ color: color.inkGhost }}>→</span>
        )}
      </button>

      <div>
        <div style={{ ...kicker(10), marginBottom: 12 }}>{t.states}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {LEGEND_ORDER.map((state) => (
            <div
              key={state}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                color: color.inkSoft,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: STATE_COLOR[state],
                  flex: "0 0 auto",
                  boxShadow:
                    state === "frontier"
                      ? `0 0 7px ${STATE_COLOR[state]}`
                      : "none",
                }}
              />
              {stateLabel(state, language).replace(" · ready", "").replace(" · pronto", "")}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "auto" }}>
        <button
          className="at-press"
          onClick={onToggleMomentum}
          style={{
            width: "100%",
            padding: "12px 15px",
            borderRadius: 11,
            fontSize: 14,
            cursor: "pointer",
            background: momentumPlaying ? color.accent : color.card,
            color: momentumPlaying ? color.accentInk : color.ink,
            border: `1px solid ${
              momentumPlaying ? color.accent : "rgba(44,40,35,0.16)"
            }`,
          }}
        >
          {momentumPlaying ? t.stopReplay : t.momentumReplay}
        </button>
        {momentumPlaying && (
          <div
            style={{
              marginTop: 10,
              fontFamily: font.mono,
              fontSize: 11,
              color: color.inkFaint,
              textAlign: "center",
            }}
          >
            {momentumWeek === 0
              ? t.placementDiagnostic
              : t.week(momentumWeek)}
            {t.watchLightUp}
          </div>
        )}
      </div>
    </div>
  );
}
