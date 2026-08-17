"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  calibOverCount,
  DIAGNOSTIC_COUNT,
  localDay,
  markTodayMet,
  orderedFrontier,
  reviewCard,
  rolloverAdherence,
  toggleReminder,
  type GapSpec,
  type NodeState,
} from "@/lib/curriculum";
import { createWarmQueue } from "@/lib/warm";
import { type Language, languageAction, useLanguage } from "@/lib/i18n";
import { InkRule } from "@/components/Pending";
import { color, font } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import type { LoadedRun } from "@/lib/persistence";
import BuildingOverlay from "@/components/onboarding/BuildingOverlay";
import DiagnosticPanel from "@/components/onboarding/DiagnosticPanel";
import {
  FAKE_MAP_EDGES,
  FAKE_MAP_NODES,
  FAKE_MAP_POSITIONS,
} from "@/components/onboarding/fakeMap";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import DashboardScreen from "@/components/DashboardScreen";
import ProfileScreen from "@/components/ProfileScreen";
import SettingsScreen from "@/components/SettingsScreen";
import ConsumeView from "@/components/session/ConsumeView";
import SocraticView from "@/components/session/SocraticView";
import FeynmanView from "@/components/session/FeynmanView";
import ConnectView from "@/components/session/ConnectView";
import CrucibleView from "@/components/session/CrucibleView";
import RetainView from "@/components/session/RetainView";
import CalibrationView from "@/components/analytics/CalibrationView";
import GeneratingOverlay from "@/components/GeneratingOverlay";
import LeftRail from "@/components/map/LeftRail";
import MapCanvas from "@/components/map/MapCanvas";
import { useToast } from "@/components/atlas/useToast";
import { useViewport } from "@/components/atlas/useViewport";
import { useCanvas } from "@/components/atlas/useCanvas";
import { useSessionState } from "@/components/atlas/useSessionState";
import { useRunState } from "@/components/atlas/useRunState";
import { useGeneration, warmKindsFor } from "@/components/atlas/useGeneration";
import { useSpiral } from "@/components/atlas/useSpiral";
import { useOnboarding } from "@/components/atlas/useOnboarding";
import { useWarming } from "@/components/atlas/useWarming";
import { useDerived } from "@/components/atlas/useDerived";
import { useNavigation } from "@/components/atlas/useNavigation";
import type { Screen } from "@/components/atlas/screen";
import { exportCardsCsv, exportCardsJson, exportMap } from "@/components/atlas/exporters";
import NodeDetail from "@/components/map/NodeDetail";
import TopBar from "@/components/map/TopBar";
import Toast from "@/components/Toast";
import ScreenTimer from "@/components/ScreenTimer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import OfflineBanner from "@/components/OfflineBanner";
import { ERROR_STRINGS } from "@/lib/errorCopy";

const STRINGS = {
  en: {
    yourTopic: "Your topic",
    hidePlan: "⟨ Hide plan",
    showPlan: "Plan ⟩",
    hideNode: "Hide node ⟩",
    showNode: "⟨ Node",
    thisNode: "This node",
  },
  "pt-BR": {
    yourTopic: "Seu tema",
    hidePlan: "⟨ Ocultar plano",
    showPlan: "Plano ⟩",
    hideNode: "Ocultar nó ⟩",
    showNode: "⟨ Nó",
    thisNode: "Este nó",
  },
} as const;
import { logWarning } from "@/lib/log";
import { useOnline } from "@/lib/online";

export default function AtlasApp({
  userEmail,
  initialRun,
}: {
  userEmail: string;
  /** The saved run's core, already read on the server (see app/page.tsx).
   *  `undefined` means "not provided" — fall back to loading it here; `null`
   *  means "read, and there is no saved run". */
  initialRun?: LoadedRun | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  // The learner's chosen UI language — threaded into every generation/judge
  // call so AI content comes back in it too (a ref, like `formRef` etc.
  // below, so it can be read from stable callbacks without widening their
  // dependency arrays).
  const { language, adoptLanguage, settled, explicit } = useLanguage();
  // The background warm queue: content for the phases just ahead is fetched
  // while the learner works, so entering them is a state change, not a wait.
  // A foreground click on something already warming joins that request rather
  // than starting a second one.
  const warm = useMemo(() => createWarmQueue(), []);
  // The live phase sessions and the streams feeding them.
  const sessions = useSessionState();
  const {
    consume,
    socratic,
    feynman,
    connect,
    crucible,
    retain,
    reset: resetSessions,
  } = sessions;
  const [screen, setScreen] = useState<Screen>("welcome");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The "AI is writing this" overlay, or null.
  const [loading, setLoading] = useState<{
    phase: string;
    message: string;
  } | null>(null);
  // Held so the overlay has copy to render while it fades out.
  const lastLoading = useRef<{ phase: string; message: string } | null>(null);
  if (loading) lastLoading.current = loading;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [momentumPlaying, setMomentumPlaying] = useState(false);
  const [momentumWeek, setMomentumWeek] = useState(0);
  // A server judge round-trip is in flight (#25-#27) — views disable inputs.
  const [judging, setJudging] = useState(false);
  // A dashboard topic exclusion is in flight. State rather than a ref on
  // purpose: it also flips `runActive` off the moment the learner confirms, so
  // the pending save debounces are cleared and no write can re-create the row
  // between the delete landing and the local run being cleared.
  const [excluding, setExcluding] = useState(false);
  // Viewport width drives the minimum responsive pass (#8).
  const { vw, railOpen, setRailOpen, detailOpen, setDetailOpen } = useViewport();
  /** A reading pass whose stream died after some sections had landed. What
   *  arrived stays on screen; this is the notice pinned under it. */
  const [consumeFailed, setConsumeFailed] = useState<{
    nodeId: string;
    retry: () => void;
  } | null>(null);
  const online = useOnline();
  /** Re-runs the judge for a Socratic turn whose grading failed — held here so
   *  the failed bubble can offer it, not just the toast. */
  const [socraticRetry, setSocraticRetry] = useState<(() => void) | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  // Generated content carries the language of the prompt that wrote it and
  // nothing else, so switching language mid-run must drop every cached
  // surface — otherwise the learner keeps reading the old language back out
  // of memory (and out of the saved snapshot) forever.
  const contentLanguageRef = useRef(language);

  const toastChannel = useToast(supabase, languageRef);
  const { toast, dismissToast, showToast, showError } = toastChannel;

  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const judgingRef = useRef(judging);
  judgingRef.current = judging;
  // Gap specs queued by hesitant diagnostic answers, spawned once the map opens.
  const pendingGapsRef = useRef<Array<{ parentId: string; spec: GapSpec }>>([]);
  // Assigned in the derived section below; read by event handlers.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const momentumRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Both boxes are read at cleanup time on purpose — the timers to clear are
    // whatever is outstanding when the component goes away, not whatever was
    // outstanding when it mounted. Captured here so the rule can see that.
    const timers = timersRef.current;
    const momentum = momentumRef;
    return () => {
      timers.forEach(clearTimeout);
      if (momentum.current) clearInterval(momentum.current);
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  /** The onboarding/selection state a run switch has to clear — neither run
   *  state nor session state, so `useRunState` is handed it rather than
   *  reaching for it. */
  const resetOnboardingRef = useRef<() => void>(() => {});
  const resetTransient = useCallback(() => {
    setSelectedId(null);
    pendingGapsRef.current = [];
    setMomentumPlaying(false);
    // Onboarding's own state, through a ref: the run mounts first — onboarding
    // needs it — so this cannot name `useOnboarding`'s reset directly.
    resetOnboardingRef.current();
  }, []);

  // The run: the persisted map, its progress, its cached content, and the
  // loaders and debounced writers that keep all three on the server.
  const run = useRunState({
    supabase,
    warm,
    screen,
    excluding,
    setScreen,
    showError,
    resetSessions,
    resetTransient,
    initialRun,
  });

  const {
    form,
    setForm,
    graph,
    graphRef,
    spawnedIds,
    summaryFailed,
    statesRef,
    positions,
    setPositions,
    positionsRef,
    runLanguage,
    setRunLanguage,
    feynmanCache,
    retainContent,
    consumeProgress,
    setSocraticProgress,
    setFeynmanProgress,
    adherence,
    setAdherence,
    litToday,
    shakyReasons,
    reviewedNodes,
    cardsRef,
    formRef,
    hydrated,
    saveFailed,
    runSubject,
    mapsFailed,
    refreshMaps,
    switchMap,
    clearCaches,
  } = run;

  // ---- day rollover (#22): judge passed days whenever the calendar turns —
  // on load (after hydration applies it too) and once a minute while open.
  useEffect(() => {
    const tick = () => {
      setAdherence((prev) =>
        prev.lastDay && prev.lastDay !== localDay() ? rolloverAdherence(prev) : prev,
      );
    };
    const id = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [setAdherence]);

  // Clearing the daily queue is the honest "done for today" — it marks the day
  // met, so the streak ticks forward and the flame reads lit everywhere.
  useEffect(() => {
    if (retain?.finished) setAdherence((prev) => markTodayMet(prev));
  }, [retain?.finished, setAdherence]);

  const onToggleReminder = () => setAdherence((prev) => toggleReminder(prev));

  const displayRef = useRef<Record<string, NodeState>>({});
  const { view, setView, onWheel, onCanvasDown, onNodeDown, centerOn } = useCanvas({
    setSelectedId,
    displayRef,
    showToast,
    positionsRef,
    setPositions,
  });

  // Which language wins, and whether a change is a *switch* (regenerate) or
  // merely the app working out where it is (leave everything alone).
  //
  // `settled` is what makes this correct: detection needs `window`, so the
  // first render is always the "pt-BR" placeholder and the real language lands
  // an effect later — after this component has already hydrated the run. Acting
  // on that transition treated every device whose locale disagreed with the run
  // as a deliberate language switch, and dropped the caches mid-load.
  useEffect(() => {
    const action = languageAction({
      settled,
      explicit,
      runLanguage,
      language,
      contentLanguage: contentLanguageRef.current,
    });
    if (action === "wait" || action === "none") return;
    if (action === "adopt") {
      // `runLanguage` is defined whenever the decision is "adopt".
      contentLanguageRef.current = runLanguage as Language;
      adoptLanguage(runLanguage as Language);
      return;
    }
    contentLanguageRef.current = language;
    // Everything is about to be regenerated in the new language, so from here
    // the run's language is known — whatever it was before.
    setRunLanguage(language);
    warm.clear();
    clearCaches();
  }, [
    language,
    settled,
    explicit,
    runLanguage,
    adoptLanguage,
    warm,
    clearCaches,
    setRunLanguage,
  ]);

  // The live session is the source of truth while it's open; this mirrors it
  // into the persisted per-node record. A finished pass drops out — coming
  // back to a node you completed should offer the pass again, not the
  // "understood" panel. A turn still being written is skipped: what's saved
  // stays the last complete state rather than a bubble stuck on its dots.
  useEffect(() => {
    if (!socratic || socratic.log.some((t) => t.pending)) return;
    const { nodeId } = socratic;
    setSocraticProgress((prev) => {
      if (socratic.done) {
        if (!prev[nodeId]) return prev;
        const { [nodeId]: _gone, ...rest } = prev;
        return rest;
      }
      return { ...prev, [nodeId]: socratic };
    });
  }, [socratic, setSocraticProgress]);

  // Same mirror for the teach-back. A pass mid-judgement is skipped — what's
  // saved stays the last complete state — and a finished one drops out in
  // `advanceFromFeynman`, once its gaps have actually reached the map.
  useEffect(() => {
    if (!feynman || feynman.pending) return;
    const { nodeId } = feynman;
    setFeynmanProgress((prev) => ({ ...prev, [nodeId]: feynman }));
  }, [feynman, setFeynmanProgress]);

  // Getting around outside a session, plus the two account actions.
  const {
    signOut,
    deleteAccount,
    enterDashboard,
    enterProfile,
    openMap,
    newMap,
    excludeTopic,
    enterSettings,
    exitSettings,
  } = useNavigation({
    run,
    sessions,
    toast: toastChannel,
    warm,
    supabase,
    setScreen,
    setExcluding,
    resetTransient,
  });

  /**
   * The node the "Start here →" / "Jump to frontier" affordances target:
   * the top of the goal-ordered plan, not merely the leftmost lit node.
   */
  const frontierTargetId = useCallback(() => {
    const plan = orderedFrontier(displayRef.current, graphRef.current, form.goal);
    return plan[0]?.node.id ?? null;
  }, [form.goal, graphRef]);

  // Onboarding: topic in, map out, placement answered.
  const {
    diagnostic,
    answered,
    reveal,
    outline,
    uploadNote,
    scopes,
    buildNote,
    build,
    pickScope,
    onOutlineFile,
    answerDiagnostic,
    startMap,
    reset: resetOnboarding,
  } = useOnboarding({
    run,
    sessions,
    toast: toastChannel,
    warm,
    languageRef,
    setScreen,
    setSelectedId,
    setView,
    centerOn,
    later,
    pendingGapsRef,
    frontierTargetId,
  });
  resetOnboardingRef.current = resetOnboarding;

  const gen = useGeneration({
    run,
    warm,
    languageRef,
    loadingRef,
    setLoading,
    showError,
  });
  const { modelKey, warmOne } = gen;

  /**
   * Hovering a node is 150-400 ms of lead time on the click that usually
   * follows, and the pass in `warmTargets` deliberately settles for 600 ms
   * before it fires. Starting the node's first surface on hover spends nothing
   * extra — `warm.warm` dedupes by key, so the click joins this request
   * instead of making a second one — and buys back that settle.
   */
  const hoverNode = (id: string | null) => {
    setHoverId(id);
    if (!id) return;
    const node = graphRef.current.nodes.find((n) => n.id === id);
    if (!node) return;
    // The hover card says what the concept is, same as the rail — so a node
    // still missing its sentence starts writing one on the hover rather than
    // on the click that may not come for another half second.
    if (!node.summary) warmOne("summary", node);
    const kind = warmKindsFor(displayRef.current[id])[0];
    if (kind) warmOne(kind, node);
  };

  // The spiral: opening a phase, running it, and advancing out of it.
  const {
    consumeCheck,
    consumeContinue,
    consumeOpenModel,
    consumeCloseModel,
    consumeToggleTerm,
    consumeOpenPassage,
    consumeClosePassage,
    consumeAskPassage,
    consumeToggleCollapse,
    exitConsume,
    dispatchSocratic,
    socraticAnswer,
    exitSocratic,
    dispatchFeynman,
    feynmanTeach,
    exitFeynman,
    dispatchConnect,
    exitConnect,
    advanceFromFeynman,
    advanceFromConnect,
    dispatchCrucible,
    crucibleSubmit,
    advanceFromCrucible,
    exitCrucible,
    enterReview,
    retainConfidence,
    retainToggleAside,
    retainContinue,
    retainGrade,
    retainReteach,
    exitReview,
    enterCalib,
    exitCalib,
    closeCalibGap,
    advanceFromSocratic,
    finishConsume,
    beginSocraticFromConsume,
    consumeSkipCrucible,
    consumeRoutePrereq,
    onNodeDoubleClick,
    skipKnown,
    onPhaseAction,
    onSurface,
    jumpFrontier,
    toggleMomentum,
    warmRetain,
    onPrimaryAction,
  } = useSpiral({
    run,
    sessions,
    gen,
    toast: toastChannel,
    warm,
    languageRef,
    displayRef,
    selectedId,
    setSelectedId,
    setScreen,
    centerOn,
    later,
    timersRef,
    loadingRef,
    judgingRef,
    setJudging,
    setConsumeFailed,
    setSocraticRetry,
    momentumPlaying,
    setMomentumPlaying,
    setMomentumWeek,
    momentumRef,
    frontierTargetId,
  });

  // Everything the render reads but nothing owns.
  const {
    isMap,
    sheet,
    sheetScreen,
    openSheet,
    showCanvas,
    usingFakeMap,
    earnedNodes,
    display,
    masteredCount,
    masteryPct,
    selectedNode,
    selectedDisplayState,
    lockedPath,
    allFrontier,
    nextUp,
    pace,
    calib,
    consumeChunks,
    consumeStreaming,
    modelBeats,
    modelStreaming,
    socraticSteps,
    feynmanBeats,
    connectContent,
    crucibleContent,
    displayName,
    initials,
    greeting,
    dateLabel,
    queue,
    frontierTotal,
    frontierConcept,
    subject,
    goalLabel,
    mapCards,
    interests,
    profileStats,
    reviewSummary,
  } = useDerived({
    run,
    sessions,
    screen,
    userEmail,
    selectedId,
    reveal,
    momentumPlaying,
    momentumWeek,
    displayRef,
    modelKey,
    runSubject,
  });

  // The warm pass: what to have generated before the learner asks for it.
  useWarming({
    run,
    gen,
    display,
    allFrontier,
    selectedId,
    isMap,
    warmRetain,
  });

  // Hold the paper blank until the saved-run fetch settles — a resumed run
  // must open on the map, never flash the welcome screen first. The mark is
  // delayed past a fast hydration so a quick resume never flashes a spinner.
  if (!hydrated) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: color.paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", animation: "softIn 0.5s 0.4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 16,
            }}
          >
            Atlas · learn anything, deeply
          </div>
          <InkRule width={180} />
        </div>
      </div>
    );
  }

  // Below the hard minimum a polished gate beats a broken layout (#8).
  if (vw < 768) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100vh",
          background: color.paper,
          color: color.ink,
          fontFamily: font.sans,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 380, animation: "fadeUp 0.4s both" }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: color.inkFaint,
              marginBottom: 16,
            }}
          >
            Atlas · learn anything, deeply
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 28,
              lineHeight: 1.2,
              marginBottom: 14,
            }}
          >
            Atlas is best on a desktop screen
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: color.inkSoft }}>
            The living concept map needs room to breathe. Open Atlas on a laptop or
            desktop — your progress is saved to your account and will be right where you
            left it.
          </div>
        </div>
      </div>
    );
  }
  const narrow = vw < 1280;
  const errorStrings = ERROR_STRINGS[language];
  const t = STRINGS[language];

  /**
   * Wrap one session sheet so a throw inside it costs that sheet and nothing
   * else.
   *
   * This is the whole reason `ErrorBoundary` exists here. `AtlasApp` holds the
   * entire run in memory — graph, mastery states, every generated cache — and
   * persists it on a debounce, so before this an unhandled render error in any
   * phase view took all of it down to Next's default error page. Now the map is
   * still behind you and the way back is a button.
   *
   * `resetKeys` on the open sheet and the selected node means leaving and
   * re-entering clears the caught error without a reload.
   */
  const sheetBoundary = (children: ReactNode) => (
    <ErrorBoundary
      resetKeys={[sheetScreen, selectedId]}
      onError={(err) => logWarning("session_view_crashed", err, { sheetScreen })}
      fallback={(_err, reset) => (
        <ErrorState
          compact
          kicker={errorStrings.context.crash}
          message={errorStrings.code.unknown}
          body={errorStrings.crashBody}
          retryLabel={errorStrings.retry}
          onRetry={reset}
          secondary={{
            label: errorStrings.backToMap,
            onClick: () => {
              reset();
              setScreen("map");
            },
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );

  return (
    <div
      // The app's one addressable landmark: which screen is up, and which sheet
      // is over it (docs/AGENT-TESTING.md). Everything else an agent needs to
      // know about navigation is derivable from these two attributes, which is
      // why no screen needed a wrapper div to carry a testid.
      data-testid="app"
      data-screen={screen}
      data-sheet={openSheet ?? "none"}
      data-hydrated={hydrated ? "1" : "0"}
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        // clip (not hidden) forbids programmatic scrolling — scrollIntoView on
        // off-screen canvas content can never drag the UI off-screen (#7).
        overflow: "clip",
        background: color.paper,
        color: color.ink,
        fontFamily: font.sans,
        fontSize: 15,
      }}
    >
      {showCanvas && (
        <MapCanvas
          screen={screen as "map" | "building" | "diagnostic"}
          nodes={usingFakeMap ? FAKE_MAP_NODES : graph.nodes}
          edges={usingFakeMap ? FAKE_MAP_EDGES : graph.edges}
          spawnedIds={spawnedIds}
          staggered={usingFakeMap}
          display={display}
          lockedPath={lockedPath}
          earned={earnedNodes}
          positions={usingFakeMap ? FAKE_MAP_POSITIONS : positions}
          view={view}
          selectedId={selectedId}
          hoverId={hoverId}
          consumeProgress={consumeProgress}
          reviewedNodes={reviewedNodes}
          shakyReasons={shakyReasons}
          query={query}
          onWheel={onWheel}
          onCanvasDown={onCanvasDown}
          onNodeDown={onNodeDown}
          onNodeSelect={(id) => {
            setSelectedId(id);
            centerOn(id);
          }}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeHover={hoverNode}
        />
      )}

      {screen === "building" && <BuildingOverlay note={buildNote} />}

      {screen === "diagnostic" && (
        <DiagnosticPanel
          questions={diagnostic}
          // The placement always asks this many, even when the panel opens on
          // the first one and the rest are still being written.
          expected={DIAGNOSTIC_COUNT}
          answered={answered}
          onAnswer={answerDiagnostic}
          onSkip={startMap}
          onStart={startMap}
        />
      )}

      {isMap && (
        <>
          <TopBar
            query={query}
            onQuery={setQuery}
            onSurface={onSurface}
            adherence={adherence}
            queue={queue}
            onToggleReminder={onToggleReminder}
            userEmail={userEmail}
            onHome={enterDashboard}
            onProfile={enterProfile}
          />
          {(!narrow || railOpen) && (
            <LeftRail
              subject={form.topic.trim() || t.yourTopic}
              goal={form.goal}
              pace={pace}
              nextUp={nextUp}
              masteryPct={masteryPct}
              calibOver={calibOverCount(calib)}
              momentumPlaying={momentumPlaying}
              momentumWeek={momentumWeek}
              onJumpFrontier={jumpFrontier}
              onCalibration={enterCalib}
              onToggleMomentum={toggleMomentum}
              onPickNode={(id) => {
                setSelectedId(id);
                centerOn(id);
              }}
            />
          )}
          {/* Always mounted: the drawer owns its own enter and exit, so it
              needs to outlive the selection it is animating away from. */}
          <NodeDetail
            visible={!narrow || detailOpen}
            node={selectedNode}
            displayState={selectedDisplayState}
            nodes={graph.nodes}
            edges={graph.edges}
            display={display}
            reviewed={selectedNode ? reviewedNodes.includes(selectedNode.id) : false}
            shakyReason={selectedNode ? shakyReasons[selectedNode.id] : undefined}
            consumeProgress={selectedNode ? consumeProgress[selectedNode.id] : undefined}
            // A node with no sentence of its own has one on the way (the warm
            // pass and the hover both start it) — unless it already failed, or
            // there is no network to write it over.
            summaryWriting={
              !!selectedNode &&
              !selectedNode.summary &&
              !selectedNode.gap &&
              online &&
              !summaryFailed[selectedNode.id]
            }
            onSelect={setSelectedId}
            onPrimaryAction={onPrimaryAction}
            onPhaseAction={onPhaseAction}
            onSkipKnown={skipKnown}
          />
          {narrow && (
            // Collapsed-rail toggles for laptop-narrow widths (#8).
            <>
              <button
                className="at-press"
                onClick={() => setRailOpen((v) => !v)}
                style={{
                  position: "absolute",
                  top: 70,
                  left: railOpen ? 274 : 12,
                  zIndex: 16,
                  padding: "8px 11px",
                  background: color.card,
                  border: `1px solid ${color.hairlineStrong}`,
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: color.inkMuted,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(44,40,35,0.08)",
                }}
              >
                {railOpen ? t.hidePlan : t.showPlan}
              </button>
              {selectedNode && (
                <button
                  className="at-press"
                  onClick={() => setDetailOpen((v) => !v)}
                  style={{
                    position: "absolute",
                    top: 70,
                    right: detailOpen ? 368 : 12,
                    zIndex: 16,
                    padding: "8px 11px",
                    background: color.card,
                    border: `1px solid ${color.hairlineStrong}`,
                    borderRadius: 9,
                    fontSize: 12.5,
                    color: color.inkMuted,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(44,40,35,0.08)",
                  }}
                >
                  {detailOpen ? t.hideNode : t.showNode}
                </button>
              )}
            </>
          )}
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: !narrow || railOpen ? 280 : 18,
              fontFamily: font.mono,
              fontSize: 11,
              color: color.inkGhost,
              zIndex: 12,
            }}
          >
            scroll to zoom · drag canvas to pan · drag a node to move · double-click a lit
            node to begin
          </div>
        </>
      )}

      {screen === "welcome" && (
        <WelcomeScreen
          form={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onBuild={build}
          onFile={onOutlineFile}
          uploadNote={uploadNote}
          uploadBusy={uploadNote !== null && outline === null}
          scopes={scopes}
          onPickScope={pickScope}
        />
      )}

      {screen === "dashboard" && (
        <DashboardScreen
          greeting={greeting}
          name={displayName}
          dateLabel={dateLabel}
          initials={initials}
          streak={adherence.streak}
          queue={queue}
          metToday={adherence.metToday}
          subject={subject}
          activeSubject={runSubject}
          frontierConcept={frontierConcept}
          frontierTotal={frontierTotal}
          maps={mapCards}
          onOpenMap={openMap}
          onSelectMap={switchMap}
          onReview={enterReview}
          onProfile={enterProfile}
          onNewMap={newMap}
          onExcludeTopic={excludeTopic}
          excluding={excluding}
          mapsFailed={mapsFailed ? { onRetry: refreshMaps } : undefined}
        />
      )}

      {openSheet === "settings" && (
        <SettingsScreen
          presence={sheet.state}
          form={form}
          adherence={adherence}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onToggleReminder={onToggleReminder}
          onExportMap={() =>
            exportMap(formRef.current.topic, graphRef.current, statesRef.current)
          }
          onExportCardsJson={() =>
            exportCardsJson(formRef.current.topic, cardsRef.current)
          }
          onExportCardsCsv={() => exportCardsCsv(formRef.current.topic, cardsRef.current)}
          onDeleteAccount={deleteAccount}
          onExit={exitSettings}
        />
      )}

      {screen === "profile" && (
        <ProfileScreen
          name={displayName}
          userEmail={userEmail}
          initials={initials}
          stats={profileStats}
          goalLabel={goalLabel}
          interests={interests}
          reviewSummary={reviewSummary}
          onHome={enterDashboard}
          onReview={enterReview}
          onSettings={enterSettings}
          onSignOut={signOut}
        />
      )}

      {openSheet === "consume" &&
        consume &&
        consumeChunks &&
        sheetBoundary(
          <ConsumeView
            presence={sheet.state}
            title={graph.nodes.find((n) => n.id === consume.nodeId)?.label ?? "Concept"}
            chunks={consumeChunks}
            streaming={consumeStreaming}
            session={consume}
            modelBeats={modelBeats}
            modelStreaming={modelStreaming}
            onExit={exitConsume}
            onCheck={consumeCheck}
            onContinue={consumeContinue}
            onFinish={finishConsume}
            onBeginSocratic={beginSocraticFromConsume}
            onOpenModel={consumeOpenModel}
            onCloseModel={consumeCloseModel}
            onToggleTerm={consumeToggleTerm}
            onToggleCollapse={consumeToggleCollapse}
            onOpenPassage={consumeOpenPassage}
            onClosePassage={consumeClosePassage}
            onAskPassage={consumeAskPassage}
            onSkipCrucible={consumeSkipCrucible}
            onRoutePrereq={consumeRoutePrereq}
            incomplete={
              consumeFailed?.nodeId === consume.nodeId
                ? { onRetry: consumeFailed.retry }
                : undefined
            }
          />,
        )}

      {openSheet === "socratic" &&
        socratic &&
        socraticSteps &&
        sheetBoundary(
          <SocraticView
            presence={sheet.state}
            title={graph.nodes.find((n) => n.id === socratic.nodeId)?.label ?? "Concept"}
            session={socratic}
            judging={judging}
            gapMode={graph.nodes.find((n) => n.id === socratic.nodeId)?.gap ?? false}
            onExit={exitSocratic}
            onAnswer={socraticAnswer}
            onStuck={() => dispatchSocratic({ type: "stuck" })}
            onTell={() => dispatchSocratic({ type: "tell" })}
            onHelpChange={(level) => dispatchSocratic({ type: "setHelp", level })}
            onAdvance={advanceFromSocratic}
            onRetryJudge={socraticRetry ?? undefined}
          />,
        )}

      {openSheet === "feynman" &&
        feynman &&
        feynmanBeats &&
        sheetBoundary(
          <FeynmanView
            presence={sheet.state}
            topic={form.topic}
            title={graph.nodes.find((n) => n.id === feynman.nodeId)?.label ?? "Concept"}
            beats={feynmanBeats}
            session={feynman}
            judging={judging}
            ready={!!feynmanCache[feynman.nodeId]}
            onExit={exitFeynman}
            onBegin={() => dispatchFeynman({ type: "begin" })}
            onTeach={feynmanTeach}
            onScaffold={() => dispatchFeynman({ type: "scaffold" })}
            onOpenFix={(beatId) => dispatchFeynman({ type: "openFix", beatId })}
            onCloseFix={() => dispatchFeynman({ type: "closeFix" })}
            onFix={(index) => dispatchFeynman({ type: "fix", index })}
            onTeachAgain={() => dispatchFeynman({ type: "teachAgain" })}
            onAdvance={advanceFromFeynman}
          />,
        )}

      {openSheet === "connect" &&
        connect &&
        connectContent &&
        sheetBoundary(
          <ConnectView
            presence={sheet.state}
            content={connectContent}
            session={connect}
            onExit={exitConnect}
            onSelect={(id) => dispatchConnect({ type: "select", id })}
            onDraft={(id, value) => dispatchConnect({ type: "draft", id, value })}
            onConfirm={(id) => dispatchConnect({ type: "confirm", id })}
            onPickMnemonic={(index) => dispatchConnect({ type: "pickMnemonic", index })}
            onDraftMnemonic={(value) => dispatchConnect({ type: "draftMnemonic", value })}
            onAcceptMnemonic={() => dispatchConnect({ type: "acceptMnemonic" })}
            onFinish={advanceFromConnect}
          />,
        )}

      {openSheet === "crucible" &&
        crucible &&
        crucibleContent &&
        sheetBoundary(
          <CrucibleView
            presence={sheet.state}
            content={crucibleContent}
            session={crucible}
            judging={judging}
            onExit={exitCrucible}
            onConfidence={(level) => dispatchCrucible({ type: "confidence", level })}
            onAttempt={(value) => dispatchCrucible({ type: "attempt", value })}
            onSample={() => dispatchCrucible({ type: "sample" })}
            onSubmit={crucibleSubmit}
            onToggleReExplain={() => dispatchCrucible({ type: "toggleReExplain" })}
            onRetry={() => dispatchCrucible({ type: "retry" })}
            onFinish={advanceFromCrucible}
          />,
        )}

      {openSheet === "review" &&
        retain &&
        retainContent &&
        sheetBoundary(
          <RetainView
            presence={sheet.state}
            content={retainContent}
            session={retain}
            nodeLabel={
              graph.nodes.find((n) => n.id === reviewCard(retain, retainContent).node)
                ?.label ?? t.thisNode
            }
            litNodes={masteredCount}
            adherence={adherence}
            litToday={litToday}
            onToggleReminder={onToggleReminder}
            onExit={exitReview}
            onConfidence={retainConfidence}
            onGrade={retainGrade}
            onToggleAside={retainToggleAside}
            onReteach={retainReteach}
            onContinue={retainContinue}
          />,
        )}

      {openSheet === "calibration" &&
        sheetBoundary(
          <CalibrationView
            presence={sheet.state}
            items={calib}
            onExit={exitCalib}
            onCloseGap={closeCalibGap}
          />,
        )}

      {/* Mounted through its own fade-out; `loading` is already null by then,
          so the last phase/message are kept for the exit frame. */}
      <GeneratingOverlay
        open={Boolean(loading)}
        phase={loading?.phase ?? lastLoading.current?.phase ?? ""}
        message={loading?.message ?? lastLoading.current?.message ?? ""}
      />

      <OfflineBanner offline={!online} message={errorStrings.offlineBanner} />

      {/* A write that has exhausted its retries. Quiet and permanent rather
          than a toast: the debounce fires every 1.2s, so a toast would be a
          strobe, and the next tick is already the retry. Suppressed offline —
          the banner above is a truer account of the same fact. */}
      {saveFailed && online && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 38,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 12px",
            borderRadius: 999,
            background: color.dangerBg,
            border: "1px solid rgba(154,64,52,0.22)",
            color: color.dangerInk,
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: "0.06em",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: color.dangerInk,
              animation: "breathe 1.8s ease-in-out infinite",
            }}
          />
          {errorStrings.notSaved}
        </div>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />

      <ScreenTimer />
    </div>
  );
}
