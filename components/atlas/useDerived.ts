"use client";

// Everything the render reads but nothing owns: the view model.
//
// Split out because it is the one part of AtlasApp with no state of its own —
// every value here is a pure function of the run, the sessions and the screen.
// Keeping it beside the JSX made the component look like it held forty more
// things than it does.

import { useMemo, useRef } from "react";
import {
  calibItems,
  daysUntil,
  displayStates,
  orderedFrontier,
  paceStatus,
  goals,
  unmetPathOf,
  type AltKey,
  type NodeState,
  type ProgressState,
  type StateMap,
} from "@/lib/curriculum";
import { dueCards } from "@/lib/fsrs";
import { useLanguage, useT } from "@/lib/i18n";
import { STRINGS } from "@/components/atlas/dashboardCopy";
import { useEarned, usePresence } from "@/lib/motion";
import { CELEBRATE_MS } from "@/components/map/MapCanvas";
import { SHEET_EXIT_MS } from "@/components/Sheet";
import type { ProfileStat } from "@/components/ProfileScreen";
import { SHEET_SCREENS, type Screen } from "@/components/atlas/screen";
import type { RunState } from "@/components/atlas/useRunState";
import type { SessionState } from "@/components/atlas/useSessionState";

/** The state changes worth marking on the map. Reaching the frontier isn't one
 *  — that's derived, and it's the map telling you where to go, not a result. */
const isEarned = (next: ProgressState) =>
  next === "mastered" || next === "gap" || next === "shaky";

export function useDerived(deps: {
  run: RunState;
  sessions: SessionState;
  screen: Screen;
  userEmail: string;
  selectedId: string | null;
  /** Concept generations revealed so far during onboarding's staged reveal. */
  reveal: number;
  momentumPlaying: boolean;
  momentumWeek: number;
  /** Assigned here so every handler reads the *displayed* state, not the
   *  stored one — they differ during onboarding and the momentum replay. */
  displayRef: React.RefObject<Record<string, NodeState>>;
  /** Cache key for one open model view — owned by the generation layer, since
   *  a warm and the click after it must agree on it. */
  modelKey: (nodeId: string, chunkId: string, lens: AltKey) => string;
  /** The subject the run saves under — the dashboard grid excludes it. */
  runSubject: string;
}) {
  const {
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
  } = deps;
  const t = useT(STRINGS);
  const { language } = useLanguage();
  const {
    form,
    graph,
    states,
    cards,
    adherence,
    calibSamples,
    maps,
    consumeCache,
    modelCache,
    socraticCache,
    feynmanCache,
    connectCache,
    crucibleCache,
  } = run;
  const {
    consume,
    liveConsume,
    liveModel,
    socratic,
    liveSocratic,
    feynman,
    liveFeynman,
    connect,
    crucible,
    consumeChunksRef,
  } = sessions;

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  // The full-screen surfaces. They animate out, which means the screen they
  // belong to has to outlive `screen` moving on — `sheetScreen` lags behind for
  // exactly the length of the leave. Their session state is not torn down on
  // exit (`exitConsume` and friends only set the screen), so the outgoing view
  // still has everything it needs to draw those last frames.
  const onSheet = SHEET_SCREENS.has(screen);
  const sheet = usePresence(onSheet, SHEET_EXIT_MS);
  const lastSheet = useRef<Screen | null>(null);
  if (onSheet) lastSheet.current = screen;
  const sheetScreen = onSheet ? screen : lastSheet.current;
  // …and stops lagging once the leave is over. `sheetScreen` alone never goes
  // back to null, so rendering off it left the last sheet mounted for the rest
  // of the run: `sheetOut` fills to opacity 0, but an inset-0 element at
  // z-index 30 still swallows every click meant for the map behind it. The
  // `onSheet ||` covers the entry frame, where `mounted` is still catching up
  // in an effect and the map would otherwise flash through.
  const openSheet = onSheet || sheet.mounted ? sheetScreen : null;
  // The canvas backs onboarding + the map, but Consume is a full surface.
  // Kept mounted underneath a sheet as well, so a session genuinely rises off
  // the map and settles back onto it instead of onto blank paper. The canvas is
  // inert behind an opaque surface — it re-renders only when the graph or the
  // mastery states move, which during a session is a handful of times.
  const showCanvas =
    screen === "building" || screen === "diagnostic" || screen === "map" || sheet.mounted;
  // Before the real map exists, assemble a placeholder territory instead of
  // an empty canvas — swapped for the real graph the instant it streams in.
  const usingFakeMap = screen === "building" && graph.nodes.length === 0;

  // What the canvas shows: the live state map, masked during onboarding
  // (generations beyond the diagnostic reveal stay hidden) and during the
  // momentum replay (states that lit after the replay week stay hidden).
  const visibleStates = useMemo<StateMap>(
    () =>
      Object.fromEntries(
        graph.nodes.map((n) => [
          n.id,
          (!isMap && n.g > reveal) || (momentumPlaying && n.week > momentumWeek)
            ? "unknown"
            : states[n.id],
        ]),
      ),
    [graph, isMap, reveal, momentumPlaying, momentumWeek, states],
  );
  // Concepts the learner just moved. Tracked against stored progress rather
  // than `display`, which is masked during onboarding and by the replay, and
  // released only once the map is actually on screen — the state is usually
  // written mid-session, several seconds before there is anything to see it.
  // The momentum replay steps whole weeks at a time and is never a moment.
  const earnedNodes = useEarned(states, isEarned, {
    visible: isMap,
    enabled: !momentumPlaying,
    ms: CELEBRATE_MS,
  });

  const display = useMemo(
    () => displayStates(visibleStates, graph),
    [visibleStates, graph],
  );
  displayRef.current = display;

  const masteredCount = graph.nodes.filter((n) => states[n.id] === "mastered").length;
  const masteryPct = graph.nodes.length
    ? Math.round((masteredCount / graph.nodes.length) * 100)
    : 0;

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedDisplayState: NodeState | null = selectedNode
    ? display[selectedNode.id]
    : null;

  // "Learn these first": a selected locked node highlights its unlearned
  // prerequisite chain on the canvas.
  const lockedPath = useMemo(
    () =>
      isMap && selectedId && display[selectedId] === "unknown"
        ? unmetPathOf(selectedId, states, graph)
        : null,
    [isMap, selectedId, display, states, graph],
  );

  // The plan, continuously re-derived: the frontier ordered to the goal…
  const allFrontier = useMemo(
    () => orderedFrontier(display, graph, form.goal),
    [display, graph, form.goal],
  );
  // Only the top 3 are worth naming in the UI ("next up")…
  const nextUp = useMemo(() => allFrontier.slice(0, 3), [allFrontier]);
  // …and the pace check against the real deadline (#23) — an exam goal
  // without a date gets no fabricated countdown.
  const pace = useMemo(
    () =>
      // A date that has already passed is not a deadline — it would divide the
      // remaining territory by a floor of one day and demand a fabricated
      // 12-hour pace. No countdown beats a wrong one (#23).
      form.goal === "exam" && daysUntil(form.examDate) > 0
        ? paceStatus(states, graph, form.target, daysUntil(form.examDate))
        : null,
    [form.goal, form.examDate, form.target, states, graph],
  );

  // The live calibration readings, resolved against the node labels — read by
  // the Calibration surface and the left-rail "N over" alert.
  const calib = useMemo(
    () =>
      calibItems(calibSamples, (id) => graph.nodes.find((n) => n.id === id)?.label ?? id),
    [calibSamples, graph],
  );

  const consumeChunks = consume
    ? (consumeCache[consume.nodeId] ??
      (liveConsume?.nodeId === consume.nodeId ? liveConsume.chunks : undefined))
    : undefined;
  // True while the open session's pass is still being written — gates the
  // "Continue"/"Finish" affordance on the deepest streamed-in section so it
  // never reaches for a section that hasn't arrived yet.
  const consumeStreaming = !!consume && !consumeCache[consume.nodeId];
  consumeChunksRef.current = consumeChunks ?? [];
  // The open model view, if any: committed beats, else the ones streaming in.
  const openModelKey =
    consume && consume.model
      ? modelKey(consume.nodeId, consume.model.chunkId, consume.model.lens)
      : null;
  const modelBeats = openModelKey
    ? (modelCache[openModelKey] ??
      (liveModel?.key === openModelKey ? liveModel.beats : undefined))
    : undefined;
  // Beats are still on the way unless the view is committed, or what streamed
  // in is all there is ever going to be.
  const modelStreaming =
    !!openModelKey &&
    !modelCache[openModelKey] &&
    !(liveModel?.key === openModelKey && liveModel.done);
  // Same fallback as Consume: the committed pass if it exists, otherwise
  // whatever has streamed in for this node so far.
  const socraticSteps = socratic
    ? (socraticCache[socratic.nodeId] ??
      (liveSocratic?.nodeId === socratic.nodeId ? liveSocratic.steps : undefined))
    : undefined;
  const feynmanBeats = feynman
    ? (feynmanCache[feynman.nodeId] ??
      (liveFeynman?.nodeId === feynman.nodeId ? liveFeynman.beats : undefined))
    : undefined;
  const connectContent = connect ? connectCache[connect.nodeId] : undefined;
  const crucibleContent = crucible ? crucibleCache[crucible.nodeId] : undefined;

  // ---- Home (dashboard) + profile derived ------------------------------

  // The account, read into an avatar initial and a friendly display name —
  // honest, derived from the email, never a fabricated identity.
  const emailLocal = (userEmail.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  const nameParts = emailLocal.split(/\s+/).filter(Boolean);
  const displayName =
    nameParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || t.there;
  const initials =
    (nameParts.length >= 2
      ? nameParts[0][0] + nameParts[1][0]
      : emailLocal.slice(0, 2)
    ).toUpperCase() || "A";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.morning : hour < 18 ? t.afternoon : t.evening;
  const dateLabel = new Date()
    .toLocaleDateString(language, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  // The honest queue chip, read from the real card store (#21): cards
  // actually due now, in minutes.
  const dueNow = useMemo(() => dueCards(cards).length, [cards]);
  const queue = { minutes: Math.ceil(dueNow * 1.5), cards: dueNow };
  const frontierTotal = graph.nodes.filter((n) => display[n.id] === "frontier").length;
  const frontierConcept = nextUp[0]?.node.label ?? null;
  const subject = form.topic.trim() || t.yourMap;
  const goalOptions = goals(language);
  const goalLabel = goalOptions.find(([g]) => g === form.goal)?.[1] ?? t.generalMastery;

  // The dashboard's "Your maps" grid: the live run's numbers stay live (they
  // update mid-session, before any save lands); every other saved map reads
  // off its last-saved snapshot from `maps`.
  const mapCards = useMemo(() => {
    const others = maps
      .filter((m) => m.subject !== runSubject)
      .map((m) => {
        const otherDisplay = displayStates(m.states, m.graph);
        const mastered = m.graph.nodes.filter(
          (n) => m.states[n.id] === "mastered",
        ).length;
        return {
          subject: m.subject,
          goalLabel: goalOptions.find(([g]) => g === m.goal)?.[1] ?? t.generalMastery,
          masteryPct: m.graph.nodes.length
            ? Math.round((mastered / m.graph.nodes.length) * 100)
            : 0,
          frontierTotal: m.graph.nodes.filter((n) => otherDisplay[n.id] === "frontier")
            .length,
        };
      });
    return graph.nodes.length
      ? [{ subject, goalLabel, masteryPct, frontierTotal }, ...others]
      : others;
  }, [
    maps,
    runSubject,
    graph,
    subject,
    goalLabel,
    goalOptions,
    masteryPct,
    frontierTotal,
    t,
  ]);

  const interests = form.interests
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const profileStats: ProfileStat[] = [
    { value: `${adherence.streak}`, label: t.dayStreak, accent: true },
    { value: `${masteredCount}`, label: t.conceptsMastered },
    { value: `${frontierTotal}`, label: t.onTheFrontier },
    { value: `${masteryPct}%`, label: t.mapMastered },
  ];
  const reviewSummary = adherence.metToday
    ? t.queueClear
    : t.queueDue(queue.cards, queue.minutes);

  return {
    isMap,
    sheet,
    openSheet,
    showCanvas,
    usingFakeMap,
    visibleStates,
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
    dueNow,
    queue,
    frontierTotal,
    frontierConcept,
    subject,
    goalLabel,
    mapCards,
    interests,
    profileStats,
    reviewSummary,
    sheetScreen,
  };
}
