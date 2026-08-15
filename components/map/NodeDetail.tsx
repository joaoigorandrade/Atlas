"use client";

import { useEffect, useRef, useState } from "react";
import {
  PHASES,
  PHASE_SKIP_NUDGE,
  STATE_COLOR,
  readingPhaseIndex,
  readingProgress,
  shakyLine,
  stateConfidence,
  stateLabel,
  type ConceptEdge,
  type ConceptNode,
  type ConsumeProgress,
  type NodeState,
  type ShakyReason,
} from "@/lib/curriculum";
import { color, font, kicker, motion, transition } from "@/lib/theme";
import { useCelebrate, usePresence, type PresenceState } from "@/lib/motion";
import { useLanguage, useT } from "@/lib/i18n";

import Rich from "@/components/Rich";
import { SkeletonBars } from "@/components/Pending";

const STRINGS = {
  en: {
    cta: {
      frontier: "Begin · Consume",
      learning: "Continue · Feynman",
      shaky: "Re-attempt · Crucible",
      mastered: "Review now",
      gap: "Fix this gap",
      unknown: "Locked",
    } as Record<NodeState, string>,
    phaseSpiral: "Phase spiral",
    next: "next",
    redo: "redo",
    readingProgress: (read: number, total: number) => `${read} of ${total} read`,
    resumeReading: "Resume reading",
    doFirst: (phase: string) => `Do ${phase} first`,
    skipTo: (phase: string) => `Skip to ${phase} →`,
    skipKnown: "I already know this — skip it",
    openGaps: "Open gaps · spawned from failures",
    repair: "Targeted repair",
    repairStep: "Socratic pass",
    repairNote: "one pass · closes this gap",
    spawnedFrom: "Spawned from",
    learnFirst: "Learn these first",
    prerequisites: "Prerequisites",
    unlocks: "Unlocks",
  },
  "pt-BR": {
    cta: {
      frontier: "Começar · Consume",
      learning: "Continuar · Feynman",
      shaky: "Tentar de novo · Crucible",
      mastered: "Revisar agora",
      gap: "Corrigir esta lacuna",
      unknown: "Bloqueado",
    } as Record<NodeState, string>,
    phaseSpiral: "Espiral de fases",
    next: "próximo",
    redo: "refazer",
    readingProgress: (read: number, total: number) => `${read} de ${total} lidas`,
    resumeReading: "Retomar a leitura",
    doFirst: (phase: string) => `Fazer ${phase} primeiro`,
    skipTo: (phase: string) => `Pular para ${phase} →`,
    skipKnown: "Eu já sei isso — pular",
    openGaps: "Lacunas abertas · geradas por falhas",
    repair: "Reparo direcionado",
    repairStep: "Passagem socrática",
    repairNote: "uma passagem · fecha esta lacuna",
    spawnedFrom: "Originado de",
    learnFirst: "Aprenda isso primeiro",
    prerequisites: "Pré-requisitos",
    unlocks: "Desbloqueia",
  },
} as const;

interface NodeDetailProps {
  node: ConceptNode;
  displayState: NodeState;
  /** The live graph — spawned gap nodes appear here too. */
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  /** Display state of every node — colors the prerequisite/unlock chips. */
  display: Record<string, NodeState>;
  /** Real review history exists for this node — gates "Retained ✓" (#13). */
  reviewed: boolean;
  /** How the node became Shaky, when it is — selects honest copy (#14). */
  shakyReason?: ShakyReason;
  /** This node's own sentence is missing and is being written right now — the
   *  summary box shows the shape of it instead of falling back to copy about
   *  the mastery state. False once the attempt has failed (or offline), which
   *  is what keeps the fallback reachable. */
  summaryWriting?: boolean;
  /** How far into this node's reading pass the learner got, when they have
   *  opened it — the phase spiral reads it so a part-read node doesn't get
   *  Consume *and* Socratic ticked off (§6). */
  consumeProgress?: ConsumeProgress;
  onSelect: (id: string) => void;
  onPrimaryAction: (node: ConceptNode, displayState: NodeState) => void;
  /** A phase-row action: re-do a done phase, start the current, or jump ahead. */
  onPhaseAction: (node: ConceptNode, displayState: NodeState, phaseIdx: number) => void;
  /** Prune a frontier node as diagnosed-known — the aggressive faster lever. */
  onSkipKnown: (node: ConceptNode) => void;
}

/**
 * The right rail. A drawer, so it arrives from the edge it lives on and leaves
 * the same way — `open` going false starts the exit rather than deleting the
 * panel mid-air, and the last node is held back so there is something to
 * animate out.
 */
export default function NodeDetail({
  visible,
  node,
  displayState,
  ...rest
}: Omit<NodeDetailProps, "node" | "displayState"> & {
  /** Collapsed by the narrow-viewport rail, and false with nothing selected. */
  visible: boolean;
  node: ConceptNode | null;
  displayState: NodeState | null;
}) {
  const open = visible && Boolean(node && displayState);
  const { mounted, state } = usePresence(open, EXIT_MS);
  const last = useRef<NodeDetailProps | null>(null);
  useEffect(() => {
    if (node && displayState) last.current = { node, displayState, ...rest };
  });

  const shown = node && displayState ? { node, displayState, ...rest } : last.current;
  if (!mounted || !shown) return null;
  return <NodeDetailBody {...shown} presence={state} />;
}

const EXIT_MS = motion.duration.base;
const STAMP_MS = motion.duration.deliberate;

function NodeDetailBody({
  presence,
  node,
  displayState,
  nodes,
  edges,
  display,
  reviewed,
  shakyReason,
  consumeProgress,
  summaryWriting,
  onSelect,
  onPrimaryAction,
  onPhaseAction,
  onSkipKnown,
}: NodeDetailProps & { presence: PresenceState }) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const labelOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const stateColor = STATE_COLOR[displayState];
  const currentPhase = readingPhaseIndex(displayState, reviewed, consumeProgress);
  // A phase closing is a small win and should read as one. Keyed on the node so
  // clicking through to a different concept doesn't stamp its whole history.
  const justClosed = useCelebrate(
    `${node.id}:${currentPhase}`,
    (next, prev) => {
      const [id, at] = next.split(":");
      const [wasId, wasAt] = prev.split(":");
      return id === wasId && Number(at) > Number(wasAt);
    },
    { ms: STAMP_MS },
  )
    ? currentPhase - 1
    : -1;
  // Shown on the Consume row when there is a real, unfinished pass behind it.
  const reading =
    consumeProgress && !consumeProgress.finished && consumeProgress.total > 0
      ? readingProgress(consumeProgress)
      : null;
  const locked = displayState === "unknown";
  // A lacuna is not a map topic: no six-phase spiral, no green CTA. It is one
  // targeted Socratic pass hanging off its parent, and it reads that way.
  const isGap = displayState === "gap";
  // What this concept *is*, which is what the learner opened the node to find
  // out. Copy about the mastery state is the fallback, not the headline: it
  // only shows for a node with no summary — a run persisted before summaries,
  // or a concept whose sentence the generation dropped — and even then only
  // once backfilling that sentence has actually been ruled out, since the same
  // paragraph under every Learning concept says nothing about this one.
  const summary = node.summary?.trim();
  const stateLine =
    displayState === "shaky"
      ? shakyLine(shakyReason, language)
      : stateConfidence(displayState, language);

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
  const parentIds = edges
    .filter(([, to, dashed]) => to === node.id && dashed)
    .map(([from]) => from);

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
    <button
      key={id}
      className="at-press at-tint"
      onClick={() => onSelect(id)}
      style={chipStyle}
    >
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
        background: isGap ? "rgba(250,243,241,0.97)" : "rgba(248,246,240,0.97)",
        borderLeft: isGap ? `2px solid ${stateColor}` : `1px solid ${color.hairline}`,
        padding: "28px 26px",
        zIndex: 15,
        overflowY: "auto",
        animation:
          presence === "in"
            ? `drawerIn ${motion.duration.slow}ms ${motion.ease.enter} both`
            : `drawerOut ${EXIT_MS}ms ${motion.ease.exit} both`,
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
            boxShadow: displayState === "frontier" ? `0 0 7px ${stateColor}` : "none",
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
          {stateLabel(displayState, language)}
        </span>
      </div>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: isGap ? 21 : 26,
          fontStyle: isGap ? "italic" : "normal",
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
          ...(summary || !summaryWriting
            ? null
            : { display: "flex", flexDirection: "column", gap: 8 }),
        }}
      >
        {summary ? (
          <Rich text={summary} />
        ) : summaryWriting ? (
          <SkeletonBars widths={["100%", "78%"]} heights={11} />
        ) : (
          <Rich text={stateLine} />
        )}
      </div>

      {isGap ? (
        <>
          <div style={{ ...kicker(10), marginBottom: 10 }}>{t.repair}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 15px",
              background: color.card,
              border: `1px solid ${stateColor}33`,
              borderRadius: 10,
              marginBottom: 22,
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
                background: `${stateColor}22`,
                border: `1px solid ${stateColor}`,
                color: stateColor,
              }}
            >
              →
            </span>
            <span style={{ fontFamily: font.serif, fontSize: 15, fontWeight: 600 }}>
              {t.repairStep}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                color: color.inkMuted,
              }}
            >
              {t.repairNote}
            </span>
          </div>
          {parentIds.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ ...kicker(10), marginBottom: 10 }}>{t.spawnedFrom}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {parentIds.map(chip)}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ ...kicker(10), marginBottom: 12 }}>{t.phaseSpiral}</div>
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
                  className="at-press"
                  key={name}
                  disabled={!clickable}
                  onClick={() =>
                    isJump ? setPendingSkip(i) : onPhaseAction(node, displayState, i)
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
                      border: `1px solid ${status === "locked" ? color.hairlineStrong : markerColor}`,
                      color: markerColor,
                      transition: transition(
                        ["background", "border-color", "color"],
                        "slow",
                      ),
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        animation:
                          i === justClosed
                            ? `stamp ${STAMP_MS}ms ${motion.ease.spring} both`
                            : undefined,
                      }}
                    >
                      {status === "done" ? "✓" : isCurrent ? "→" : "·"}
                    </span>
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
                  {/* How far into the reading, on the reading's own row — the
                    one place "you're part-way through this" belongs. */}
                  {i === 0 && reading && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: font.mono,
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        color: color.inkMuted,
                      }}
                    >
                      {t.readingProgress(reading.read, reading.total)}
                    </span>
                  )}
                  {isCurrent && !(i === 0 && reading) && (
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
                      {t.next}
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
                      {t.redo}
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
                  className="at-press"
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
                  {t.doFirst(PHASES[currentPhase])}
                </button>
                <button
                  className="at-press"
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
                  {t.skipTo(PHASES[pendingSkip])}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <button
        className="at-press"
        onClick={() => onPrimaryAction(node, displayState)}
        style={{
          width: "100%",
          padding: 15,
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 600,
          cursor: locked ? "default" : "pointer",
          border: "none",
          background: locked ? "rgba(44,40,35,0.07)" : isGap ? stateColor : color.accent,
          color: locked ? color.inkGhost : color.accentInk,
          boxShadow: locked
            ? "none"
            : isGap
              ? "0 8px 22px rgba(193,87,74,0.26)"
              : "0 8px 22px rgba(47,107,79,0.26)",
        }}
      >
        {/* A part-read node's primary action is to get back into the reading,
            not to start something new. */}
        {reading ? t.resumeReading : t.cta[displayState]}
      </button>

      {displayState === "frontier" && (
        <button
          className="at-press"
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
          {t.skipKnown}
        </button>
      )}

      {gapIds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>{t.openGaps}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {gapIds.map(chip)}
          </div>
        </div>
      )}

      {prereqIds.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>
            {locked ? t.learnFirst : t.prerequisites}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {prereqIds.map(chip)}
          </div>
        </div>
      )}

      {dependentIds.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...kicker(10), marginBottom: 10 }}>{t.unlocks}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dependentIds.map(chip)}
          </div>
        </div>
      )}
    </div>
  );
}
