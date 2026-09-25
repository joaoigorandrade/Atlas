"use client";

// A concept's mark, the one symbol the map, the peek, the plan rail and the
// detail rail all draw it with: a disc in its mastery colour, a glyph for what
// kind of thing it is, and around it a ring with one segment per phase of its
// plan, filled for each phase finished. Progress on a node used to be visible
// only once it was selected; the ring puts it on the map.

import {
  STATE_COLOR,
  phasePlan,
  type ConceptNode,
  type NodeState,
  type PhaseId,
} from "@/lib/curriculum";
import { color, transition } from "@/lib/theme";
import { phaseArcs } from "@/components/map/mapGeometry";

export default function NodeSeal({
  node,
  state,
  done,
  size = 30,
  ring = true,
}: {
  node: Pick<ConceptNode, "kind" | "domain" | "phasePlan" | "gap">;
  state: NodeState;
  done?: readonly PhaseId[];
  size?: number;
  /** The phase ring — off where the seal is only a legend swatch. */
  ring?: boolean;
}) {
  const c = size / 2;
  const tint = STATE_COLOR[state];
  const unknown = state === "unknown";
  // A spawned gap has no ladder of its own yet; it gets a broken ring instead.
  const gap = state === "gap" || node.gap;
  const arcs = ring && !gap ? phaseArcs(phasePlan(node), done, c, c - 1.6) : [];
  const disc = ring ? c - 5.2 : c - 0.5;
  const g = disc * 0.46;
  const ink = unknown ? color.inkGhost : color.accentInk;
  const glyph =
    state === "mastered" ? (
      <path
        d={`M${c - g * 0.85},${c + g * 0.05} L${c - g * 0.2},${c + g * 0.65} L${c + g * 0.9},${c - g * 0.6}`}
        fill="none"
        stroke={ink}
        strokeWidth={size * 0.075}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <KindGlyph kind={node.kind ?? "concept"} c={c} g={g} ink={ink} w={size * 0.06} />
    );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      style={{ display: "block", overflow: "visible", flex: "0 0 auto" }}
    >
      {arcs.map((a, i) => (
        <path
          key={i}
          d={a.d}
          fill="none"
          stroke={a.done ? tint : color.hairlineStrong}
          strokeWidth={size * 0.08}
          strokeLinecap="round"
          style={{ transition: transition("stroke", "slow") }}
        />
      ))}
      {ring && gap && (
        <circle
          cx={c}
          cy={c}
          r={c - 1.6}
          fill="none"
          stroke={tint}
          strokeWidth={size * 0.06}
          strokeDasharray="3 3"
        />
      )}
      <circle
        cx={c}
        cy={c}
        r={disc}
        fill={unknown ? color.card : tint}
        stroke={unknown ? color.inkGhost : "none"}
        strokeWidth={1}
        strokeDasharray={unknown ? "2.5 2" : undefined}
        style={{ transition: transition(["fill", "stroke"], "slow") }}
      />
      {size >= 16 && glyph}
    </svg>
  );
}

/** Fact a diamond, concept a point, procedure a pair of chevrons, principle a
 *  star — four shapes that stay distinct at twelve pixels. */
function KindGlyph({
  kind,
  c,
  g,
  ink,
  w,
}: {
  kind: NonNullable<ConceptNode["kind"]>;
  c: number;
  g: number;
  ink: string;
  w: number;
}) {
  const stroke = {
    fill: "none",
    stroke: ink,
    strokeWidth: w,
    strokeLinecap: "round" as const,
  };
  if (kind === "fact")
    return (
      <path
        d={`M${c},${c - g} L${c + g * 0.8},${c} L${c},${c + g} L${c - g * 0.8},${c} Z`}
        fill={ink}
      />
    );
  if (kind === "procedure")
    return (
      <path
        d={`M${c - g * 0.85},${c - g * 0.65} L${c - g * 0.15},${c} L${c - g * 0.85},${c + g * 0.65} M${c + g * 0.05},${c - g * 0.65} L${c + g * 0.75},${c} L${c + g * 0.05},${c + g * 0.65}`}
        strokeLinejoin="round"
        {...stroke}
      />
    );
  if (kind === "principle")
    return (
      <path
        d={[0, 60, 120]
          .map((deg) => {
            const r = (deg * Math.PI) / 180;
            const dx = Math.sin(r) * g * 0.9;
            const dy = Math.cos(r) * g * 0.9;
            return `M${c - dx},${c - dy} L${c + dx},${c + dy}`;
          })
          .join(" ")}
        {...stroke}
      />
    );
  return <circle cx={c} cy={c} r={g * 0.5} fill={ink} />;
}
