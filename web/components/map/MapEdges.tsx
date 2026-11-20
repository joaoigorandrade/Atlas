"use client";

// The roads between concepts. What a road looks like says what walking it
// means: solid ink between two concepts already reached, an amber trail —
// dashed, and flowing toward its end — into a concept on the frontier, a faint
// dotted track through ground nobody has reached, and the re-planner's red
// dashes out to a gap. While the map is being drawn every road inks itself in.

import type { ConceptEdge, NodeState } from "@/lib/curriculum";
import { color, map, transition } from "@/lib/theme";
import { edgePath, type Pt } from "@/components/map/mapGeometry";

export default function MapEdges({
  edges,
  positions,
  display,
  highlighted,
  lockedPath,
  building,
  onHover,
}: {
  edges: ConceptEdge[];
  positions: Record<string, Pt>;
  display: Record<string, NodeState>;
  /** Prerequisite chain of the hovered node — lit in the accent. */
  highlighted: Set<string> | null;
  /** "Learn these first" for a selected locked node — lit amber. */
  lockedPath: Set<string> | null;
  building: boolean;
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      {edges.map(([a, b, dashed], i) => {
        const pa = positions[a];
        const pb = positions[b];
        if (!pa || !pb) return null;
        const d = edgePath(pa, pb);
        const hoverLit = highlighted?.has(a) && highlighted?.has(b);
        const pathLit = lockedPath?.has(a) && lockedPath?.has(b);
        const from = display[a] ?? "unknown";
        const to = display[b] ?? "unknown";
        const trail = !dashed && from !== "unknown" && to === "frontier";
        const road = !dashed && from !== "unknown" && to !== "unknown" && !trail;
        const stroke = dashed
          ? map.gapInk
          : hoverLit
            ? color.accent
            : pathLit || trail
              ? map.trail
              : road
                ? map.road
                : map.track;
        return (
          <g key={i}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeOpacity={dashed ? 0.6 : 1}
              strokeWidth={hoverLit || pathLit ? 2.4 : road ? 1.8 : trail ? 2 : 1.3}
              strokeLinecap="round"
              // `pathLength` rescales every dash to it, so it is set only for the
              // ink-in, where the dash *is* the whole road.
              pathLength={building ? 1 : undefined}
              strokeDasharray={
                building
                  ? 1
                  : dashed
                    ? "5 6"
                    : trail || pathLit
                      ? "7 6"
                      : road || hoverLit
                        ? undefined
                        : "1.5 5"
              }
              style={{
                transition: transition(["stroke", "stroke-width"], "fast"),
                animation: building
                  ? `inkIn 0.9s ${i * 0.03}s cubic-bezier(.2,.8,.3,1) both`
                  : trail || pathLit
                    ? "trailFlow 1.1s linear infinite"
                    : undefined,
              }}
            />
            {/* Invisible hit area: hovering a road lights the prerequisite
                chain of its dependent end. */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseEnter={() => onHover(b)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </>
  );
}
