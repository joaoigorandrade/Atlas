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
  ConsumeChunk,
  ConsumeModelBeat,
  ExplainSession,
  PerformSession,
  RetainSession,
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
  const [perform, setPerform] = useState<PerformSession | null>(null);
  const [explain, setExplain] = useState<ExplainSession | null>(null);
  const [retain, setRetain] = useState<RetainSession | null>(null);

  const consumeRef = useRef(consume);
  consumeRef.current = consume;
  const liveConsumeRef = useRef(liveConsume);
  liveConsumeRef.current = liveConsume;
  const retainRef = useRef(retain);
  retainRef.current = retain;
  const performRef = useRef(perform);
  performRef.current = perform;
  const explainRef = useRef(explain);
  explainRef.current = explain;
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
    setPerform(null);
    setExplain(null);
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
    perform,
    setPerform,
    performRef,
    explain,
    setExplain,
    explainRef,
    retain,
    setRetain,
    retainRef,
    consumeChunksRef,
    reset,
  };
}
