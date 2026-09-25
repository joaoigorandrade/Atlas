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
import Button from "@/components/ui/Button";
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
  border: `1px solid ${color.rule}`,
  borderRadius: 2,
  fontSize: 15,
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
  const total = states.length || 1;
  const before = (i: number) =>
    TERRITORY_ORDER.slice(0, i).reduce((n, s) => n + count(s), 0);
  return (
    <div
      style={{
        position: "absolute",
        top: layout.topBar,
        bottom: 0,
        left: 0,
        width: layout.leftRail,
        background: `url(/paper-grain.png) 0 0 / 128px, ${color.card}`,
        borderRight: `3px double ${color.rule}`,
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
          textAlign: "center",
          border: `3px double ${color.rule}`,
          borderRadius: 2,
          // A cartouche: the title block of a printed map, double-ruled with a
          // hairline set inside.
          boxShadow: `inset 0 0 0 3px ${color.paper}, inset 0 0 0 4px ${color.hairlineStrong}`,
          background: color.paper,
        }}
      >
        <div style={{ ...kicker(11), marginBottom: 6 }}>❦ {t.subject} ❦</div>
        <div style={{ fontFamily: font.display, fontSize: 25, lineHeight: 1.1 }}>
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
              borderRadius: 2,
              padding: "4px 9px",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#b0852c",
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
                    borderRadius: 3,
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
        {/* Each band is the full bar scaled down to its share and slid to its
            start — on the compositor, where `flex-grow` re-laid-out the rail. */}
        <div
          style={{
            position: "relative",
            height: 8,
            border: `1px solid ${color.rule}`,
            background: "rgba(43,33,24,0.05)",
            overflow: "hidden",
          }}
        >
          {TERRITORY_ORDER.map((s, i) => (
            <div
              key={s}
              style={{
                position: "absolute",
                inset: 0,
                transformOrigin: "0 50%",
                transform: `translateX(${(100 * before(i)) / total}%) scaleX(${count(s) / total})`,
                background: STATE_COLOR[s],
                opacity: s === "unknown" ? 0.28 : 1,
                transition: transition("transform", "deliberate", "enter"),
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
              borderRadius: 2,
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
        <Button
          variant={momentumPlaying ? "primary" : "secondary"}
          onClick={onToggleMomentum}
        >
          {momentumPlaying ? t.stopReplay : t.momentumReplay}
        </Button>
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
