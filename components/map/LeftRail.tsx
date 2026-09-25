"use client";

import {
  STATE_COLOR,
  goalOrderCaption,
  stateConfidence,
  stateLabel,
  type GoalKind,
  type NodeState,
  type PaceStatus,
  type PlanEntry,
} from "@/lib/curriculum";
import { color, font, kicker, layout, transition } from "@/lib/theme";
import { useLanguage, useT } from "@/lib/i18n";
import { useCountUp } from "@/lib/motion";
import HoverHint from "@/components/HoverHint";
import NodeSeal from "@/components/map/NodeSeal";

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
    nextUpHint: (label: string, unlocks: number) =>
      `${label} — on your frontier. Starting it opens ${unlocks} ${
        unlocks === 1 ? "concept" : "concepts"
      } downstream.`,
    nextUpHintLeaf: (label: string) =>
      `${label} — on your frontier. Nothing is waiting on it; it stands on its own.`,
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
    nextUpHint: (label: string, unlocks: number) =>
      `${label} — na sua fronteira. Começar abre ${unlocks} ${
        unlocks === 1 ? "conceito" : "conceitos"
      } adiante.`,
    nextUpHintLeaf: (label: string) =>
      `${label} — na sua fronteira. Nada depende dele; ele se sustenta sozinho.`,
  },
} as const;

const RAIL_BUTTON = {
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
} as const;

const TERRITORY_ORDER: NodeState[] = [
  "mastered",
  "learning",
  "shaky",
  "frontier",
  "gap",
  "unknown",
];

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
  /** Display state per node — the legend counts it, the territory bar splits by it. */
  display: Record<string, NodeState>;
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
  display,
}: LeftRailProps) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  // The bar was already easing its width while the number beside it jumped.
  // One value drives both now — and it snaps on the first read, so a restored
  // run doesn't count up from zero every time the map opens.
  const shownPct = useCountUp(masteryPct);
  const states = Object.values(display);
  const count = (s: NodeState) => states.filter((d) => d === s).length;
  return (
    <div
      style={{
        position: "absolute",
        top: layout.topBar,
        bottom: 0,
        left: 0,
        width: layout.leftRail,
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
      <div
        style={{
          padding: "14px 15px 15px",
          border: `1px solid ${color.hairlineStrong}`,
          borderRadius: 4,
          // A cartouche: the title block of a printed map, double-ruled.
          boxShadow: `inset 0 0 0 3px ${color.paper}, inset 0 0 0 4px ${color.hairline}`,
          background: color.card,
        }}
      >
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
              // What "+3" means, said in words — the count alone is a number
              // nobody has been told how to read.
              <HoverHint
                key={node.id}
                block
                place="right"
                hint={
                  unlocks > 0
                    ? t.nextUpHint(node.label, unlocks)
                    : t.nextUpHintLeaf(node.label)
                }
              >
                <button
                  className="at-press"
                  onClick={() => onPickNode(node.id)}
                  style={{
                    width: "100%",
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
                  <NodeSeal node={node} state="frontier" size={20} />
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
              </HoverHint>
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
            style={{
              fontFamily: font.serif,
              fontSize: 22,
              color: color.accent,
            }}
          >
            {/* Travels with the bar beside it rather than snapping ahead of it. */}
            {Math.round(shownPct)}%
          </span>
        </div>
        {/* The whole territory, split the way the map colours it — mastered
            ground first, uncharted last. */}
        <div
          style={{
            display: "flex",
            gap: 2,
            height: 8,
            borderRadius: 5,
            background: "rgba(44,40,35,0.06)",
            overflow: "hidden",
          }}
        >
          {TERRITORY_ORDER.map((s) => (
            <div
              key={s}
              style={{
                flexGrow: count(s),
                flexBasis: 0,
                background: STATE_COLOR[s],
                opacity: s === "unknown" ? 0.28 : 1,
                transition: transition("flex-grow", "deliberate", "enter"),
              }}
            />
          ))}
        </div>
      </div>

      <button className="at-press" onClick={onJumpFrontier} style={RAIL_BUTTON}>
        <span>{t.jumpToFrontier}</span>
        <span style={{ color: STATE_COLOR.frontier }}>→</span>
      </button>

      <button className="at-press" onClick={onCalibration} style={RAIL_BUTTON}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <NodeSeal node={{}} state="shaky" size={10} ring={false} />
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
            // The legend named the six states without ever saying what any of
            // them means. Hovering one explains the state itself — which is
            // this legend's job, and the reason that copy no longer leads the
            // node rail: there it stood in for the concept.
            <HoverHint
              key={state}
              block
              place="right"
              hint={stateConfidence(state, language)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: color.inkSoft,
                  cursor: "default",
                }}
              >
                <NodeSeal node={{}} state={state} size={12} ring={false} />
                <span style={{ flex: 1 }}>
                  {stateLabel(state, language)
                    .replace(" · ready", "")
                    .replace(" · pronto", "")}
                </span>
                <span
                  style={{ fontFamily: font.mono, fontSize: 11, color: color.inkFaint }}
                >
                  {count(state)}
                </span>
              </div>
            </HoverHint>
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
            border: `1px solid ${momentumPlaying ? color.accent : "rgba(44,40,35,0.16)"}`,
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
            {momentumWeek === 0 ? t.placementDiagnostic : t.week(momentumWeek)}
            {t.watchLightUp}
          </div>
        )}
      </div>
    </div>
  );
}
