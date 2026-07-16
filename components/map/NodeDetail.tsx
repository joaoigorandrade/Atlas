"use client";

import {
  EDGES,
  NODES,
  PHASES,
  STATE_COLOR,
  STATE_CONFIDENCE,
  STATE_LABEL,
  phaseIndex,
  type ConceptNode,
  type NodeState,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface NodeDetailProps {
  node: ConceptNode;
  displayState: NodeState;
  onSelect: (id: string) => void;
  onPrimaryAction: (node: ConceptNode, displayState: NodeState) => void;
}

const CTA_LABEL: Record<NodeState, string> = {
  frontier: "Begin · Consume",
  learning: "Continue · Feynman",
  shaky: "Re-attempt · Crucible",
  mastered: "Review now",
  gap: "Fix this gap",
  unknown: "Locked",
};

function labelOf(id: string): string {
  return NODES.find((n) => n.id === id)?.label ?? id;
}

export default function NodeDetail({
  node,
  displayState,
  onSelect,
  onPrimaryAction,
}: NodeDetailProps) {
  const stateColor = STATE_COLOR[displayState];
  const currentPhase = phaseIndex(displayState);
  const locked = displayState === "unknown";

  const prereqIds = EDGES.filter(
    ([, to]) => to === node.id && !to.startsWith("gap"),
  ).map(([from]) => from);
  const dependentIds = EDGES.filter(([from]) => from === node.id).map(
    ([, to]) => to,
  );

  const chipStyle = {
    fontSize: 12.5,
    color: color.inkSoft,
    background: color.card,
    border: `1px solid ${color.hairlineStrong}`,
    borderRadius: 7,
    padding: "5px 10px",
    cursor: "pointer",
  } as const;

  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        bottom: 0,
        right: 0,
        width: 356,
        background: "rgba(248,246,240,0.97)",
        borderLeft: `1px solid ${color.hairline}`,
        padding: "28px 26px",
        zIndex: 15,
        overflowY: "auto",
        animation: "softIn 0.3s both",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: stateColor,
            boxShadow:
              displayState === "frontier" ? `0 0 7px ${stateColor}` : "none",
          }}
        />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: stateColor,
          }}
        >
          {STATE_LABEL[displayState]}
        </span>
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 26,
          lineHeight: 1.14,
          marginBottom: 14,
        }}
      >
        {node.label}
      </div>

      <div
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          color: color.inkSoft,
          background: color.card,
          border: `1px solid ${color.hairline}`,
          borderLeft: `3px solid ${stateColor}`,
          borderRadius: 9,
          padding: "13px 15px",
          marginBottom: 22,
        }}
      >
        {STATE_CONFIDENCE[displayState]}
      </div>

      <div style={{ ...kicker(10), marginBottom: 12 }}>Phase spiral</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginBottom: 24,
        }}
      >
        {PHASES.map((name, i) => {
          const status =
            currentPhase < 0
              ? "locked"
              : i < currentPhase
                ? "done"
                : i === currentPhase
                  ? "current"
                  : "locked";
          const isCurrent = status === "current";
          const markerColor =
            status === "done" ? "#4c8b63" : isCurrent ? stateColor : "#c3bdb2";
          return (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 4px",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  background:
                    status === "done"
                      ? "rgba(76,139,99,0.14)"
                      : isCurrent
                        ? "rgba(201,154,46,0.14)"
                        : "transparent",
                  border: `1px solid ${
                    status === "locked" ? color.hairlineStrong : markerColor
                  }`,
                  color: markerColor,
                }}
              >
                {status === "done" ? "✓" : isCurrent ? "→" : "·"}
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontFamily: font.serif,
                  color: status === "locked" ? color.inkGhost : color.ink,
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {name}
              </span>
              {isCurrent && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: font.mono,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: stateColor,
                  }}
                >
                  next
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onPrimaryAction(node, displayState)}
        style={{
          width: "100%",
          padding: 15,
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 600,
          cursor: locked ? "default" : "pointer",
          border: "none",
          background: locked ? "rgba(44,40,35,0.07)" : color.accent,
          color: locked ? color.inkGhost : color.accentInk,
          boxShadow: locked ? "none" : "0 8px 22px rgba(47,107,79,0.26)",
        }}
      >
        {CTA_LABEL[displayState]}
      </button>

      {prereqIds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>Prerequisites</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {prereqIds.map((id) => (
              <button key={id} onClick={() => onSelect(id)} style={chipStyle}>
                {labelOf(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {dependentIds.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>Unlocks</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dependentIds.map((id) => (
              <button key={id} onClick={() => onSelect(id)} style={chipStyle}>
                {labelOf(id)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
