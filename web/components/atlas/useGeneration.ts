"use client";

// One place where content is asked for.
//
// Two jobs, deliberately in the same module. First, `generate`: the single seam
// every foreground click goes through, so every phase gets the same overlay,
// the same warm-queue join, and the same working retry. Second, one builder per
// kind for the request *inputs* — because a background warm and the click that
// follows it have to hash to the same `content_cache` row, and they only do
// that if exactly one function decides what the inputs are.
//
// The loaders write the run's in-memory cache themselves; callers only decide
// whether to wait.

import { useCallback, useRef } from "react";
import {
  conceptBoundary,
  type AltKey,
  type ConceptNode,
  type ConsumeChunk,
  phasePlan,
  primaryPhase,
  type NodeKind,
  type PhaseId,
  type ExplainContent,
  type PerformContent,
  type NodeState,
} from "@/lib/curriculum";
import {
  consumeRequest,
  fetchConsume,
  fetchConsumeModel,
  fetchExplain,
  fetchPerform,
  fetchSummary,
  explainRequest,
  performRequest,
  summaryRequest,
  WarmDeclined,
} from "@/lib/api";
import type { Language } from "@/lib/i18n";
import type { ErrorContext } from "@/lib/errorCopy";
import type { createWarmQueue } from "@/lib/warm";
import type { RunState } from "@/components/atlas/useRunState";

/** The generated surfaces the warm queue can fetch ahead of a click. Every
 *  phase but Retain, which is the shared review queue rather than a per-node
 *  generation, plus the rail's own one-line summary. */
export type WarmKind = "summary" | Exclude<PhaseId, "retain">;

/**
 * What to have ready for a node, in the order the learner will reach it. Two
 * kinds deep (`depth`) is the useful window: far enough ahead that the next two
 * clicks are instant, near enough that a warm is rarely wasted.
 *
 * Reads the node's own plan rather than mapping state → a fixed pair off the
 * legacy ladder. That mapping pre-generated a Socratic pass for every frontier
 * node — and a `fact` never runs one, so it was paid for and thrown away.
 */
export function warmKindsFor(
  node: { kind?: NodeKind; phasePlan?: readonly PhaseId[] },
  state: NodeState | undefined,
  done: readonly PhaseId[] = [],
  depth = 2,
): WarmKind[] {
  // Locked: nothing to warm until its prerequisites clear.
  if (state === undefined || state === "unknown" || state === "gap") return [];
  const plan = phasePlan(node);
  const next = primaryPhase(plan, done, state);
  return (next ? plan.slice(plan.indexOf(next)) : [])
    .filter((p): p is Exclude<PhaseId, "retain"> => p !== "retain")
    .slice(0, depth);
}

export type Generation = ReturnType<typeof useGeneration>;

/** A background warm declines politely rather than raising — see `WarmDeclined`. */
const opts = (prefetch: boolean) =>
  prefetch ? ({ prefetch: true } as const) : undefined;

/**
 * One surface's loader: fetch it, put it in the run's cache, hand it back.
 *
 * Thirteen of these were the same eight lines with three names changed. That is
 * transport, which is the half the phases are meant to share — the reducers,
 * content shapes and gates stay purpose-built per phase, and nothing here
 * touches any of them.
 *
 * `prev[node.id] ? prev` is load-bearing: a warm that lands after the learner
 * has already opened the surface must not replace what they are reading.
 */
function useNodeLoader<P, T>(
  fetcher: (p: P, o?: { prefetch: true }) => Promise<T>,
  params: (node: ConceptNode) => P,
  set: React.Dispatch<React.SetStateAction<Record<string, T>>>,
) {
  return useCallback(
    async (node: ConceptNode, prefetch = false) => {
      const content = await fetcher(params(node), opts(prefetch));
      set((prev) => (prev[node.id] ? prev : { ...prev, [node.id]: content }));
      return content;
    },
    [fetcher, params, set],
  );
}

export function useGeneration(opts_: {
  run: RunState;
  warm: ReturnType<typeof createWarmQueue>;
  languageRef: React.RefObject<Language>;
  /** The "AI is writing this" overlay — owned by AtlasApp, driven from here. */
  loadingRef: React.RefObject<{ phase: string; message: string } | null>;
  setLoading: (v: { phase: string; message: string } | null) => void;
  showError: (
    err: unknown,
    opts?: { context?: ErrorContext; retry?: () => void },
  ) => void;
}) {
  const { run, warm, languageRef, loadingRef, setLoading, showError } = opts_;
  const {
    formRef,
    graphRef,
    statesRef,
    consumeCacheRef,
    performCacheRef,
    explainCacheRef,
    setGraph,
    setSummaryFailed,
    setConsumeCache,
    setModelCache,
    setPerformCache,
    setExplainCache,
  } = run;

  // ---- generation plumbing ---------------------------------------------

  /**
   * Run one content generation behind the overlay. `phase`/`message` voice the
   * wait; a failure explains itself and leaves the learner where they were.
   *
   * This is the single seam that gives every phase a working retry. Each caller
   * already hands over the exact `key` and `fetcher`, so the "Try again" button
   * on the toast is those same two things run again — after dropping the key,
   * because the queue remembers a failed attempt long enough to replay its
   * rejection to the next caller.
   */
  const generate = useCallback(
    <T>(
      key: string,
      phase: string,
      message: string,
      fetcher: () => Promise<T>,
      onReady: (content: T) => void,
      fresh = false, // ask again rather than join a landed warm — a solved problem
      onFail?: (err: unknown) => boolean, // true: handled elsewhere, no toast
    ) => {
      if (loadingRef.current) return;
      if (fresh) warm.drop(key);
      const ticket = ++ticketRef.current; // `cancelGenerate` moves it on
      const live = () => ticket === ticketRef.current;
      setLoading({ phase, message });
      // Through the warm queue: if this content is already being fetched in
      // the background, the click joins that request instead of paying for a
      // second one — the overlay only covers what's left of it.
      warm
        .run(key, fetcher, true)
        .catch((err: unknown) => {
          // The background attempt came back empty (a silent warm failure);
          // a real click can't inherit that, so ask again in the foreground.
          if (!(err instanceof WarmDeclined)) throw err;
          warm.drop(key);
          return warm.run(key, fetcher, true);
        })
        .then((content) => live() && onReady(content))
        .catch((err: unknown) => {
          if (!live() || onFail?.(err)) return;
          showError(err, {
            context: "content",
            retry: () => {
              warm.drop(key);
              generateRef.current(key, phase, message, fetcher, onReady);
            },
          });
        })
        .finally(() => live() && setLoading(null));
    },
    [showError, warm, loadingRef, setLoading],
  );
  const ticketRef = useRef(0);
  /** The overlay's way out. The request still lands in the warm cache; only
   *  its "open the screen" is dropped, so leaving can't be overruled later. */
  const cancelGenerate = useCallback(() => {
    ticketRef.current++;
    setLoading(null);
  }, [setLoading]);

  // `generate` retries itself from the toast, so it needs a handle on its own
  // latest identity — the button is pressed long after this render.
  const generateRef = useRef(generate);
  generateRef.current = generate;

  /** Direct (solid-edge) prerequisite nodes of a node. */
  const prereqNodesOf = useCallback(
    (nodeId: string): ConceptNode[] => {
      const g = graphRef.current;
      return g.edges
        .filter(([, to, dashed]) => to === nodeId && !dashed)
        .map(([from]) => g.nodes.find((n) => n.id === from))
        .filter((n): n is ConceptNode => !!n);
    },
    [graphRef],
  );

  /** Direct (solid-edge) prerequisite labels of a node — grounds the prompts. */
  const prereqLabelsOf = useCallback(
    (nodeId: string): string[] => prereqNodesOf(nodeId).map((n) => n.label),
    [prereqNodesOf],
  );

  /**
   * The map around a node: what earlier concepts already taught, what later
   * ones own (`conceptBoundary`). Every per-node generation takes it, so a
   * pass is written knowing it is one concept in a map rather than the only
   * thing the learner will ever read. Derived here, once, because it is part
   * of the cache key — a warm and the click after it must hash the same list.
   */
  const boundaryOf = useCallback(
    (nodeId: string) => conceptBoundary(graphRef.current, nodeId),
    [graphRef],
  );

  /** Labels the learner has actually learned — context for transfer problems. */
  const learnedLabels = useCallback((): string[] => {
    const g = graphRef.current;
    return g.nodes
      .filter((n) => !n.gap && statesRef.current[n.id] === "mastered")
      .map((n) => n.label);
  }, [graphRef, statesRef]);

  /**
   * The seven fields every per-node generation sends, built once.
   *
   * This is the invariant the whole content cache rests on, made literal: a
   * background warm and the click that follows it must derive their inputs
   * from the SAME function, or the two hash to different `content_cache` rows
   * and the learner pays for the generation twice. Sixteen hand-written copies
   * of these fields was sixteen chances for one of them to drift.
   */
  const nodeParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      interests: formRef.current.interests,
      language: languageRef.current,
      ...boundaryOf(node.id),
      nodeKind: node.kind,
      domain: node.domain,
    }),
    [boundaryOf, formRef, languageRef],
  );

  // ---- one source of truth per generation -------------------------------
  // Each surface's inputs are built in exactly one place, so a background warm
  // and the click that follows it hash to the same `content_cache` row. Every
  // loader writes the in-memory cache itself; callers only decide whether to
  // wait for it.

  const consumeParams = useCallback(
    (node: ConceptNode) => ({
      ...nodeParams(node),
      prereqLabels: prereqLabelsOf(node.id),
    }),
    [prereqLabelsOf, nodeParams],
  );

  /** The backfilled sentence for a node that arrived without one. Deliberately
   *  free of `interests`: the rail says what the concept IS, which is the same
   *  for every learner on this topic — keying on interests would fork the
   *  shared cache row for no gain. */
  const summaryParams = useCallback(
    (node: ConceptNode) => ({
      topic: formRef.current.topic,
      nodeId: node.id,
      nodeLabel: node.label,
      prereqLabels: prereqLabelsOf(node.id),
      language: languageRef.current,
    }),
    [prereqLabelsOf, formRef, languageRef],
  );

  /**
   * One lens over one section, as it sits on screen.
   *
   * The section's own prose is an input, not just context: the cache key
   * hashes it, so every learner reading the same cached section shares the
   * row — and a walkthrough can never be grafted onto a differently-worded
   * generation of "the same" section (the reading runs at temperature 0.6).
   */
  const modelParams = useCallback(
    (node: ConceptNode, chunk: ConsumeChunk, lens: AltKey) => ({
      topic: formRef.current.topic,
      nodeId: node.id,
      variant: `${chunk.id}:${lens}`,
      nodeLabel: node.label,
      lens,
      kicker: chunk.kicker,
      sectionBody: chunk.body,
      takeaway: chunk.takeaway,
      interests: formRef.current.interests,
      language: languageRef.current,
    }),
    [formRef, languageRef],
  );

  // Explain and Perform each get their own loader over the node's params.
  const loadPerform = useNodeLoader(fetchPerform, nodeParams, setPerformCache);

  const loadExplain = useNodeLoader(fetchExplain, nodeParams, setExplainCache);

  /** Warm-queue / in-memory cache address for one node's surface. */
  const warmKey = (kind: WarmKind, nodeId: string) => `${kind}:${nodeId}`;

  /**
   * Write a backfilled sentence onto its node.
   *
   * It lands in the graph rather than in a side cache, which is what makes it
   * permanent: the graph is the run snapshot, so the sentence is saved with it
   * and the node is never summary-less again. Never overwrites one the node
   * already has — a map's own sentence outranks a backfill.
   */
  const applySummary = useCallback(
    (nodeId: string, summary: string) => {
      const text = summary.trim();
      if (!text) return;
      setGraph((g) =>
        g.nodes.some((n) => n.id === nodeId && !n.summary)
          ? {
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === nodeId && !n.summary ? { ...n, summary: text } : n,
              ),
            }
          : g,
      );
    },
    [setGraph],
  );

  const loadSummary = useCallback(
    async (node: ConceptNode, prefetch = false) => {
      // A fresh attempt un-marks a previous failure: the rail goes back to
      // showing the sentence being written.
      setSummaryFailed((prev) => {
        if (!prev[node.id]) return prev;
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
      try {
        const summary = await fetchSummary(summaryParams(node), opts(prefetch));
        applySummary(node.id, summary);
        return summary;
      } catch (err) {
        setSummaryFailed((prev) => (prev[node.id] ? prev : { ...prev, [node.id]: true }));
        throw err;
      }
    },
    [summaryParams, applySummary, setSummaryFailed],
  );

  const loadConsume = useNodeLoader(fetchConsume, consumeParams, setConsumeCache);

  /** A model view's address, in the warm queue and in `modelCache` alike. */
  const modelKey = (nodeId: string, chunkId: string, lens: AltKey) =>
    `model:${nodeId}:${chunkId}:${lens}`;

  const loadModel = async (
    node: ConceptNode,
    chunk: ConsumeChunk,
    lens: AltKey,
    prefetch = false,
  ) => {
    const beats = await fetchConsumeModel(modelParams(node, chunk, lens), opts(prefetch));
    const key = modelKey(node.id, chunk.id, lens);
    setModelCache((prev) => (prev[key] ? prev : { ...prev, [key]: beats }));
    return beats;
  };

  /** Already in memory? Then the screen opens with no request at all. */
  const isCached = useCallback(
    (kind: WarmKind, nodeId: string): boolean => {
      switch (kind) {
        case "summary":
          // The node's own sentence *is* the cache — once it's on the graph
          // there is nothing left to want.
          return !!graphRef.current.nodes.find((n) => n.id === nodeId)?.summary;
        case "consume":
          return !!consumeCacheRef.current[nodeId];
        case "perform":
          return !!performCacheRef.current[nodeId];
        case "explain":
          return !!explainCacheRef.current[nodeId];
      }
    },
    [consumeCacheRef, graphRef, performCacheRef, explainCacheRef],
  );

  /** The request body `/api/content` batches to answer "is this already
   *  generated?" — the same body the real call posts. */
  const requestFor = useCallback(
    (kind: WarmKind, node: ConceptNode): Record<string, unknown> | null => {
      switch (kind) {
        case "summary":
          // A gap sub-node is not a concept to define: its summary is the
          // reason the re-planner split it out, and where an older run has
          // none, the "spawned from a detected failure" line is the true
          // thing to say — not a definition written for a misconception.
          return node.gap ? null : summaryRequest(summaryParams(node));
        case "consume":
          return consumeRequest(consumeParams(node));
        case "perform":
          return performRequest(nodeParams(node));
        case "explain":
          return explainRequest(nodeParams(node));
      }
    },
    [summaryParams, consumeParams, nodeParams],
  );

  /** Take a batch-cache hit straight into memory — no model, no waiting. */
  const applyWarmHit = (kind: WarmKind, nodeId: string, payload: unknown) => {
    const p = payload as Record<string, unknown>;
    const put = <T>(
      set: React.Dispatch<React.SetStateAction<Record<string, T>>>,
      value: T | undefined,
    ) => {
      if (value === undefined) return;
      set((prev) => (prev[nodeId] ? prev : { ...prev, [nodeId]: value }));
    };
    switch (kind) {
      case "summary":
        // Not a per-node cache but the node itself — see `applySummary`.
        if (typeof p.summary === "string") applySummary(nodeId, p.summary);
        return;
      case "consume":
        return put(setConsumeCache, p.chunks as ConsumeChunk[] | undefined);
      case "perform":
        return put(setPerformCache, p.content as PerformContent | undefined);
      case "explain":
        return put(setExplainCache, p.content as ExplainContent | undefined);
    }
  };

  /** Queue one surface for background generation. Silent either way. */
  const warmOne = useCallback(
    (kind: WarmKind, node: ConceptNode) => {
      if (isCached(kind, node.id)) return;
      if (!requestFor(kind, node)) return;
      const key = warmKey(kind, node.id);
      switch (kind) {
        case "summary":
          return warm.warm(key, () => loadSummary(node, true));
        case "consume":
          return warm.warm(key, () => loadConsume(node, true));
        case "perform":
          return warm.warm(key, () => loadPerform(node, true));
        case "explain":
          return warm.warm(key, () => loadExplain(node, true));
      }
    },
    [isCached, requestFor, warm, loadSummary, loadConsume, loadPerform, loadExplain],
  );

  return {
    generate,
    cancelGenerate,
    generateRef,
    prereqNodesOf,
    prereqLabelsOf,
    boundaryOf,
    learnedLabels,
    consumeParams,
    summaryParams,
    modelParams,
    nodeParams,
    warmKey,
    opts,
    applySummary,
    loadSummary,
    loadConsume,
    modelKey,
    loadModel,
    loadPerform,
    loadExplain,
    isCached,
    requestFor,
    applyWarmHit,
    warmOne,
  };
}
