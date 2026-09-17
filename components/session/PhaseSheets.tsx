"use client";

// Every per-node phase sheet that postdates the original spiral: the six the
// catalogue added, and the three the domain axis added.
//
// A function rather than a component — these are sibling blocks in AtlasApp's
// render, and wrapping them would put a boundary between the shell and the
// sheet transition it drives. Lifted out because the shell is meant to compose
// hooks and render, and fifteen phases' worth of sheet blocks had buried that.
//
// It takes the four bundles whole rather than forty named props. That is the
// point: a phase added here costs one block, not another dozen names threaded
// through the shell.

import ProduceView from "@/components/session/ProduceView";
import ProvenanceView from "@/components/session/ProvenanceView";
import SteelmanView from "@/components/session/SteelmanView";
import type { ReactNode } from "react";
import DiscriminateView from "@/components/session/DiscriminateView";
import DrillView from "@/components/session/DrillView";
import PerformView from "@/components/session/PerformView";
import PredictView from "@/components/session/PredictView";
import RecallView from "@/components/session/RecallView";
import TraceView from "@/components/session/TraceView";
import type { ConceptGraph, PhaseId } from "@/lib/curriculum";
import type { useSpiral } from "@/components/atlas/useSpiral";
import type { useDerived } from "@/components/atlas/useDerived";

type Spiral = ReturnType<typeof useSpiral>;
type Derived = ReturnType<typeof useDerived>;
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";
import type { PresenceState } from "@/lib/motion";
import type { Screen } from "@/components/atlas/screen";

export function phaseSheets(p: {
  openSheet: Screen | null;
  presence: PresenceState;
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
    presence,
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
  const { discriminate, predict, trace, drill, recall, perform } = sessions;
  const {
    discriminateContent,
    predictContent,
    traceContent,
    drillContent,
    recallContent,
    performContent,
  } = derived;
  const {
    dispatchDiscriminate,
    advanceFromDiscriminate,
    exitDiscriminate,
    dispatchPredict,
    advanceFromPredict,
    exitPredict,
    dispatchTrace,
    advanceFromTrace,
    exitTrace,
    dispatchDrill,
    advanceFromDrill,
    exitDrill,
    dispatchRecall,
    recallSubmit,
    advanceFromRecall,
    exitRecall,
    dispatchPerform,
    performSubmit,
    advanceFromPerform,
    exitPerform,
    domainPhases,
  } = spiral;
  const {
    dispatchProvenance,
    advanceFromProvenance,
    exitProvenance,
    dispatchSteelman,
    steelmanSubmit,
    advanceFromSteelman,
    exitSteelman,
    produceSubmit,
    dispatchProduce,
    advanceFromProduce,
    exitProduce,
  } = domainPhases;
  const { provenance, steelman, produce } = sessions;
  const provenanceContent = provenance
    ? run.provenanceCache[provenance.nodeId]
    : undefined;
  const steelmanContent = steelman ? run.steelmanCache[steelman.nodeId] : undefined;
  const produceContent = produce ? run.produceCache[produce.nodeId] : undefined;
  const titleOf = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.label ?? "Concept";
  return (
    <>
      {openSheet === "discriminate" &&
        discriminate &&
        discriminateContent &&
        sheetBoundary(
          <DiscriminateView
            presence={presence}
            topic={topic}
            title={titleOf(discriminate.nodeId)}
            plan={planOf(discriminate.nodeId)}
            content={discriminateContent}
            session={discriminate}
            onExit={exitDiscriminate}
            onCall={(index, read) => dispatchDiscriminate({ type: "call", index, read })}
            onNext={() => dispatchDiscriminate({ type: "next" })}
            onAdvance={advanceFromDiscriminate}
          />,
        )}

      {openSheet === "predict" &&
        predict &&
        predictContent &&
        sheetBoundary(
          <PredictView
            presence={presence}
            topic={topic}
            title={titleOf(predict.nodeId)}
            plan={planOf(predict.nodeId)}
            content={predictContent}
            session={predict}
            onExit={exitPredict}
            onSure={(level) => dispatchPredict({ type: "sure", level })}
            onCommit={(index, read) => dispatchPredict({ type: "commit", index, read })}
            onNext={() => dispatchPredict({ type: "next" })}
            onAdvance={advanceFromPredict}
          />,
        )}

      {openSheet === "trace" &&
        trace &&
        traceContent &&
        sheetBoundary(
          <TraceView
            presence={presence}
            topic={topic}
            title={titleOf(trace.nodeId)}
            plan={planOf(trace.nodeId)}
            content={traceContent}
            session={trace}
            onExit={exitTrace}
            onStep={(index, read) => dispatchTrace({ type: "step", index, read })}
            onNext={() => dispatchTrace({ type: "next" })}
            onAdvance={advanceFromTrace}
          />,
        )}

      {openSheet === "drill" &&
        drill &&
        drillContent &&
        sheetBoundary(
          <DrillView
            presence={presence}
            topic={topic}
            title={titleOf(drill.nodeId)}
            plan={planOf(drill.nodeId)}
            content={drillContent}
            session={drill}
            onExit={exitDrill}
            onAnswer={(index) => dispatchDrill({ type: "answer", index })}
            onNext={() => dispatchDrill({ type: "next" })}
            onAdvance={advanceFromDrill}
          />,
        )}

      {openSheet === "recall" &&
        recall &&
        recallContent &&
        sheetBoundary(
          <RecallView
            presence={presence}
            title={titleOf(recall.nodeId)}
            plan={planOf(recall.nodeId)}
            content={recallContent}
            session={recall}
            judging={judging}
            onExit={exitRecall}
            onWrite={(value) => dispatchRecall({ type: "write", value })}
            onCue={() => dispatchRecall({ type: "cue" })}
            onSubmit={recallSubmit}
            onAgain={() => dispatchRecall({ type: "again" })}
            onAdvance={advanceFromRecall}
          />,
        )}

      {openSheet === "perform" &&
        perform &&
        performContent &&
        sheetBoundary(
          <PerformView
            presence={presence}
            title={titleOf(perform.nodeId)}
            plan={planOf(perform.nodeId)}
            content={performContent}
            session={perform}
            judging={judging}
            onExit={exitPerform}
            onWork={(value) => dispatchPerform({ type: "work", value })}
            onNudge={() => dispatchPerform({ type: "nudge" })}
            onSubmit={performSubmit}
            onRerun={() => dispatchPerform({ type: "rerun" })}
            onAdvance={advanceFromPerform}
          />,
        )}

      {openSheet === "provenance" &&
        provenance &&
        provenanceContent &&
        sheetBoundary(
          <ProvenanceView
            presence={presence}
            title={titleOf(provenance.nodeId)}
            plan={planOf(provenance.nodeId)}
            content={provenanceContent}
            session={provenance}
            onExit={exitProvenance}
            onRule={(ruling) => dispatchProvenance({ type: "rule", ruling })}
            onNext={() => dispatchProvenance({ type: "next" })}
            onAdvance={advanceFromProvenance}
          />,
        )}

      {openSheet === "steelman" &&
        steelman &&
        steelmanContent &&
        sheetBoundary(
          <SteelmanView
            presence={presence}
            title={titleOf(steelman.nodeId)}
            plan={planOf(steelman.nodeId)}
            content={steelmanContent}
            session={steelman}
            judging={judging}
            onExit={exitSteelman}
            onWrite={(positionId, text) =>
              dispatchSteelman({ type: "write", positionId, text })
            }
            onHold={(positionId, disconfirmer) =>
              dispatchSteelman({ type: "hold", positionId, disconfirmer })
            }
            onSubmit={steelmanSubmit}
            onAdvance={advanceFromSteelman}
          />,
        )}

      {openSheet === "produce" &&
        produce &&
        produceContent &&
        sheetBoundary(
          <ProduceView
            presence={presence}
            title={titleOf(produce.nodeId)}
            plan={planOf(produce.nodeId)}
            content={produceContent}
            session={produce}
            judging={judging}
            onExit={exitProduce}
            onSubmit={produceSubmit}
            onNext={() => dispatchProduce({ type: "next" })}
            onAdvance={advanceFromProduce}
          />,
        )}
    </>
  );
}
