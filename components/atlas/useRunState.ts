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
import {
  DEFAULT_FORM,
  PARETO_DEFAULT,
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
  bootstrap,
  deleteCards as deleteCardsApi,
  loadContent,
  loadTopic,
  patchNodes,
  patchProfile,
  patchTopic,
  putCards,
  type NodeDelta,
  type Profile,
  type RunCaches,
  type Topic,
} from "@/lib/persistence";
import { logWarning } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import type { ErrorContext } from "@/lib/errorCopy";
import type { createWarmQueue } from "@/lib/warm";

export type RunState = ReturnType<typeof useRunState>;

export function useRunState(opts: {
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
  /** Profile + library, already read on the server (see app/page.tsx). */
  initial?: { profile: Profile; topics: Topic[] } | null;
}) {
  const {
    warm,
    screen,
    excluding,
    setScreen,
    showError,
    resetSessions,
    resetTransient,
    initial,
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
  /** The open topic's id — the address every write goes to. Null before the
   *  first load, and while a map is being built but not yet created. */
  const [topicId, setTopicId] = useState<string | null>(null);
  const topicIdRef = useRef<string | null>(null);
  topicIdRef.current = topicId;

  /** What the server last acknowledged, per node / per card / for the topic and
   *  the profile — the baseline every debounced write diffs against. Refs, not
   *  state: nothing renders them, and re-arming the debounce on a successful
   *  save would make the writer chase its own tail. */
  const savedNodesRef = useRef<Record<string, string>>({});
  const savedCardsRef = useRef<Record<string, string>>({});
  const savedTopicRef = useRef("");
  const savedProfileRef = useRef("");
  const targetRef = useRef(DEFAULT_FORM.target);
  targetRef.current = form.target;

  /** Adopt a loaded profile — see `adoptProfile` at the foot of the file. */
  const setProfile = (p: Profile) => adoptProfile(p, setForm, savedProfileRef);

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
    savedNodesRef.current = {};
    savedCardsRef.current = {};
    savedTopicRef.current = "";
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
    (topic: Topic) => {
      setTopicId(topic.id);
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

      // The run's language wins over the device's. UI language is detected
      // per-browser (`navigator.language`), so the same pt-BR map opened on an
      // en-US machine used to present as English to everything downstream —
      // most audibly read-aloud, which picked the English voice and model for
      // Portuguese prose and paid for a second cache key to do it.
      //
      // Recorded, not applied: the effect above owns which language wins, and
      // it waits for detection to settle before deciding.
      setRunLanguage(topic.language ?? undefined);
      setForm({
        topic: topic.subject,
        goal: topic.goal as OnboardingForm["goal"],
        interests: topic.interests,
        paretoPct: topic.paretoPct,
        examDate: topic.examDate,
        target: targetRef.current,
      });
      setGraph(topic.graph);
      setStates(topic.states);
      setPositions(topic.positions);
      setSpawnedIds(new Set(topic.graph.nodes.filter((n) => n.gap).map((n) => n.id)));
      setLitToday(topic.litToday);
      setCalibSamples(topic.calibSamples);
      setShakyReasons(topic.shakyReasons);
      setReviewedNodes(topic.reviewedNodes);
      setCards(topic.cards);
      setConsumeProgress(topic.consumeProgress);
      setModalityTally(topic.modalityTally);
      setSocraticProgress(topic.socraticProgress);
      setFeynmanProgress(topic.feynmanProgress);
      setConnectProgress(topic.connectProgress);
      setMisconceptions(topic.misconceptions);
      setScreen("map");
      // What the server already has, so the first debounce after a load sends
      // nothing. Without this every open would re-upload the whole map it just
      // finished reading.
      savedNodesRef.current = projectNodes(topic);
      savedCardsRef.current = projectCards(topic.cards);
      savedTopicRef.current = projectTopic(topic);

      // Generated content, behind an already-drawn map. Never written back —
      // the server records it as it generates it.
      setCachesLoaded(false);
      withRetry(() => loadContent(topic.id))
        .then((c) => {
          applyCaches(c);
          setCachesLoaded(true);
        })
        // Genuinely non-fatal for reading: the map is already drawn and every
        // phase regenerates (the shared `content_cache` still has them, so it
        // is a round-trip, not a re-generation). Logged so a persistent failure
        // is findable, not toasted — nothing the learner can do about it.
        .catch((err: unknown) => logWarning("load_content_failed", err));
    },
    [warm, applyCaches, resetSessions, resetTransient, setScreen],
  );

  /**
   * One request for everything: profile and library together.
   *
   * This used to be three round trips — the run core, the dashboard list, then
   * the content column — with the first paint waiting on one of them and the
   * grid re-querying every time the dashboard was entered. The library is a few
   * hundred rows, so asking for all of it once is both faster and simpler than
   * asking for parts of it repeatedly.
   */
  useEffect(() => {
    let cancelled = false;
    const hydrate = (payload: { profile: Profile; topics: Topic[] }) => {
      if (cancelled) return;
      setProfile(payload.profile);
      // Judge every day that passed while the tab was closed (#22) — a new
      // calendar day also clears yesterday's litToday list.
      const rolled = rolloverAdherence(payload.profile.adherence);
      setAdherence(rolled);
      setMaps(payload.topics);
      const open = payload.topics[0];
      if (open) {
        applyRun(open);
        if (rolled.lastDay !== payload.profile.adherence.lastDay) setLitToday([]);
      }
      setHydrated(true);
    };

    // The server already ran the same query and shipped it with the HTML, so
    // the map draws on the first commit instead of after a round-trip.
    if (initial !== undefined) {
      if (initial) hydrate(initial);
      else setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    bootstrap()
      .then(hydrate)
      .catch((err: unknown) => {
        // A failed load must not brick the app — start fresh and say so.
        if (cancelled) return;
        setHydrated(true);
        setMapsFailed(true);
        showError(err, { context: "load" });
      });
    return () => {
      cancelled = true;
    };
  }, [showError, applyRun, initial]);

  const runActive =
    hydrated &&
    !excluding &&
    graph.nodes.length > 0 &&
    screen !== "welcome" &&
    screen !== "building" &&
    screen !== "diagnostic";
  const runSubject = form.topic.trim() || "Untitled";

  /** Every saved map, for the dashboard's "Your maps" grid — the same rows the
   *  bootstrap already returned, so entering the dashboard costs nothing. */
  const [maps, setMaps] = useState<Topic[]>([]);
  /** Set when the grid is empty because the load failed, not because there are
   *  no maps — two states that looked identical before. */
  const [mapsFailed, setMapsFailed] = useState(false);
  const refreshMaps = useCallback(() => {
    bootstrap()
      .then((payload) => {
        setMaps(payload.topics);
        setProfile(payload.profile);
        setMapsFailed(false);
      })
      .catch((err: unknown) => {
        logWarning("bootstrap_failed", err);
        setMapsFailed(true);
      });
  }, []);

  /** Open a map from the dashboard grid — a no-op switch for the one already
   *  live, otherwise loads it as the new live run. */
  const switchMap = (subject: string) => {
    if (subject === runSubject) {
      setScreen("map");
      return;
    }
    const row = maps.find((m) => m.subject === subject);
    if (!row) return;
    // The grid's copy is a full topic already, but it was read at bootstrap;
    // re-reading is what makes switching to a map another device has been
    // working on show that work.
    loadTopic(row.id)
      .then(applyRun)
      .catch((err: unknown) =>
        showError(err, {
          context: "openMap",
          retry: () => switchMapRef.current?.(subject),
        }),
      );
  };
  const switchMapRef = useRef(switchMap);
  switchMapRef.current = switchMap;

  // Write-through, debounced, and proportional to what actually changed.
  //
  // There used to be two whole-run uploads here: the snapshot on a 1.2-second
  // debounce and the generated content on a 4-second one, the second existing
  // only so a node drag would stop re-uploading megabytes of chunks. Neither is
  // needed now. Content is never written by a client at all — the server
  // records it as it generates it — and the map is written as deltas, so a drag
  // is one node's coordinates and a graded card is one row.
  //
  // The diff lives here rather than at the mutation sites on purpose: this hook
  // is the single writer, which is what makes "did this get saved?" a question
  // with one place to look. What it compares against is what the server last
  // acknowledged, so a failed write is retried by the next tick rather than
  // being lost to an optimistic bookkeeping update.
  useEffect(() => {
    if (!runActive || !topicId) return;
    const nodes = projectNodes({ graph, states, positions, shakyReasons, reviewedNodes,
      consumeProgress, socraticProgress, feynmanProgress, connectProgress });
    const cardShots = projectCards(cards);
    const topicShot = projectTopic({
      goal: form.goal, interests: form.interests,
      examDate: form.examDate, paretoPct: form.paretoPct ?? PARETO_DEFAULT,
      language: runLanguage ?? null, calibSamples,
      misconceptions, modalityTally, litToday,
    });

    const timer = setTimeout(() => {
      const writes: Array<Promise<unknown>> = [];

      const deltas: NodeDelta[] = [];
      for (const [id, shot] of Object.entries(nodes)) {
        if (savedNodesRef.current[id] === shot) continue;
        const isNew = savedNodesRef.current[id] === undefined;
        deltas.push({
          ...(JSON.parse(shot) as Omit<NodeDelta, "id">),
          id,
          // Only a node the server has never seen needs its edges; an existing
          // one's prerequisites are already rows, and re-sending them on every
          // drag would be the write amplification this replaced.
          ...(isNew
            ? {
                prereqs: graph.edges
                  .filter(([, to]) => to === id)
                  .map(([from]) => from),
              }
            : null),
        });
      }
      const removed = Object.keys(savedNodesRef.current).filter((id) => !(id in nodes));
      if (deltas.length || removed.length)
        writes.push(
          withRetry(() => patchNodes(topicId, deltas, removed)).then(() => {
            savedNodesRef.current = nodes;
          }),
        );

      const changedCards = cards.filter((c) => savedCardsRef.current[c.id] !== cardShots[c.id]);
      const droppedCards = Object.keys(savedCardsRef.current).filter(
        (id) => !(id in cardShots),
      );
      if (changedCards.length)
        writes.push(withRetry(() => putCards(topicId, changedCards)));
      if (droppedCards.length)
        writes.push(withRetry(() => deleteCardsApi(topicId, droppedCards)));
      if (changedCards.length || droppedCards.length)
        writes.push(Promise.resolve().then(() => {
          savedCardsRef.current = cardShots;
        }));

      if (savedTopicRef.current !== topicShot)
        writes.push(
          withRetry(() => patchTopic(topicId, JSON.parse(topicShot))).then(() => {
            savedTopicRef.current = topicShot;
          }),
        );

      if (writes.length === 0) return;
      Promise.all(writes)
        .then(() => setSaveFailed(false))
        .catch((err: unknown) => {
          logWarning("save_run_failed", err);
          setSaveFailed(true);
        });
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    runActive,
    topicId,
    form,
    runLanguage,
    graph,
    states,
    positions,
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

  // The learner's own row — the streak, the daily target, the interface
  // language. Its own writer because it outlives every topic: it used to be
  // copied into each run's snapshot, which is why two topics could disagree
  // about how many days in a row someone had shown up.
  useEffect(() => {
    if (!hydrated) return;
    const shot = JSON.stringify({ dailyTarget: form.target, adherence });
    if (savedProfileRef.current === shot) return;
    const timer = setTimeout(() => {
      withRetry(() => patchProfile({ dailyTarget: form.target, adherence }))
        .then(() => {
          savedProfileRef.current = shot;
          setSaveFailed(false);
        })
        .catch((err: unknown) => {
          logWarning("save_profile_failed", err);
          setSaveFailed(true);
        });
    }, 1200);
    return () => clearTimeout(timer);
  }, [hydrated, form.target, adherence]);

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
    topicId,
    setTopicId,
    topicIdRef,
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

// ---- what a write compares against ---------------------------------------
//
// A node, a card and the topic's own fields, each reduced to the JSON of
// exactly what is persisted about it. Comparing strings is what makes the diff
// one line per row instead of a field-by-field equality function that has to be
// updated every time a column is added — and a string that differs is, by
// construction, a row that has to be written.

/** The persisted projection of every node on the map, keyed by id. */
function projectNodes(run: {
  graph: ConceptGraph;
  states: StateMap;
  positions: Record<string, { x: number; y: number }>;
  shakyReasons: Record<string, ShakyReason>;
  reviewedNodes: string[];
  consumeProgress: Record<string, ConsumeProgress>;
  socraticProgress: Record<string, SocraticSession>;
  feynmanProgress: Record<string, FeynmanSession>;
  connectProgress: Record<string, ConnectSession>;
}): Record<string, string> {
  const reviewed = new Set(run.reviewedNodes);
  const out: Record<string, string> = {};
  for (const node of run.graph.nodes) {
    const at = run.positions[node.id];
    const state = run.states[node.id] ?? node.state ?? "unknown";
    out[node.id] = JSON.stringify({
      label: node.label,
      summary: node.summary ?? undefined,
      g: node.g,
      week: node.week,
      x: at?.x ?? node.x,
      y: at?.y ?? node.y,
      isGap: node.gap === true,
      // `StateMap` is already the stored vocabulary — `frontier` is derived
      // from the prerequisites on every read and never lands in it — so this
      // is a straight copy, with the node's generated seed as the fallback.
      state,
      shakyReason: run.shakyReasons[node.id] ?? null,
      reviewed: reviewed.has(node.id),
      consumeProgress: run.consumeProgress[node.id] ?? null,
      socraticProgress: run.socraticProgress[node.id] ?? null,
      feynmanProgress: run.feynmanProgress[node.id] ?? null,
      connectProgress: run.connectProgress[node.id] ?? null,
    });
  }
  return out;
}

function projectCards(cards: StoredCard[]): Record<string, string> {
  return Object.fromEntries(cards.map((c) => [c.id, JSON.stringify(c)]));
}

function projectTopic(topic: {
  goal: string;
  interests: string;
  paretoPct: number;
  examDate: string;
  language: Language | null;
  calibSamples: CalibSample[];
  misconceptions: MisconceptionRecord[];
  modalityTally: ModalityTally;
  litToday: string[];
}): string {
  return JSON.stringify({
    goal: topic.goal,
    interests: topic.interests,
    paretoPct: topic.paretoPct,
    examDate: topic.examDate,
    ...(topic.language ? { language: topic.language } : null),
    calibSamples: topic.calibSamples,
    misconceptions: topic.misconceptions,
    modalityTally: topic.modalityTally,
    litToday: topic.litToday,
  });
}

/**
 * Adopt a loaded profile.
 *
 * The daily target rides in the form, where every surface already reads it
 * from, and the write baseline is set at the same moment so the first debounce
 * after a load sends nothing back. Outside the hook because it closes over
 * nothing of its own: the setter is stable and the ref is a ref, so keeping it
 * here is what lets both call sites stay memoizable.
 */
function adoptProfile(
  profile: Profile,
  setForm: React.Dispatch<React.SetStateAction<OnboardingForm>>,
  baseline: React.MutableRefObject<string>,
): void {
  setForm((f) => ({ ...f, target: profile.dailyTarget }));
  baseline.current = JSON.stringify({
    dailyTarget: profile.dailyTarget,
    adherence: profile.adherence,
  });
}
