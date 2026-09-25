"use client";

// One concept on the map, drawn the way a map draws a town: a mark at the
// place, its name set underneath on a paper halo, no box round either. The
// mark is `NodeSeal` — mastery colour, kind glyph, phase ring. A concept on
// the frontier sends out a beacon; the selected one is ringed; one on the
// "learn these first" path gets an amber ring of its own.

import type { ConceptNode, NodeState, PhaseId } from "@/lib/curriculum";
import { STATE_COLOR } from "@/lib/curriculum";
import { color, font, map, motion, transition } from "@/lib/theme";
import NodeSeal from "@/components/map/NodeSeal";
import { WaxSeal } from "@/components/ui/Ornaments";

/** The seal's diameter in map units. `MapCanvas` sizes the peek's clearance
 *  from it. */
export const SEAL = 30;
export const CELEBRATE_MS = 900;

const HALO = `0 0 2px ${color.paper}, 0 0 4px ${color.paper}, 0 0 8px ${color.paper}, 0 0 12px ${color.paper}`;

export default function MapNode({
  node,
  pos,
  state,
  done,
  arrival,
  building,
  selected,
  onPath,
  matches,
  earned,
  gapLabel,
  onSelect,
  onDown,
  onOpen,
  onHover,
}: {
  node: ConceptNode;
  pos: { x: number; y: number };
  state: NodeState;
  done?: readonly PhaseId[];
  /** The `animation` for the assemble beat, decided by the canvas. */
  arrival: string;
  building: boolean;
  selected: boolean;
  onPath: boolean;
  matches: boolean;
  /** The state this node just earned, while the celebration runs. */
  earned?: NodeState;
  gapLabel: string;
  onSelect: () => void;
  onDown: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onHover: (on: boolean) => void;
}) {
  const frontier = state === "frontier";
  // A node left unknown after derivation is locked by definition; keep the
  // assemble moment uniform while the map is building.
  const locked = state === "unknown" && !building;
  const ring = (inset: number, border: string, extra?: React.CSSProperties) => (
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset,
        borderRadius: "50%",
        border,
        pointerEvents: "none",
        ...extra,
      }}
    />
  );

  return (
    // Positioner. Owns `left`/`top` and the centring transform, so the chip
    // inside is free to use `transform` for hover — the two must not share a
    // property or the class and the inline style collide. `assemble` animates
    // `transform` too, which is why the arrival sits here and not on the chip.
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%,-50%)",
        zIndex: selected ? 6 : frontier ? 4 : 2,
        // While building, `left`/`top` are transitioned: streamed concepts are
        // placed with a provisional vertical offset and the settling pass at
        // the end of the stream moves them. Only while building — dragging a
        // node on the real map must track the cursor exactly.
        transition: building ? transition(["left", "top"], "slow", "enter") : undefined,
        animation: arrival,
      }}
    >
      <div
        className="at-lift"
        data-testid={`node-${node.id}`}
        data-state={state}
        role="button"
        tabIndex={0}
        aria-label={`${node.label} — ${state}`}
        onKeyDown={(e) => {
          // The map is a mouse surface — pan, drag, double-click to begin — and
          // none of that is reachable from a keyboard. Enter selects (opening
          // the detail rail, whose phase buttons are ordinary buttons), and that
          // is the whole ladder: every action on a node lives in that rail.
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseDown={onDown}
        onDoubleClick={onOpen}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        style={{
          position: "relative",
          width: SEAL,
          height: SEAL,
          borderRadius: "50%",
          cursor: "pointer",
          userSelect: "none",
          opacity: locked && !onPath && !selected ? 0.62 : matches ? 1 : 0.24,
        }}
      >
        {frontier && (
          <>
            {ring(-3, `1px solid ${map.trail}`, { opacity: 0.45 })}
            {ring(0, `2px solid ${map.trail}`, {
              opacity: 0,
              animation: "bloom 2.6s ease-out infinite",
            })}
            {ring(0, `2px solid ${map.trail}`, {
              opacity: 0,
              animation: "bloom 2.6s 1.3s ease-out infinite",
            })}
          </>
        )}
        {selected && ring(-6, `2px solid ${color.accent}`)}
        {onPath && !selected && ring(-5, `1.5px dashed ${map.trail}`)}
        <span
          style={{
            display: "block",
            borderRadius: "50%",
            background: color.paper,
            boxShadow: "0 1px 0 rgba(43,33,24,0.2), 0 2px 5px rgba(43,33,24,0.12)",
            // A node changing state is the point of the whole product; the
            // colour arrives inside the seal, and the pop lands on top of it.
            animation: earned
              ? `markPop ${CELEBRATE_MS}ms ${motion.ease.spring} both`
              : undefined,
          }}
        >
          <NodeSeal node={node} state={state} done={done} size={SEAL} />
        </span>
        {earned &&
          earned !== "mastered" &&
          ring(-1, `2px solid ${STATE_COLOR[earned]}`, {
            animation: `bloom ${CELEBRATE_MS}ms ${motion.ease.enter} both`,
          })}
        {/* Mastery is sealed: wax pressed onto the concept, and pressed live
            the moment it is earned. */}
        {state === "mastered" && (
          <WaxSeal
            size={16}
            stamp={earned === "mastered"}
            style={{ position: "absolute", right: -6, bottom: -5 }}
          />
        )}
        <span
          style={{
            position: "absolute",
            top: SEAL + 5,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            fontFamily: font.display,
            fontSize: 16.5,
            lineHeight: 1.15,
            fontStyle: state === "gap" ? "italic" : "normal",
            color: selected ? color.accent : locked ? color.inkMuted : color.ink,
            textShadow: HALO,
            transition: transition("color", "fast"),
          }}
        >
          {node.label}
          {state === "gap" && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 9.5,
                fontStyle: "normal",
                fontWeight: 400,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: map.gapInk,
                background: color.paper,
                border: `1px solid ${map.gapInk}66`,
                borderRadius: 2,
                padding: "1px 5px",
                textShadow: "none",
              }}
            >
              {gapLabel}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
