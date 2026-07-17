"use client";

import { useEffect, useState } from "react";
import {
  PHASES,
  PHASE_SKIP_NUDGE,
  STATE_COLOR,
  STATE_CONFIDENCE,
  STATE_LABEL,
  phaseIndex,
  type ConceptEdge,
  type ConceptNode,
  type NodeState,
} from "@/lib/curriculum";
import { color, font, kicker } from "@/lib/theme";

interface NodeDetailProps {
  node: ConceptNode;
  displayState: NodeState;
  /** The live graph — spawned gap nodes appear here too. */
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  /** Display state of every node — colors the prerequisite/unlock chips. */
  display: Record<string, NodeState>;
  onSelect: (id: string) => void;
  onPrimaryAction: (node: ConceptNode, displayState: NodeState) => void;
  /** A phase-row action: re-do a done phase, start the current, or jump ahead. */
  onPhaseAction: (
    node: ConceptNode,
    displayState: NodeState,
    phaseIdx: number,
  ) => void;
  /** Prune a frontier node as diagnosed-known — the aggressive faster lever. */
  onSkipKnown: (node: ConceptNode) => void;
}

const CTA_LABEL: Record<NodeState, string> = {
  frontier: "Begin · Consume",
  learning: "Continue · Feynman",
  shaky: "Re-attempt · Crucible",
  mastered: "Review now",
  gap: "Fix this gap",
  unknown: "Locked",
};

export default function NodeDetail({
  node,
  displayState,
  nodes,
  edges,
  display,
  onSelect,
  onPrimaryAction,
  onPhaseAction,
  onSkipKnown,
}: NodeDetailProps) {
  const labelOf = (id: string) =>
    nodes.find((n) => n.id === id)?.label ?? id;
  const stateColor = STATE_COLOR[displayState];
  const currentPhase = phaseIndex(displayState);
  const locked = displayState === "unknown";

  // A tapped ahead-of-recommendation phase awaiting the gentle skip nudge.
  const [pendingSkip, setPendingSkip] = useState<number | null>(null);
  useEffect(() => setPendingSkip(null), [node.id, displayState]);

  const prereqIds = edges
    .filter(([, to, dashed]) => to === node.id && !dashed)
    .map(([from]) => from);
  const dependentIds = edges
    .filter(([from, , dashed]) => from === node.id && !dashed)
    .map(([, to]) => to);
  // Dashed children are the sub-concepts the re-planner split out of this
  // node's failures — surfaced separately from what it unlocks.
  const gapIds = edges
    .filter(([from, , dashed]) => from === node.id && dashed)
    .map(([, to]) => to);

  const chipStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12.5,
    color: color.inkSoft,
    background: color.card,
    border: `1px solid ${color.hairlineStrong}`,
    borderRadius: 7,
    padding: "5px 10px",
    cursor: "pointer",
  } as const;

  const chip = (id: string) => (
    <button key={id} onClick={() => onSelect(id)} style={chipStyle}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: STATE_COLOR[display[id] ?? "unknown"],
          flex: "0 0 auto",
        }}
      />
      {labelOf(id)}
    </button>
  );

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
          // Done phases re-open, the current one starts, and later ones can
          // be jumped to (after the nudge). Only a locked node stays inert.
          const clickable = currentPhase >= 0;
          const isJump = clickable && i > currentPhase;
          return (
            <button
              key={name}
              disabled={!clickable}
              onClick={() =>
                isJump
                  ? setPendingSkip(i)
                  : onPhaseAction(node, displayState, i)
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "9px 4px",
                background: "none",
                border: "none",
                borderRadius: 8,
                width: "100%",
                textAlign: "left",
                fontFamily: "inherit",
                color: "inherit",
                cursor: clickable ? "pointer" : "default",
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
              {status === "done" && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: font.mono,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: color.inkGhost,
                  }}
                >
                  redo
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pendingSkip !== null && currentPhase >= 0 && (
        <div
          style={{
            background: color.amberBg,
            border: "1px solid rgba(160,106,48,0.25)",
            borderRadius: 10,
            padding: "13px 15px",
            marginTop: -8,
            marginBottom: 18,
            animation: "fadeUp 0.25s both",
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.5,
              color: color.amberInk,
              marginBottom: 11,
            }}
          >
            {PHASE_SKIP_NUDGE[PHASES[currentPhase]]}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                setPendingSkip(null);
                onPhaseAction(node, displayState, currentPhase);
              }}
              style={{
                padding: "8px 13px",
                background: color.accent,
                color: color.accentInk,
                border: "none",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Do {PHASES[currentPhase]} first
            </button>
            <button
              onClick={() => {
                const target = pendingSkip;
                setPendingSkip(null);
                onPhaseAction(node, displayState, target);
              }}
              style={{
                padding: "8px 4px",
                background: "none",
                border: "none",
                fontSize: 13,
                color: color.amberInk,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Skip to {PHASES[pendingSkip]} →
            </button>
          </div>
        </div>
      )}

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

      {displayState === "frontier" && (
        <button
          onClick={() => onSkipKnown(node)}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "11px 15px",
            background: "none",
            border: `1px solid ${color.hairlineStrong}`,
            borderRadius: 12,
            fontSize: 13.5,
            color: color.inkMuted,
            cursor: "pointer",
          }}
        >
          I already know this — skip it
        </button>
      )}

      {gapIds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>
            Open gaps · spawned from failures
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {gapIds.map(chip)}
          </div>
        </div>
      )}

      {prereqIds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>
            {locked ? "Learn these first" : "Prerequisites"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {prereqIds.map(chip)}
          </div>
        </div>
      )}

      {dependentIds.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>Unlocks</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dependentIds.map(chip)}
          </div>
        </div>
      )}
    </div>
  );
}
