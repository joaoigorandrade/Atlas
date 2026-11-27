// ---- the fence a per-node generation is written inside ---------------------

import { baseIdOf, isCore, type ConceptGraph } from "./types";

/**
 * Where one concept's teaching ends and its neighbours' begins.
 *
 * Every per-node generation used to see only its own label and its *direct*
 * prereqs, so it had no way to know that a concept two columns back already
 * taught the thing it is re-deriving, or that the concept after it is the one
 * that owns the extension it just wandered into. The learner reads the same
 * material twice and meets the next concept already spoiled.
 *
 * `prior` is every ancestor over solid edges — what the learner has already
 * been taught and may be built on. `later` is every other concept on the map —
 * what belongs to somebody else's pass and must not be taught here.
 *
 * Gap nodes are excluded from both: they are spawned per learner, and a
 * per-learner list in the prompt would fork the shared `content_cache` row
 * that two learners on the same topic otherwise hash to. Deeper levels are
 * per-learner spawns too, so no other concept lists them — except a level's own
 * lower levels, which are its ancestors and are spawned before it on every run.
 * What a node's levels past it will teach is `later`, read off the shared map's
 * specs rather than off what this learner has spawned.
 */
export function conceptBoundary(
  graph: ConceptGraph,
  nodeId: string,
): { priorLabels: string[]; laterLabels: string[] } {
  const solid = graph.edges.filter(([, , dashed]) => !dashed);
  const ancestors = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [from, to] of solid)
      if (to === cur && !ancestors.has(from) && from !== nodeId) {
        ancestors.add(from);
        queue.push(from);
      }
  }
  const priorLabels: string[] = [];
  const laterLabels: string[] = [];
  for (const n of graph.nodes) {
    if (n.gap || n.id === nodeId) continue;
    if (ancestors.has(n.id)) priorLabels.push(n.label);
    else if (isCore(n)) laterLabels.push(n.label);
  }
  const self = graph.nodes.find((n) => n.id === nodeId);
  const base = graph.nodes.find((n) => n.id === baseIdOf(nodeId));
  for (const spec of base?.deeper?.slice((self?.depth ?? 1) - 1) ?? [])
    laterLabels.push(spec.label);
  return { priorLabels, laterLabels };
}
