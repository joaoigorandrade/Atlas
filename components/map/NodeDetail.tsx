"use client";

import { useEffect, useRef, useState } from "react";
import {
  STATE_COLOR,
  phaseIndex,
  phaseLabel,
  phasePlan,
  phaseSkipNudge,
  primaryPhase,
  readingProgress,
  shakyLine,
  stateConfidence,
  stateLabel,
  type ConceptEdge,
  type ConceptNode,
  type PhaseId,
  type ConsumeProgress,
  type NodeState,
  type ShakyReason,
} from "@/lib/curriculum";
import { color, font, kicker, layout, motion, transition } from "@/lib/theme";
import { useCelebrate, usePresence, type PresenceState } from "@/lib/motion";
import { useLanguage, useT } from "@/lib/i18n";

import Rich from "@/components/Rich";
import { SkeletonBars } from "@/components/Pending";

import { STRINGS } from "@/components/map/nodeDetailCopy";
import NodeSeal from "@/components/map/NodeSeal";
import { WaxSeal } from "@/components/ui/Ornaments";
import Button from "@/components/ui/Button";

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
  /** Which phases of this node's plan the learner has finished. Mastery state
   *  is derived from it, and so is which rung of the plan reads as current. */
  phasesDone?: readonly PhaseId[];
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
  phasesDone,
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
  // This node's own ladder — its stored plan, not one fixed list for the whole
  // map. Rung count and rung meaning both vary by what kind of thing it is.
  const plan = phasePlan(node);
  const currentPhase = phaseIndex(plan, phasesDone, displayState, reviewed);
  // What the primary button opens — and therefore what it has to be called.
  const ctaPhase = primaryPhase(plan, phasesDone, displayState);
  const ctaPhaseLabel = ctaPhase ? phaseLabel(ctaPhase) : "";
  // A phase closing is a small win and should read as one. Keyed on the node so
  // clicking through to a different concept doesn't stamp its whole history,
  // and on the phase id as well as the index, so a plan change can't stamp.
  const justClosed = useCelebrate(
    `${node.id}:${plan[currentPhase - 1] ?? ""}:${currentPhase}`,
    (next, prev) => {
      const [id, , at] = next.split(":");
      const [wasId, , wasAt] = prev.split(":");
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
      ? shakyLine(shakyReason, language, plan)
      : stateConfidence(displayState, language, plan);

  // A tapped ahead-of-recommendation phase awaiting the gentle skip nudge.
  const [pendingSkip, setPendingSkip] = useState<number | null>(null);
  useEffect(() => setPendingSkip(null), [node.id, displayState]);

  // An edge means a different thing per domain, so the words on it must too:
  // "set the stage for" where the map is read in time, "finish before you can
  // start" where the material does not go back.
  const edgeLabel =
    node.domain === "interpretive"
      ? { back: t.ledHere, forward: t.ledTo }
      : node.domain === "craft"
        ? { back: t.finishFirst, forward: t.thenComes }
        : { back: locked ? t.learnFirst : t.prerequisites, forward: t.unlocks };
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

  const chips = (title: string, ids: string[], marginTop: number) =>
    ids.length > 0 && (
      <div style={{ marginTop }}>
        <div style={{ ...kicker(10), marginBottom: 10 }}>{title}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{ids.map(chip)}</div>
      </div>
    );

  return (
    <div
      data-testid="panel-node"
      data-node={node?.id ?? ""}
      role="complementary"
      aria-label="Concept detail"
      style={{
        position: "absolute",
        top: layout.topBar,
        bottom: 0,
        right: 0,
        width: layout.nodePanel,
        background: `url(/paper-grain.png) 0 0 / 128px, ${isGap ? color.dangerBg : color.card}`,
        borderLeft: `3px double ${isGap ? stateColor : color.rule}`,
        padding: "28px 26px",
        zIndex: 15,
        overflowY: "auto",
        animation:
          presence === "in"
            ? `drawerIn ${motion.duration.slow}ms ${motion.ease.enter} both`
            : `drawerOut ${EXIT_MS}ms ${motion.ease.exit} both`,
      }}
    >
      {/* The same mark the map draws this concept with, at field-card size —
          ring and all, so the phases below have a picture above them. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <span style={{ position: "relative", flex: "0 0 auto" }}>
          <NodeSeal node={node} state={displayState} done={phasesDone} size={50} />
          {displayState === "mastered" && (
            <WaxSeal size={24} style={{ position: "absolute", right: -8, bottom: -6 }} />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...kicker(10.5, "0.14em"), color: stateColor, marginBottom: 4 }}>
            {stateLabel(displayState, language)}
          </div>
          <div
            style={{
              fontFamily: font.display,
              fontSize: isGap ? 22 : 27,
              fontStyle: isGap ? "italic" : "normal",
              lineHeight: 1.1,
            }}
          >
            {node.label}
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: font.serif,
          fontSize: 16,
          lineHeight: 1.5,
          color: color.inkSoft,
          borderLeft: `2px solid ${stateColor}`,
          padding: "2px 0 2px 15px",
          marginBottom: 24,
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
              borderRadius: 3,
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
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginBottom: 24,
            }}
          >
            {/* The route: one line through every station, inked as far as the
                learner has walked it. The stations sit on top of it. */}
            {[1, Math.max(currentPhase, 0) / Math.max(plan.length - 1, 1)].map((f, k) => (
              <span
                key={k}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 14,
                  top: 20,
                  width: 2,
                  height: "calc(100% - 40px)",
                  transformOrigin: "50% 0",
                  transform: `scaleY(${Math.min(f, 1)})`,
                  background: k ? STATE_COLOR.mastered : color.hairlineStrong,
                  transition: transition("transform", "deliberate", "enter"),
                }}
              />
            ))}
            {plan.map((id, i) => {
              const name = phaseLabel(id);
              // Done because the ledger says so, not because it sits left of
              // the current rung: jumping ahead closes a phase out of order.
              // The positional test stays for Retain — closed by review
              // history, so never in `phasesDone`.
              const status =
                currentPhase < 0
                  ? "locked"
                  : phasesDone?.includes(id) || i < currentPhase
                    ? "done"
                    : i === currentPhase
                      ? "current"
                      : "locked";
              const isCurrent = status === "current";
              const markerColor =
                status === "done"
                  ? STATE_COLOR.mastered
                  : isCurrent
                    ? stateColor
                    : "#c3bdb2";
              // Done phases re-open, the current one starts, and later ones can
              // be jumped to (after the nudge). Only a locked node stays inert.
              const clickable = currentPhase >= 0;
              const isJump = clickable && i > currentPhase;
              return (
                <button
                  className="at-press"
                  key={name}
                  data-testid={`action-phase-${i}`}
                  // The stable handle: `action-phase-${i}` means a different
                  // phase per node once plan lengths vary.
                  data-phase={id}
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
                    borderRadius: 3,
                    width: "100%",
                    textAlign: "left",
                    fontFamily: "inherit",
                    color: "inherit",
                    cursor: clickable ? "pointer" : "default",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      flex: "0 0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      // Opaque, so the route line passes behind the station.
                      background:
                        status === "done"
                          ? color.successBg
                          : isCurrent
                            ? color.amberBg
                            : color.paper,
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
                borderRadius: 3,
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
                {phaseSkipNudge(plan[currentPhase], language)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="at-press"
                  data-testid="action-skip-cancel"
                  onClick={() => {
                    setPendingSkip(null);
                    onPhaseAction(node, displayState, currentPhase);
                  }}
                  style={{
                    padding: "8px 13px",
                    background: color.accent,
                    color: color.accentInk,
                    border: "none",
                    borderRadius: 3,
                    fontSize: 13,
                    fontFamily: font.caps,
                    letterSpacing: "0.06em",
                    cursor: "pointer",
                  }}
                >
                  {t.doFirst(phaseLabel(plan[currentPhase]))}
                </button>
                <button
                  className="at-press"
                  data-testid="action-skip-confirm"
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
                  {t.skipTo(phaseLabel(plan[pendingSkip]))}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Button
        data-testid="action-primary"
        onClick={() => onPrimaryAction(node, displayState)}
        accent={isGap ? stateColor : color.accent}
        style={
          locked
            ? {
                cursor: "default",
                background: "rgba(43,33,24,0.07)",
                color: color.inkGhost,
                boxShadow: "none",
              }
            : undefined
        }
      >
        {/* A part-read node's primary action is to get back into the reading,
            not to start something new. */}
        {reading ? t.resumeReading : t.cta[displayState](ctaPhaseLabel)}
      </Button>

      {displayState === "frontier" && (
        <Button
          variant="secondary"
          accent={color.inkMuted}
          data-testid="action-skip-known"
          onClick={() => onSkipKnown(node)}
          style={{ marginTop: 10, fontSize: 14 }}
        >
          {t.skipKnown}
        </Button>
      )}

      {chips(t.openGaps, gapIds, 24)}
      {chips(edgeLabel.back, prereqIds, 24)}
      {chips(edgeLabel.forward, dependentIds, 20)}
    </div>
  );
}
