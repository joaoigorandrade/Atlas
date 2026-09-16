"use client";

// The live phase sessions and the streams feeding them.
//
// This is the transient half of AtlasApp's state: what is open right now, and
// what is still arriving for it. None of it is persisted — `useRunState` owns
// everything that is — and all of it is dropped together whenever a different
// run becomes the live one, which is what `reset` is for.
//
// Each session keeps a ref alongside its state. That is not ceremony: the
// handlers read the session at call time from inside callbacks that must not
// re-create themselves on every keystroke, and a ref is the only stable way to
// do that.

import { useCallback, useRef, useState } from "react";
import type {
  ConnectSession,
  ConsumeChunk,
  ConsumeModelBeat,
  CrucibleSession,
  FeynmanBeat,
  DiscriminateSession,
  DrillSession,
  FeynmanSession,
  PerformSession,
  PredictSession,
  RecallSession,
  TraceSession,
  RetainSession,
  SocraticSession,
  SocraticStep,
} from "@/lib/curriculum";
import type { ConsumeSession } from "@/components/session/ConsumeView";

/** Sections of a reading pass as they stream in, before the full pass is
 *  validated and committed to the run's cache. Held apart so a partial pass
 *  never looks like a cached, instantly-reopenable one to the warm/dedup
 *  logic. Every `live*` field below is the same arrangement for its phase. */
export interface LiveConsume {
  nodeId: string;
  chunks: ConsumeChunk[];
}

export interface LiveModel {
  key: string;
  beats: ConsumeModelBeat[];
  /** Nothing more is coming — the stream finished, or it failed part-way and
   *  what landed is all there is. Without it a view that died mid-stream would
   *  show "still writing…" for as long as the learner left it open. */
  done?: boolean;
}

export type SessionState = ReturnType<typeof useSessionState>;

export function useSessionState() {
  const [consume, setConsume] = useState<ConsumeSession | null>(null);
  const [liveConsume, setLiveConsume] = useState<LiveConsume | null>(null);
  const [liveModel, setLiveModel] = useState<LiveModel | null>(null);
  const [socratic, setSocratic] = useState<SocraticSession | null>(null);
  const [liveSocratic, setLiveSocratic] = useState<{
    nodeId: string;
    steps: SocraticStep[];
  } | null>(null);
  const [feynman, setFeynman] = useState<FeynmanSession | null>(null);
  const [liveFeynman, setLiveFeynman] = useState<{
    nodeId: string;
    beats: FeynmanBeat[];
  } | null>(null);
  const [connect, setConnect] = useState<ConnectSession | null>(null);
  const [crucible, setCrucible] = useState<CrucibleSession | null>(null);
  // The six phases the catalogue added in its growth to twelve. One slot
  // each, like every phase before them.
  const [discriminate, setDiscriminate] = useState<DiscriminateSession | null>(null);
  const [predict, setPredict] = useState<PredictSession | null>(null);
  const [trace, setTrace] = useState<TraceSession | null>(null);
  const [drill, setDrill] = useState<DrillSession | null>(null);
  const [recall, setRecall] = useState<RecallSession | null>(null);
  const [perform, setPerform] = useState<PerformSession | null>(null);
  const [retain, setRetain] = useState<RetainSession | null>(null);

  const consumeRef = useRef(consume);
  consumeRef.current = consume;
  const liveConsumeRef = useRef(liveConsume);
  liveConsumeRef.current = liveConsume;
  const socraticRef = useRef(socratic);
  socraticRef.current = socratic;
  const liveSocraticRef = useRef(liveSocratic);
  liveSocraticRef.current = liveSocratic;
  const feynmanRef = useRef(feynman);
  feynmanRef.current = feynman;
  const liveFeynmanRef = useRef(liveFeynman);
  liveFeynmanRef.current = liveFeynman;
  const crucibleRef = useRef(crucible);
  crucibleRef.current = crucible;
  const retainRef = useRef(retain);
  retainRef.current = retain;
  const discriminateRef = useRef(discriminate);
  discriminateRef.current = discriminate;
  const predictRef = useRef(predict);
  predictRef.current = predict;
  const traceRef = useRef(trace);
  traceRef.current = trace;
  const drillRef = useRef(drill);
  drillRef.current = drill;
  const recallRef = useRef(recall);
  recallRef.current = recall;
  const performRef = useRef(perform);
  performRef.current = perform;
  /** The reading pass on screen — committed sections, or the streaming ones
   *  standing in for them. Assigned once `consumeChunks` is derived. */
  const consumeChunksRef = useRef<ConsumeChunk[]>([]);

  /**
   * Drop every open session. Called when a different run becomes the live one —
   * a half-written teach-back belongs to the map it was about.
   *
   * Stable on purpose: `applyRun` depends on this, the mount hydrate depends on
   * `applyRun`, and a fresh identity each render would re-run the hydrate on
   * every render. Setters are already stable, so the empty array is honest.
   */
  const reset = useCallback(() => {
    setConsume(null);
    setLiveConsume(null);
    setLiveModel(null);
    setSocratic(null);
    setLiveSocratic(null);
    setFeynman(null);
    setLiveFeynman(null);
    setConnect(null);
    setCrucible(null);
    setDiscriminate(null);
    setPredict(null);
    setTrace(null);
    setDrill(null);
    setRecall(null);
    setPerform(null);
    setRetain(null);
  }, []);

  return {
    consume,
    setConsume,
    consumeRef,
    liveConsume,
    setLiveConsume,
    liveConsumeRef,
    liveModel,
    setLiveModel,
    socratic,
    setSocratic,
    socraticRef,
    liveSocratic,
    setLiveSocratic,
    liveSocraticRef,
    feynman,
    setFeynman,
    feynmanRef,
    liveFeynman,
    setLiveFeynman,
    liveFeynmanRef,
    connect,
    setConnect,
    crucible,
    setCrucible,
    crucibleRef,
    discriminate,
    setDiscriminate,
    discriminateRef,
    predict,
    setPredict,
    predictRef,
    trace,
    setTrace,
    traceRef,
    drill,
    setDrill,
    drillRef,
    recall,
    setRecall,
    recallRef,
    perform,
    setPerform,
    performRef,
    retain,
    setRetain,
    retainRef,
    consumeChunksRef,
    reset,
  };
}
