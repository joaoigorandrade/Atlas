"use client";

// "Go deeper": open the next level of a mastered concept.
//
// A level is a hidden node (`spawnDepth`), so this only has to put it in the
// graph and hand it to the same entry the map's primary button uses — which
// asks the node's own plan what it owes (`enterOwedPhase`), never names a
// phase. The graph diff (`runProjection`) persists it like any other node.

import { useCallback } from "react";
import { spawnDepth, type ConceptNode, type NodeState } from "@/lib/curriculum";
import type { RunState } from "@/components/atlas/useRunState";

export function useDepth(
  run: Pick<
    RunState,
    "graphRef" | "statesRef" | "positionsRef" | "setGraph" | "setStates" | "setPositions"
  >,
  select: (id: string) => void,
  open: (node: ConceptNode, state: NodeState) => void,
): (fromId: string) => void {
  const { graphRef, statesRef, positionsRef, setGraph, setStates, setPositions } = run;
  return useCallback(
    (fromId: string) => {
      const spawned = spawnDepth(graphRef.current, statesRef.current, fromId);
      if (!spawned) return;
      const { node } = spawned;
      if (spawned.graph !== graphRef.current) {
        // Through the ref too: the phase opened below reads the graph this tick.
        graphRef.current = spawned.graph;
        setGraph((g) => spawnDepth(g, statesRef.current, fromId)?.graph ?? g);
        setStates((prev) => ({ ...prev, [node.id]: "unknown" }));
        // Where its base is drawn, so centring on the level centres on the dot.
        const at = positionsRef.current[fromId] ?? { x: node.x, y: node.y };
        setPositions((prev) => ({ ...prev, [node.id]: at }));
      }
      select(node.id);
      // Its parent is mastered, so it is on the frontier — before `display`
      // has caught up with the node it has never seen.
      open(node, "frontier");
    },
    [graphRef, statesRef, positionsRef, setGraph, setStates, setPositions, select, open],
  );
}
