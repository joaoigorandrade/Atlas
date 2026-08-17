"use client";

// The warm pass: what to have generated before the learner asks for it.
//
// Two speculative passes, both effects, both keyed on a *signature* rather than
// on the arrays they derive — so they fire when the plan really changes rather
// than on every render that touches the graph. Neither returns anything: their
// whole output is content already sitting in the run's caches by the time a
// click needs it.

import { useEffect, useMemo } from "react";
import { fetchCachedContent } from "@/lib/api";
import type { ConceptNode, NodeState } from "@/lib/curriculum";
import type { RunState } from "@/components/atlas/useRunState";
import type { Generation, WarmKind } from "@/components/atlas/useGeneration";
import { warmKindsFor } from "@/components/atlas/useGeneration";

export function useWarming(deps: {
  run: RunState;
  gen: Generation;
  /** Displayed (not stored) node states — a node's *shown* state is what
   *  decides which surfaces are worth having ready. */
  display: Record<string, NodeState>;
  /** Frontier nodes in goal order; every one of them is a plausible next click. */
  allFrontier: Array<{ node: ConceptNode }>;
  selectedId: string | null;
  isMap: boolean;
  /** Draft the Review queue's cards ahead of the click, same as the phases. */
  warmRetain: () => void;
}) {
  const { run, gen, display, allFrontier, selectedId, isMap, warmRetain } = deps;
  const { graph, states, cards, hydrated } = run;
  const { isCached, requestFor, applyWarmHit, warmOne } = gen;

  // ---- the warm pass ----------------------------------------------------
  // …but every frontier node's reading pass is worth having ready: a learner
  // picks whichever unlocked topic they like, not necessarily the goal-ordered
  // one, so anything less than "all of them" still shows a loading screen on
  // the "wrong" click. A 12-18 node map keeps this small regardless, and the
  // warm queue's own concurrency cap (`MAX_CONCURRENT` in lib/warm.ts) throttles
  // how many actually run at once — this list is just what's worth wanting.
  //
  // Runs regardless of which screen is open (map or mid-spiral) — a learner
  // reading one node's Consume is exactly when the next node's should be
  // warming, and when this node's own state flips to "learning" mid-spiral,
  // this same pass is what picks up Feynman/Connect for it next. Computed
  // without consulting the caches so filling them doesn't re-trigger the pass.
  const warmTargets = useMemo(() => {
    if (!hydrated || graph.nodes.length === 0) return [];
    const ids: string[] = [];
    if (selectedId) ids.push(selectedId);
    for (const { node } of allFrontier) ids.push(node.id);
    for (const n of graph.nodes) {
      const state = display[n.id];
      if (state === "learning" || state === "shaky" || state === "gap") ids.push(n.id);
    }
    const seen = new Set<string>();
    const targets: Array<{ node: ConceptNode; kinds: WarmKind[] }> = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) continue;
      // The rail's own sentence leads: it is by far the smallest generation
      // here, and the only one a learner reads without opening anything. Nodes
      // whose map already wrote one — and gap sub-nodes, which are their own
      // explanation — ask for nothing.
      const kinds: WarmKind[] = node.summary || node.gap ? [] : ["summary"];
      kinds.push(...warmKindsFor(display[id]));
      if (kinds.length) targets.push({ node, kinds });
    }
    return targets;
  }, [hydrated, graph, display, selectedId, allFrontier]);

  // A signature over the plan, so the pass runs when the plan really changes
  // rather than on every render that touches the graph.
  const warmSignature = warmTargets
    .map((t) => `${t.node.id}:${t.kinds.join("+")}`)
    .join("|");

  useEffect(() => {
    if (!warmSignature) return;
    let cancelled = false;
    // Settle first: clicking along a chain of nodes shouldn't fire a pass per
    // click, and the learner is reading, not waiting.
    const timer = setTimeout(() => {
      // One round-trip asks which of these are already generated — by this
      // learner or anyone before them — and takes them straight into memory.
      // Only what's genuinely missing reaches the model, in the background.
      const wanted = warmTargets.flatMap(({ node, kinds }) =>
        kinds
          .filter((kind) => !isCached(kind, node.id))
          .map((kind) => ({ kind, node, body: requestFor(kind, node) })),
      );
      const items = wanted.filter(
        (w): w is typeof w & { body: Record<string, unknown> } => w.body !== null,
      );
      if (items.length === 0) return;
      void fetchCachedContent(items.map((i) => i.body)).then((hits) => {
        if (cancelled) return;
        items.forEach((item, index) => {
          const hit = hits[index];
          if (hit !== undefined) applyWarmHit(item.kind, item.node.id, hit);
          else warmOne(item.kind, item.node);
        });
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // warmTargets is captured through its signature on purpose — the effect
    // must not re-run just because the array identity changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmSignature]);

  // The Review queue's card factory, drafted ahead of the click the same way.
  const uncoveredSignature = useMemo(
    () =>
      isMap && hydrated
        ? graph.nodes
            .filter(
              (n) =>
                !n.gap &&
                ["learning", "shaky", "mastered"].includes(states[n.id] ?? "") &&
                !cards.some((c) => c.nodeId === n.id),
            )
            .map((n) => n.id)
            .join(",")
        : "",
    [isMap, hydrated, graph, states, cards],
  );

  useEffect(() => {
    if (!uncoveredSignature) return;
    // A long settle: the uncovered set moves on every phase completion, and
    // each distinct set is its own generation. Only a stable one is worth
    // drafting ahead.
    const timer = setTimeout(warmRetain, 8000);
    return () => clearTimeout(timer);
  }, [uncoveredSignature, warmRetain]);
}
