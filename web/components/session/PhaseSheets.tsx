"use client";

// The per-node phase sheets after the reading: Explain and Perform.
//
// A function rather than a component — these are sibling blocks in AtlasApp's
// render, and wrapping them would put a boundary between the shell and the
// sheet transition it drives. Lifted out because the shell is meant to compose
// hooks and render.
//
// It takes the four bundles whole rather than forty named props. That is the
// point: a phase added here costs one block, not another dozen names threaded
// through the shell.

import type { ReactNode } from "react";
import ExplainView from "@/components/session/ExplainView";
import PerformView from "@/components/session/PerformView";
import type { ConceptGraph, PhaseId } from "@/lib/curriculum";
import type { useSpiral } from "@/components/atlas/useSpiral";
import type { useDerived } from "@/components/atlas/useDerived";

type Spiral = ReturnType<typeof useSpiral>;
type Derived = ReturnType<typeof useDerived>;
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { Screen } from "@/components/atlas/screen";

export function phaseSheets(p: {
  openSheet: Screen | null;
  graph: ConceptGraph;
  planOf: (nodeId: string) => readonly PhaseId[];
  judging: boolean;
  sheetBoundary: (node: ReactNode) => ReactNode;
  topic: string;
  /** The four bundles, whole. */
  run: RunState;
  sessions: SessionState;
  spiral: Spiral;
  derived: Derived;
}) {
  const {
    openSheet,
    graph,
    planOf,
    judging,
    sheetBoundary,
    topic,
    run,
    sessions,
    spiral,
    derived,
  } = p;
  const { perform } = sessions;
  const { performContent } = derived;
  const {
    dispatchPerform,
    performSubmit,
    performRerun,
    advanceFromPerform,
    exitPerform,
  } = spiral;
  const { explain } = sessions;
  const explainContent = explain ? run.explainCache[explain.nodeId] : undefined;
  const titleOf = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.label ?? "Concept";
  return (
    <>
      {openSheet === "explain" &&
        explain &&
        explainContent &&
        sheetBoundary(
          <ExplainView
            topic={topic}
            title={titleOf(explain.nodeId)}
            plan={planOf(explain.nodeId)}
            content={explainContent}
            session={explain}
            onExit={spiral.explain.exitExplain}
            onReveal={() => spiral.explain.dispatchExplain({ type: "reveal" })}
            onPick={(index, read) =>
              spiral.explain.dispatchExplain({ type: "pick", index, read })
            }
            onAdvance={() => spiral.explain.advanceFromExplain()}
          />,
        )}

      {openSheet === "perform" &&
        perform &&
        performContent &&
        sheetBoundary(
          <PerformView
            title={titleOf(perform.nodeId)}
            plan={planOf(perform.nodeId)}
            content={performContent}
            session={perform}
            judging={judging}
            onExit={exitPerform}
            onWork={(value) => dispatchPerform({ type: "work", value })}
            onSketch={(value) => dispatchPerform({ type: "sketch", value })}
            onNudge={() => dispatchPerform({ type: "nudge" })}
            onSubmit={performSubmit}
            onRerun={performRerun}
            onFix={(steps) => dispatchPerform({ type: "fix", steps })}
            onAdvance={advanceFromPerform}
          />,
        )}
    </>
  );
}
