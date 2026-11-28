"use client";

// Everything the render reads but nothing owns: the view model.
//
// Split out because it is the one part of AtlasApp with no state of its own —
// every value here is a pure function of the run, the sessions and the screen.
// Keeping it beside the JSX made the component look like it held forty more
// things than it does.

import { useMemo } from "react";
import {
  calibItems,
  displayStates,
  orderedFrontier,
  mapProgress,
  unmetPathOf,
  type AltKey,
  type NodeState,
  type ProgressState,
  type StateMap,
  freshConcepts,
  isCore,
} from "@/lib/curriculum";
import { dealableCount } from "@/lib/fsrsQueue";
import { useLanguage, useT } from "@/lib/i18n";
import { STRINGS } from "@/components/atlas/dashboardCopy";
import { useEarned } from "@/lib/motion";
import { CELEBRATE_MS } from "@/components/map/MapCanvas";
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
  user: { email: string; name?: string };
  selectedId: string | null;
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
    user,
    selectedId,
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
    phasesDone,
    cards,
    adherence,
    calibSamples,
    maps,
    consumeCache,
    modelCache,
    performCache,
  } = run;
  const { consume, liveConsume, liveModel, perform, consumeChunksRef } = sessions;

  // ---- derived ----------------------------------------------------------

  const isMap = screen === "map";
  // The full-screen surfaces. They have no exit of their own: leaving one is a
  // screen crossfade (`usePageTurn`), which snapshots the outgoing page — so the sheet
  // can unmount on the frame `screen` moves on.
  const openSheet = SHEET_SCREENS.has(screen) ? screen : null;
  // The canvas backs onboarding + the map, and stays mounted under a sheet so
  // turning back lands on the map as it was rather than rebuilding it. It is
  // `covered` there: hidden, its animations paused, its layers memoised.
  const showCanvas =
    screen === "building" || screen === "diagnostic" || screen === "map" || !!openSheet;
  // Before the real map exists, assemble a placeholder territory instead of
  // an empty canvas — swapped for the real graph the instant it streams in.
  const usingFakeMap = screen === "building" && graph.nodes.length === 0;

  // What the canvas shows: the live state map, with generations past the reveal
  // masked during onboarding only (masked on every non-map screen, the dashboard
  // lost its real frontier) and lit-after-this-week states masked in the replay.
  const staging = screen === "building";
  const visibleStates = useMemo<StateMap>(
    () =>
      Object.fromEntries(
        graph.nodes.map((n) => [
          n.id,
          staging || (momentumPlaying && n.week > momentumWeek)
            ? "unknown"
            : states[n.id],
        ]),
      ),
    [graph, staging, momentumPlaying, momentumWeek, states],
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

  const {
    mastered: masteredCount,
    masteryPct,
    frontierTotal,
  } = mapProgress(graph, states, display);

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedDisplayState: NodeState | null = selectedNode
    ? display[selectedNode.id]
    : null;
  // What the drawer reads about the selected node beside the node itself.
  const at = selectedNode?.id ?? "";
  const selectedFacts = {
    reviewed: run.reviewedNodes.includes(at),
    phasesDone: phasesDone[at],
    shakyReason: run.shakyReasons[at],
    consumeProgress: run.consumeProgress[at],
  };

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
  // No deadline in the one flow, so no pace check (docs/PLAN-FLOW.md).
  const pace = null;

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
  const performContent = perform ? performCache[perform.nodeId] : undefined;

  // ---- Home (dashboard) + profile derived ------------------------------

  // The account as an initial and a name: sign-in's first name, else the email's words.
  const emailLocal = (user.email.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  const nameParts = (user.name?.trim() || emailLocal).split(/\s+/).filter(Boolean);
  const displayName =
    (user.name ? nameParts[0] : "") ||
    nameParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") ||
    t.there;
  const initials =
    (nameParts.length >= 2
      ? nameParts[0][0] + nameParts[1][0]
      : emailLocal.slice(0, 2)
    ).toUpperCase() || "A";

  const hour = new Date().getHours();
  // Before five is still the night before, not "good morning".
  const greeting =
    hour < 5 || hour >= 18 ? t.evening : hour < 12 ? t.morning : t.afternoon;
  const dateLabel = new Date()
    .toLocaleDateString(language, { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  // The honest queue chip, read from the real card store (#21): cards
  // actually due now, in minutes.
  const dueNow = useMemo(() => dealableCount(cards), [cards]);
  const fresh = useMemo(
    () => freshConcepts(graph.nodes, states, form.goal, phasesDone, cards),
    [graph, states, form.goal, phasesDone, cards],
  );
  const queue = { minutes: Math.ceil(dueNow * 1.5), cards: dueNow, fresh };
  const frontierConcept = nextUp[0]?.node.label ?? null;
  const subject = form.topic.trim() || t.yourMap;
  const goalLabel = t.concepts(graph.nodes.filter(isCore).length);

  // The dashboard's "Your maps" grid: the live run's numbers stay live (they
  // update mid-session, before any save lands); every other saved map reads
  // off its last-saved snapshot from `maps`.
  // A map in a continent is reached through its continent (`ContinentShelf`).
  const mapCards = useMemo(() => {
    const liveGrouped = maps.some((m) => m.subject === runSubject && m.continent);
    const others = maps
      .filter((m) => m.subject !== runSubject && !m.continent)
      .map((m) => ({
        subject: m.subject,
        goalLabel: t.concepts(m.graph.nodes.filter(isCore).length),
        ...mapProgress(m.graph, m.states),
      }));
    // Blank topic: "+ New map" leaving — its card is in `others`, no phantom.
    return graph.nodes.length && !liveGrouped && form.topic.trim()
      ? [{ subject, goalLabel, masteryPct, frontierTotal }, ...others]
      : others;
  }, [
    maps,
    runSubject,
    graph,
    form.topic,
    subject,
    goalLabel,
    masteryPct,
    frontierTotal,
    t,
  ]);

  const interests = form.interests
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const profileStats: ProfileStat[] = [
    { value: `${adherence.streak}`, label: t.dayStreak(adherence.streak), accent: true },
    { value: `${masteredCount}`, label: t.conceptsMastered },
    { value: `${frontierTotal}`, label: t.onTheFrontier },
    { value: `${masteryPct}%`, label: t.mapMastered },
  ];
  // "Clear" has to mean the queue is empty, not that the budget is spent.
  const reviewSummary = !queue.cards
    ? fresh
      ? t.queueFresh(fresh)
      : t.queueClear
    : adherence.metToday
      ? t.queueWaiting(queue.cards)
      : t.queueDue(queue.cards, queue.minutes);

  return {
    isMap,
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
    selectedFacts,
    lockedPath,
    allFrontier,
    nextUp,
    pace,
    calib,
    consumeChunks,
    consumeStreaming,
    modelBeats,
    modelStreaming,
    performContent,
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
  };
}
