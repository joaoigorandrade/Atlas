"use client";

// The run: everything one learner's map is made of, and everything that reads
// or writes it to Supabase.
//
// This is the persisted half of AtlasApp's state — the graph, the mastery
// states, the per-phase progress, the FSRS card store, and the generated
// content cached for the run — together with the two debounced writers that
// keep it on the server and the loader that brings it back. `useSessionState`
// owns the transient other half.
//
// Every state here has a ref beside it. The phase handlers read the run at
// call time from inside callbacks that must not re-create themselves per
// keystroke, and a ref is the only stable way to do that.
//
// Every function returned from here is useCallback-stable, without exception:
// `applyRun` is a dependency of the mount hydrate, so an unstable identity
// anywhere in its chain re-runs the hydrate on every render.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FORM,
  emptyGraph,
  freshAdherence,
  removeNode,
  rolloverAdherence,
  spawnGap,
  type AdherenceState,
  type CalibSample,
  type ConceptGraph,
  type ConsumeChunk,
  type ConsumeModelBeat,
  type ConsumeProgress,
  type ConnectSession,
  type CrucibleContent,
  type ElaborationContent,
  type FeynmanBeat,
  type FeynmanSession,
  type GapSpec,
  type MisconceptionRecord,
  type ModalityTally,
  type OnboardingForm,
  type RetainContent,
  type ShakyReason,
  type SocraticSession,
  type SocraticStep,
  type StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import type { Language } from "@/lib/i18n";
import type { Screen } from "@/components/atlas/screen";
import {
  listRuns,
  loadRunBySubject,
  loadRunCaches,
  loadRunCore,
  saveRun,
  saveRunCaches,
  type LoadedRun,
  type RunCaches,
  type RunSnapshot,
  type RunSummary,
} from "@/lib/persistence";
import { logWarning } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import type { ErrorContext } from "@/lib/errorCopy";
import type { createWarmQueue } from "@/lib/warm";

export type RunState = ReturnType<typeof useRunState>;

export function useRunState(opts: {
  supabase: SupabaseClient;
  warm: ReturnType<typeof createWarmQueue>;
  /** The run is only written while a real map is on screen — see `runActive`. */
  screen: Screen;
  excluding: boolean;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  showError: (
    err: unknown,
    opts?: { context?: ErrorContext; retry?: () => void },
  ) => void;
  /** Drop every open phase session — a half-written teach-back belongs to the
   *  map it was about, not to the one being switched to. */
  resetSessions: () => void;
  /** …and the onboarding/selection state that is neither run nor session:
   *  the selected node, the diagnostic, the momentum replay, the upload. */
  resetTransient: () => void;
  /** Initial run core, already read on the server (see app/page.tsx). */
  initialRun?: LoadedRun | null;
}) {
  const {
    supabase,
    warm,
    screen,
    excluding,
    setScreen,
    showError,
    resetSessions,
    resetTransient,
    initialRun,
  } = opts;

  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);
  // The graph itself is state: it arrives generated from the AI during
  // onboarding, and Phase 1 (Plan) restructures it live afterwards.
  const [graph, setGraph] = useState<ConceptGraph>(emptyGraph);
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(() => new Set());
  // Nodes whose missing sentence could not be written. A node's summary
  // normally arrives with the map; the ones that didn't (a run built before
  // summaries, or a sentence the generation dropped) are backfilled, and the
  // rail shows the shape of the sentence while that lands. This is what stops
  // that from being forever: a node in here has been tried and failed, so the
  // rail falls back to its state copy instead of shimmering at nothing.
  const [summaryFailed, setSummaryFailed] = useState<Record<string, true>>({});
  const [states, setStates] = useState<StateMap>({});
  /** The language this run's content is actually written in, as opposed to the
   *  one the UI happens to be showing. Undefined when genuinely unknown — a
   *  pre-v9 snapshot never recorded it, and guessing from the reader's device
   *  would freeze the wrong answer on exactly the maps that need fixing. Set
   *  only where it is known: a build, a deliberate switch, or a restored run
   *  that carried one. */
  const [runLanguage, setRunLanguage] = useState<Language | undefined>(undefined);
  // Per-node generated content, cached for the run so re-entering a phase
  // doesn't re-bill a generation. Retain is global (one queue per day).
  const [consumeCache, setConsumeCache] = useState<Record<string, ConsumeChunk[]>>({});
  const [socraticCache, setSocraticCache] = useState<Record<string, SocraticStep[]>>({});
  const [feynmanCache, setFeynmanCache] = useState<Record<string, FeynmanBeat[]>>({});
  const [connectCache, setConnectCache] = useState<Record<string, ElaborationContent>>(
    {},
  );
  const [crucibleCache, setCrucibleCache] = useState<Record<string, CrucibleContent>>({});
  // Model views (a lens opened over one section of the reading), keyed by
  // `modelKey`. Per (node, section, lens) rather than per node: a learner opens
  // one lens on the section that didn't land, not twenty across the pass.
  const [modelCache, setModelCache] = useState<Record<string, ConsumeModelBeat[]>>({});
  const [retainContent, setRetainContent] = useState<RetainContent | null>(null);
  // Where the learner got to in each node's reading pass, persisted (§6). The
  // live `consume` session above is this plus the transient UI bits; this is
  // what a refresh, a re-entry, the map and the phase spiral all read.
  const [consumeProgress, setConsumeProgress] = useState<Record<string, ConsumeProgress>>(
    {},
  );
  // Which lens this learner keeps opening, run-wide — the evidence behind
  // the adaptive-modality default.
  const [modalityTally, setModalityTally] = useState<ModalityTally>({});
  // …and the unfinished ones, per node, persisted so re-entering a pass lands
  // back on the probe the learner stopped at with the transcript intact.
  const [socraticProgress, setSocraticProgress] = useState<
    Record<string, SocraticSession>
  >({});
  // …and the unfinished teach-backs, per node, persisted for the same reason
  // Socratic's are: a Gap Report is somewhere to come back to, not something
  // to re-earn by teaching the whole concept again.
  const [feynmanProgress, setFeynmanProgress] = useState<Record<string, FeynmanSession>>(
    {},
  );
  // …and the unfinished ones, per node, for the same reason Socratic's and
  // Feynman's are kept: links the learner wrote in their own words are work,
  // not something to re-earn because they stepped back to the map.
  const [connectProgress, setConnectProgress] = useState<Record<string, ConnectSession>>(
    {},
  );
  /** What this learner keeps getting wrong, across nodes and across sessions.
   *  The pass state above is discarded the moment a pass finishes; this is the
   *  part worth keeping, and the judge reads it back on every answer. */
  const [misconceptions, setMisconceptions] = useState<MisconceptionRecord[]>([]);
  // §13 Adherence — starts honest: no fabricated streak, one freeze banked.
  const [adherence, setAdherence] = useState<AdherenceState>(freshAdherence);
  // Labels of nodes that reached Mastered this session run.
  const [litToday, setLitToday] = useState<string[]>([]);
  // §12 Calibration — live confidence-vs-performance readings, captured from
  // the Crucible's confidence gate and Review's pre-flip taps. Starts empty.
  const [calibSamples, setCalibSamples] = useState<CalibSample[]>([]);
  // How each Shaky node got that way — the honest confidence line (#14).
  const [shakyReasons, setShakyReasons] = useState<Record<string, ShakyReason>>({});
  // Nodes with at least one review graded good+ — gates "Retained ✓" (#13).
  const [reviewedNodes, setReviewedNodes] = useState<string[]>([]);
  // The persisted FSRS card store (#21) — the review queue's single source.
  const [cards, setCards] = useState<StoredCard[]>([]);
  // False until the saved run's CORE (graph, states, positions) has been
  // fetched — nothing renders before then, so a resumed run never flashes the
  // welcome screen. The generated content arrives separately, behind the map.
  const [hydrated, setHydrated] = useState(false);
  // False only while a saved run's caches are still in flight. The caches
  // writer is gated on it: without the gate its 4s debounce could fire before
  // (or instead of, on a failed load) the background read landed, upserting an
  // empty `caches` object over every rubric, chunk and elaboration the row
  // held. A run with nothing to load — a map built this session — starts true.
  const [cachesLoaded, setCachesLoaded] = useState(true);
  /**
   * True once a debounced write has failed every attempt it was given.
   *
   * This is the most damaging failure in the app and it used to be a
   * `console.warn`: the learner keeps working, the map keeps updating, and none
   * of it is being persisted. It gets a quiet, permanent chip rather than a
   * toast — a toast that fired every 1.2s would be unusable, and the next
   * debounce tick is already a retry.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );

  const graphRef = useRef(graph);
  graphRef.current = graph;
  const formRef = useRef(form);
  formRef.current = form;
  const statesRef = useRef(states);
  statesRef.current = states;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const consumeCacheRef = useRef(consumeCache);
  consumeCacheRef.current = consumeCache;
  const modelCacheRef = useRef(modelCache);
  modelCacheRef.current = modelCache;
  const socraticCacheRef = useRef(socraticCache);
  socraticCacheRef.current = socraticCache;
  const feynmanCacheRef = useRef(feynmanCache);
  feynmanCacheRef.current = feynmanCache;
  const connectCacheRef = useRef(connectCache);
  connectCacheRef.current = connectCache;
  const crucibleCacheRef = useRef(crucibleCache);
  crucibleCacheRef.current = crucibleCache;
  const retainContentRef = useRef(retainContent);
  retainContentRef.current = retainContent;
  const consumeProgressRef = useRef(consumeProgress);
  consumeProgressRef.current = consumeProgress;
  const modalityTallyRef = useRef(modalityTally);
  modalityTallyRef.current = modalityTally;
  const socraticProgressRef = useRef(socraticProgress);
  socraticProgressRef.current = socraticProgress;
  const feynmanProgressRef = useRef(feynmanProgress);
  feynmanProgressRef.current = feynmanProgress;
  const connectProgressRef = useRef(connectProgress);
  connectProgressRef.current = connectProgress;
  const misconceptionsRef = useRef(misconceptions);
  misconceptionsRef.current = misconceptions;

  // ---- the mutators the phases reach for ---------------------------------

  const setShakyReason = useCallback((id: string, reason: ShakyReason) => {
    setShakyReasons((prev) => ({ ...prev, [id]: reason }));
  }, []);

  /** Merge a felt/real reading into the live calibration set (running average). */
  const recordCalib = useCallback((nodeId: string, felt: number, real: number) => {
    setCalibSamples((prev) => {
      const existing = prev.find((s) => s.id === nodeId);
      if (!existing) return [...prev, { id: nodeId, felt, real }];
      return prev.map((s) =>
        s.id === nodeId
          ? {
              id: nodeId,
              felt: Math.round((s.felt + felt) / 2),
              real: Math.round((s.real + real) / 2),
            }
          : s,
      );
    });
  }, []);

  /**
   * The re-plan restructure: hang a generated gap sub-node under its parent —
   * new red node, dashed edge, assemble animation. Idempotent per spec id.
   */
  const attachGap = useCallback((parentId: string, spec: GapSpec): boolean => {
    const parent = graphRef.current.nodes.find((n) => n.id === parentId);
    const base = positionsRef.current[parentId];
    if (!parent || !base) return false;
    if (graphRef.current.nodes.some((n) => n.id === spec.id)) return false;
    setGraph((g) => spawnGap(g, parentId, spec));
    setStates((prev) => ({ ...prev, [spec.id]: "gap" }));
    setPositions((prev) => ({
      ...prev,
      [spec.id]: { x: base.x + spec.dx, y: base.y + spec.dy },
    }));
    setSpawnedIds((prev) => new Set(prev).add(spec.id));
    return true;
  }, []);

  /** Remove a resolved gap node and every trace of it from the run state. */
  const removeGapNode = useCallback((gapId: string) => {
    setGraph((g) => removeNode(g, gapId));
    setPositions((prev) => {
      if (!prev[gapId]) return prev;
      const nextPos = { ...prev };
      delete nextPos[gapId];
      return nextPos;
    });
    setSpawnedIds((prev) => {
      if (!prev.has(gapId)) return prev;
      const nextIds = new Set(prev);
      nextIds.delete(gapId);
      return nextIds;
    });
    setStates((prev) => {
      if (!(gapId in prev)) return prev;
      const nextStates = { ...prev };
      delete nextStates[gapId];
      return nextStates;
    });
  }, []);

  /**
   * Drop every cached generation.
   *
   * Its own helper because a language switch needs exactly this and nothing
   * more: the content was written in the old language and has to go, but the
   * learner's progress through it is language-independent and must not.
   */
  const clearCaches = useCallback(() => {
    setConsumeCache({});
    setModelCache({});
    setSocraticCache({});
    setFeynmanCache({});
    setConnectCache({});
    setCrucibleCache({});
    setRetainContent(null);
  }, []);

  /** Everything a brand-new map has to wipe: the previous run's content, the
   *  previous run's progress, and the previous run's readings. Shared by "build
   *  a new map" and "exclude this topic". */
  const clearRun = useCallback(() => {
    clearCaches();
    setConsumeProgress({});
    setModalityTally({});
    setSocraticProgress({});
    setFeynmanProgress({});
    setConnectProgress({});
    setMisconceptions([]);
    setCalibSamples([]);
    setShakyReasons({});
    setReviewedNodes([]);
    setCards([]);
    setLitToday([]);
    setSummaryFailed({});
  }, [clearCaches]);

  // ---- persistence (§17) -----------------------------------------------
  // One coarse snapshot per (user, subject) in Supabase `run_states`.
  // Load once on mount; a saved run resumes straight onto the map.

  /** Apply loaded content without clobbering anything generated since: a
   *  cache entry already in memory is the fresher one. */
  const applyCaches = useCallback((c: RunCaches) => {
    const merge =
      <T>(loaded: Record<string, T>) =>
      (prev: Record<string, T>): Record<string, T> => ({ ...loaded, ...prev });
    setConsumeCache(merge(c.consume));
    setModelCache(merge(c.models));
    setSocraticCache(merge(c.socratic));
    setFeynmanCache(merge(c.feynman));
    setConnectCache(merge(c.connect));
    setCrucibleCache(merge(c.crucible));
    setRetainContent((prev) => prev ?? c.retain);
  }, []);

  /**
   * Apply a loaded run as the live one, dropping any other run's in-progress
   * session state first — this is also what "switch map" from the dashboard
   * grid runs, not just the initial mount hydrate.
   */
  const applyRun = useCallback(
    (row: LoadedRun) => {
      warm.clear();
      resetSessions();
      resetTransient();
      setConsumeCache({});
      setModelCache({});
      setSocraticCache({});
      setFeynmanCache({});
      setConnectCache({});
      setCrucibleCache({});
      setRetainContent(null);
      setConsumeProgress({});
      setModalityTally({});
      setSocraticProgress({});
      setFeynmanProgress({});
      setConnectProgress({});
      setMisconceptions([]);

      const s = row.snapshot;
      // The run's language wins over the device's. UI language is detected
      // per-browser (`navigator.language`), so the same pt-BR map opened on an
      // en-US machine used to present as English to everything downstream —
      // most audibly read-aloud, which picked the English voice and model for
      // Portuguese prose and paid for a second cache key to do it. Adopting is
      // also the cheap direction: the alternative, regenerating the whole run
      // into the device's language, throws away content the learner owns.
      //
      // Recorded, not applied: the effect above owns which language wins, and
      // it waits for detection to settle before deciding. Applying it here
      // would race that — this runs during hydration, before the detected
      // language has even landed.
      setRunLanguage(s.language);
      setForm(s.form);
      setGraph(s.graph);
      setStates(s.states);
      setPositions(s.positions);
      setSpawnedIds(new Set(s.spawnedIds));
      // Judge every day that passed while the tab was closed (#22) —
      // a new calendar day also clears yesterday's litToday list.
      const rolled = rolloverAdherence(s.adherence);
      setAdherence(rolled);
      setLitToday(rolled.lastDay === s.adherence.lastDay ? s.litToday : []);
      setCalibSamples(s.calibSamples);
      setShakyReasons(s.shakyReasons);
      setReviewedNodes(s.reviewedNodes);
      setCards(s.cards);
      setConsumeProgress(s.consumeProgress);
      setModalityTally(s.modalityTally);
      setSocraticProgress(s.socraticProgress);
      setFeynmanProgress(s.feynmanProgress);
      setConnectProgress(s.connectProgress);
      setMisconceptions(s.misconceptions);
      setScreen("map");
      // A pre-v3 row still carries its caches inline; take them and skip
      // the second query.
      if (row.inlineCaches) {
        applyCaches(row.inlineCaches);
        return;
      }
      setCachesLoaded(false);
      withRetry(() => loadRunCaches(supabase, row.subject))
        .then((c) => {
          applyCaches(c);
          setCachesLoaded(true);
        })
        // Genuinely non-fatal for *reading*: the map is already drawn and every
        // phase regenerates (the shared `content_cache` still has them, so it
        // is a round-trip, not a re-generation). Logged so a persistent failure
        // is findable, not toasted — nothing the learner can do about it.
        //
        // `cachesLoaded` deliberately stays false: we know this row holds
        // content we failed to read, and writing what we have over it would
        // turn a failed read into permanent data loss. This run stops saving
        // caches; the next load gets another chance at the row.
        .catch((err: unknown) => logWarning("load_caches_failed", err));
    },
    [warm, applyCaches, supabase, resetSessions, resetTransient, setScreen],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrate = (row: LoadedRun | null) => {
      if (cancelled) return;
      if (row) applyRun(row);
      setHydrated(true);
    };

    // The server already read the core and shipped it with the HTML, so the
    // map draws on the first commit instead of after a round-trip.
    if (initialRun !== undefined) {
      hydrate(initialRun);
      return () => {
        cancelled = true;
      };
    }

    // Two loads, deliberately: the core is what the map draws, so it is the
    // only thing the first paint waits on. The generated content — by far the
    // larger half — streams in behind an already-interactive map.
    loadRunCore(supabase)
      .then(hydrate)
      .catch((err: unknown) => {
        // A failed load must not brick the app — start fresh and say so.
        if (cancelled) return;
        setHydrated(true);
        showError(err, { context: "load" });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, showError, applyRun, initialRun]);

  const runActive =
    hydrated &&
    !excluding &&
    graph.nodes.length > 0 &&
    screen !== "welcome" &&
    screen !== "building" &&
    screen !== "diagnostic";
  const runSubject = form.topic.trim() || "Untitled";

  /** Every saved map, for the dashboard's "Your maps" grid. Refreshed each
   *  time the dashboard is entered, so a newly built or excluded map is never
   *  more than one nav away from correct. */
  const [maps, setMaps] = useState<RunSummary[]>([]);
  /** Set when the grid is empty because the query failed, not because there
   *  are no maps — two states that looked identical before. */
  const [mapsFailed, setMapsFailed] = useState(false);
  const refreshMaps = useCallback(() => {
    listRuns(supabase)
      .then((rows) => {
        setMaps(rows);
        setMapsFailed(false);
      })
      .catch((err: unknown) => {
        logWarning("list_runs_failed", err);
        setMapsFailed(true);
      });
  }, [supabase]);

  /** Open a map from the dashboard grid — a no-op switch for the one already
   *  live, otherwise loads it as the new live run. */
  const switchMap = (subject: string) => {
    if (subject === runSubject) {
      setScreen("map");
      return;
    }
    loadRunBySubject(supabase, subject)
      .then((row) => {
        if (row) applyRun(row);
      })
      .catch((err: unknown) =>
        showError(err, {
          context: "openMap",
          retry: () => switchMapRef.current?.(subject),
        }),
      );
  };
  // The retry button on a failed open re-runs the same switch. Through a ref
  // because the callback has to reference itself, and the toast outlives the
  // render that posted it.
  const switchMapRef = useRef(switchMap);
  switchMapRef.current = switchMap;

  // Write-through, debounced, in two halves (see lib/persistence.ts).
  //
  // The core: small and touched constantly — a node drag alone rewrites
  // `positions` — so it saves on a short debounce.
  useEffect(() => {
    if (!runActive) return;
    const snapshot: RunSnapshot = {
      v: 9,
      form,
      // The run's own language, not the reader's — see `RunSnapshot.language`.
      language: runLanguage,
      graph,
      spawnedIds: [...spawnedIds],
      states,
      positions,
      adherence,
      calibSamples,
      litToday,
      shakyReasons,
      reviewedNodes,
      cards,
      consumeProgress,
      modalityTally,
      socraticProgress,
      feynmanProgress,
      connectProgress,
      misconceptions,
    };
    const timer = setTimeout(() => {
      withRetry(() => saveRun(supabase, runSubject, snapshot))
        .then(() => setSaveFailed(false))
        .catch((err: unknown) => {
          logWarning("save_run_failed", err);
          setSaveFailed(true);
        });
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    runActive,
    runSubject,
    supabase,
    form,
    runLanguage,
    graph,
    spawnedIds,
    states,
    positions,
    adherence,
    calibSamples,
    litToday,
    shakyReasons,
    reviewedNodes,
    cards,
    consumeProgress,
    modalityTally,
    socraticProgress,
    feynmanProgress,
    connectProgress,
    misconceptions,
  ]);

  // The content: large, but only ever changes when a generation lands. Its own
  // effect on a long debounce, so dragging a node no longer re-uploads every
  // chunk the run has ever generated.
  useEffect(() => {
    if (!runActive || !cachesLoaded) return;
    const caches: RunCaches = {
      consume: consumeCache,
      models: modelCache,
      socratic: socraticCache,
      feynman: feynmanCache,
      connect: connectCache,
      crucible: crucibleCache,
      retain: retainContent,
    };
    const timer = setTimeout(() => {
      withRetry(() => saveRunCaches(supabase, runSubject, caches))
        .then(() => setSaveFailed(false))
        .catch((err: unknown) => {
          // The caches are re-generatable and the core write is the one that
          // matters, so this shares the chip rather than earning its own.
          logWarning("save_caches_failed", err);
          setSaveFailed(true);
        });
    }, 4000);
    return () => clearTimeout(timer);
  }, [
    runActive,
    cachesLoaded,
    runSubject,
    supabase,
    consumeCache,
    modelCache,
    socraticCache,
    feynmanCache,
    connectCache,
    crucibleCache,
    retainContent,
  ]);

  return {
    form,
    setForm,
    graph,
    setGraph,
    graphRef,
    spawnedIds,
    setSpawnedIds,
    summaryFailed,
    setSummaryFailed,
    states,
    setStates,
    statesRef,
    positions,
    setPositions,
    positionsRef,
    runLanguage,
    setRunLanguage,
    consumeCache,
    setConsumeCache,
    consumeCacheRef,
    modelCache,
    setModelCache,
    modelCacheRef,
    socraticCache,
    setSocraticCache,
    socraticCacheRef,
    feynmanCache,
    setFeynmanCache,
    feynmanCacheRef,
    connectCache,
    setConnectCache,
    connectCacheRef,
    crucibleCache,
    setCrucibleCache,
    crucibleCacheRef,
    retainContent,
    setRetainContent,
    retainContentRef,
    consumeProgress,
    setConsumeProgress,
    consumeProgressRef,
    modalityTally,
    setModalityTally,
    modalityTallyRef,
    socraticProgress,
    setSocraticProgress,
    socraticProgressRef,
    feynmanProgress,
    setFeynmanProgress,
    feynmanProgressRef,
    connectProgress,
    setConnectProgress,
    connectProgressRef,
    misconceptions,
    setMisconceptions,
    misconceptionsRef,
    adherence,
    setAdherence,
    litToday,
    setLitToday,
    calibSamples,
    setCalibSamples,
    shakyReasons,
    setShakyReasons,
    reviewedNodes,
    setReviewedNodes,
    cards,
    setCards,
    cardsRef,
    formRef,
    hydrated,
    cachesLoaded,
    setCachesLoaded,
    saveFailed,
    setSaveFailed,
    runActive,
    runSubject,
    maps,
    setMaps,
    mapsFailed,
    refreshMaps,
    switchMap,
    applyRun,
    applyCaches,
    setShakyReason,
    recordCalib,
    attachGap,
    removeGapNode,
    clearRun,
    clearCaches,
  };
}
