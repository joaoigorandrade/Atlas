"use client";

import { useEffect, useRef, useState } from "react";
import {
  PHASES,
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
import { color, font, motion } from "@/lib/theme";
import { usePresence } from "@/lib/motion";
import { useLanguage, useT } from "@/lib/i18n";

const STRINGS = {
  en: {
    next: (phase: string) => `Next · ${phase}`,
    inReview: "In review",
    locked: "Locked",
    prereqsMet: (met: number, total: number) => `${met}/${total} prereqs met`,
    unlocks: (n: number) => `Unlocks ${n}`,
    openGaps: (n: number) => `${n} open ${n === 1 ? "gap" : "gaps"}`,
    reading: (read: number, total: number) => `${read} of ${total} read`,
    open: "Double-click to open",
    select: "Click to select",
  },
  "pt-BR": {
    next: (phase: string) => `Próximo · ${phase}`,
    inReview: "Em revisão",
    locked: "Bloqueado",
    prereqsMet: (met: number, total: number) => `${met}/${total} pré-requisitos`,
    unlocks: (n: number) => `Desbloqueia ${n}`,
    openGaps: (n: number) => `${n} ${n === 1 ? "lacuna aberta" : "lacunas abertas"}`,
    reading: (read: number, total: number) => `${read} de ${total} lidas`,
    open: "Clique duplo para abrir",
    select: "Clique para selecionar",
  },
} as const;

export interface NodeHoverCardProps {
  node: ConceptNode;
  displayState: NodeState;
  /** Display state of every node — decides which prerequisites are met. */
  display: Record<string, NodeState>;
  edges: ConceptEdge[];
  /** Real review history for this node — the spiral's last tick (#13). */
  reviewed: boolean;
  shakyReason?: ShakyReason;
  consumeProgress?: ConsumeProgress;
  /** Screen-space centre of the node chip, in canvas pixels. */
  x: number;
  y: number;
  /** Half the chip's on-screen height — how far the card clears the node. */
  reach: number;
  /** Open upward: the node sits too low for the card to fit beneath it. */
  above: boolean;
}

/**
 * The peek: what a node is, without opening it.
 *
 * Hovering a node already lit its prerequisite chain and started warming its
 * first surface; the one thing it didn't do was say anything. This is the
 * node's state, where it sits in the spiral, and what it costs or unlocks —
 * the rail's answer to "should I click this", at a glance and without
 * committing a selection to it.
 *
 * Pointer-only by construction (`pointer-events: none`, `aria-hidden`): every
 * line here is already reachable in the detail rail, which is what the
 * keyboard and a screen reader get.
 */
export default function NodeHoverCard({
  shown,
}: {
  /** Null closes the card; it stays mounted through its exit. */
  shown: NodeHoverCardProps | null;
}) {
  const { mounted, state } = usePresence(Boolean(shown), EXIT_MS);
  const last = useRef<NodeHoverCardProps | null>(null);
  useEffect(() => {
    if (shown) last.current = shown;
  });

  const props = shown ?? last.current;
  if (!mounted || !props) return null;
  return <Body {...props} presence={state === "in"} />;
}

const EXIT_MS = motion.duration.fast;

function Body({
  node,
  displayState,
  display,
  edges,
  reviewed,
  shakyReason,
  consumeProgress,
  x,
  y,
  reach,
  above,
  presence,
}: NodeHoverCardProps & { presence: boolean }) {
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const stateColor = STATE_COLOR[displayState];

  const prereqIds = edges
    .filter(([, to, dashed]) => to === node.id && !dashed)
    .map(([from]) => from);
  const met = prereqIds.filter((id) => {
    const s = display[id];
    return s === "learning" || s === "shaky" || s === "mastered";
  }).length;
  const unlocks = edges.filter(
    ([from, , dashed]) => from === node.id && !dashed,
  ).length;
  const gaps = edges.filter(
    ([from, , dashed]) => from === node.id && dashed,
  ).length;

  const phase = readingPhaseIndex(displayState, reviewed, consumeProgress);
  const reading =
    consumeProgress && !consumeProgress.finished && consumeProgress.total > 0
      ? readingProgress(consumeProgress)
      : null;
  // Same order the detail rail uses: what the concept IS first, and copy about
  // its mastery state only for a node that has no sentence of its own. The
  // facts row below already carries where this node stands, so the state copy
  // was saying it twice.
  const line =
    node.summary?.trim() ||
    (displayState === "shaky"
      ? shakyLine(shakyReason, language)
      : stateConfidence(displayState, language));

  // The one thing worth saying about where this node stands: the phase it is
  // owed, or the reason it can't be entered at all.
  const standing =
    displayState === "unknown"
      ? t.prereqsMet(met, prereqIds.length)
      : phase < 0
        ? t.locked
        : phase >= PHASES.length
          ? t.inReview
          : t.next(PHASES[phase]);

  const facts = [
    reading ? t.reading(reading.read, reading.total) : null,
    gaps > 0 ? t.openGaps(gaps) : null,
    unlocks > 0 ? t.unlocks(unlocks) : null,
  ].filter(Boolean) as string[];

  return (
    // Positioner. It owns the centring transform and the placement, leaving
    // `transform` on the card itself free for the peek animation.
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: x,
        [above ? "bottom" : "top"]: above ? `calc(100% - ${y - reach - 12}px)` : y + reach + 12,
        transform: "translateX(-50%)",
        zIndex: 12,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 272,
          background: "rgba(251,249,244,0.97)",
          backdropFilter: "blur(7px)",
          border: `1px solid ${color.hairlineStrong}`,
          borderLeft: `3px solid ${stateColor}`,
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(44,40,35,0.17)",
          padding: "12px 14px 11px",
          transformOrigin: above ? "50% 100%" : "50% 0",
          animation: presence
            ? `peekIn ${motion.duration.fast}ms ${motion.ease.enter} both`
            : `peekOut ${EXIT_MS}ms ${motion.ease.exit} both`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 5,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: stateColor,
              boxShadow:
                displayState === "frontier" ? `0 0 6px ${stateColor}` : "none",
              flex: "0 0 auto",
            }}
          />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 9.5,
              letterSpacing: "0.13em",
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
            fontSize: 17,
            lineHeight: 1.18,
            fontStyle: displayState === "gap" ? "italic" : "normal",
            marginBottom: 7,
          }}
        >
          {node.label}
        </div>

        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            color: color.inkSoft,
            // Three lines of the confidence copy; the rail carries the rest.
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {line}
        </div>

        <div
          style={{
            marginTop: 10,
            paddingTop: 9,
            borderTop: `1px solid ${color.hairline}`,
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: "0.06em",
            color: color.inkMuted,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "3px 10px",
            }}
          >
            <span style={{ color: stateColor }}>{standing}</span>
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </div>
          {/* What the pointer can do about any of it, kept on its own line so
              a long fact never pushes it out of the card. */}
          <div style={{ marginTop: 5, color: color.inkGhost }}>
            {displayState === "unknown" ? t.select : t.open}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hold a hovered value until the cursor has settled on it.
 *
 * A map is mostly the space between nodes; without this, crossing three of
 * them on the way somewhere flashes three cards. The first open waits for a
 * real pause, and once a card is up, moving to the next node swaps it fast —
 * by then the learner is reading, not passing through.
 */
export function useDwell(
  value: string | null,
  ms = 300,
  handoffMs = 90,
): string | null {
  const [settled, setSettled] = useState<string | null>(null);
  const open = settled !== null;

  useEffect(() => {
    if (value === null) {
      setSettled(null);
      return;
    }
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), open ? handoffMs : ms);
    return () => clearTimeout(timer);
  }, [value, settled, open, ms, handoffMs]);

  return settled;
}
