"use client";

// What a write compares against.
//
// A node, a card, the topic's own fields and the profile, each reduced to the
// JSON of exactly what is persisted about it. Comparing strings is what makes
// the diff one line per row rather than a field-by-field equality function that
// has to be updated every time a column is added — and a string that differs
// is, by construction, a row that has to be written.
//
// Outside `useRunState` because none of it closes over anything: they are pure
// functions of the run, which is also what lets both call sites stay
// memoizable.

import type {
  CalibSample,
  ConceptGraph,
  ConnectSession,
  ConsumeProgress,
  FeynmanSession,
  MisconceptionRecord,
  ModalityTally,
  OnboardingForm,
  ShakyReason,
  SocraticSession,
  StateMap,
} from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";
import type { Language } from "@/lib/i18n";
import {
  deleteCards,
  patchNodes,
  patchTopic,
  putCards,
  type NodeDelta,
  type Profile,
} from "@/lib/persistence";
import { withRetry } from "@/lib/retry";

/** The persisted projection of every node on the map, keyed by id. */
export function projectNodes(run: {
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

export function projectCards(cards: StoredCard[]): Record<string, string> {
  return Object.fromEntries(cards.map((c) => [c.id, JSON.stringify(c)]));
}

export function projectTopic(topic: {
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
export function adoptProfile(
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

/** Where a write's baseline is kept — refs, so a successful save does not
 *  re-arm the debounce that produced it. */
interface Baselines {
  nodes: React.MutableRefObject<Record<string, string>>;
  cards: React.MutableRefObject<Record<string, string>>;
  topic: React.MutableRefObject<string>;
}

/**
 * Send what changed, and move the baseline for whatever landed.
 *
 * Each half moves its own baseline only on success, so a failed node write is
 * retried by the next tick while a card write that did land is not repeated.
 * Returns whether there was anything to send at all — a tick with no changes
 * must not be reported as a save.
 */
export async function pushRun(run: {
  topicId: string;
  nodes: Record<string, string>;
  cards: StoredCard[];
  cardShots: Record<string, string>;
  topicShot: string;
  edges: ConceptGraph["edges"];
  saved: Baselines;
}): Promise<boolean> {
  const { topicId, nodes, cards, cardShots, topicShot, edges, saved } = run;
  const writes: Array<Promise<unknown>> = [];

  const deltas: NodeDelta[] = [];
  for (const [id, shot] of Object.entries(nodes)) {
    if (saved.nodes.current[id] === shot) continue;
    const isNew = saved.nodes.current[id] === undefined;
    deltas.push({
      ...(JSON.parse(shot) as Omit<NodeDelta, "id">),
      id,
      // Only a node the server has never seen needs its edges; an existing
      // one's prerequisites are already rows, and re-sending them on every drag
      // would be the write amplification this whole change replaced.
      ...(isNew
        ? { prereqs: edges.filter(([, to]) => to === id).map(([from]) => from) }
        : null),
    });
  }
  const removed = Object.keys(saved.nodes.current).filter((id) => !(id in nodes));
  if (deltas.length || removed.length)
    writes.push(
      withRetry(() => patchNodes(topicId, deltas, removed)).then(() => {
        saved.nodes.current = nodes;
      }),
    );

  const changed = cards.filter((c) => saved.cards.current[c.id] !== cardShots[c.id]);
  const dropped = Object.keys(saved.cards.current).filter((id) => !(id in cardShots));
  if (changed.length || dropped.length)
    writes.push(
      Promise.all([
        changed.length ? withRetry(() => putCards(topicId, changed)) : null,
        dropped.length ? withRetry(() => deleteCards(topicId, dropped)) : null,
      ]).then(() => {
        saved.cards.current = cardShots;
      }),
    );

  if (saved.topic.current !== topicShot)
    writes.push(
      withRetry(() => patchTopic(topicId, JSON.parse(topicShot))).then(() => {
        saved.topic.current = topicShot;
      }),
    );

  if (writes.length === 0) return false;
  await Promise.all(writes);
  return true;
}
