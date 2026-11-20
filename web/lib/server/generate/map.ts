// ---- kind: curriculum map --------------------------------------------------
import { arr, fail, languageNote, obj, slug, str, user } from "./common";
import {
  ABOUT_SHAPE,
  NODE_SHAPE,
  graphShape,
  mapContext,
  mapNodeBounds,
  mapRules,
  type MapParams,
} from "./mapPrompt";
import {
  ConceptEdge,
  ConceptNode,
  MapNode,
  nodeAxes,
  resolvePlan,
  type GoalKind,
  PARETO_DEFAULT,
  asMapMeta,
  graphFromMapNodes,
  type MapMeta,
} from "@/lib/curriculum";
import { noteChain, withSyllabus } from "./mapSyllabus";
import { backstopAxes } from "./jev";
import {
  claim,
  inherit,
  restartGuard,
  validateMapConcept,
  type RawConcept,
  type SeenConcepts,
} from "./mapConcept";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** The map on the wire: a flat list of laid-out nodes, each carrying its own
 *  prerequisites. Flat because the map streams one concept at a time and
 *  `framesToPayload` can only assemble flat parts — `graphFromMapNodes` turns
 *  it back into a `ConceptGraph` on both sides. */
export interface CurriculumMapPayload {
  nodes: MapNode[];
  /** The map as a whole — absent on maps cached before the header existed. */
  meta?: MapMeta;
}

/** A scoped sub-map offer returned instead of a map when the topic is too
 *  broad to be one coherent 12-18 node map (#30). */
export interface ScopeOffer {
  label: string;
  note: string;
}

/** W3.1's evidence as the model wrote it on a concept. */
const evidence = (n: RawConcept) => ({
  contested: n.contested,
  transferable: n.transferable,
  individual: n.individual,
});

/** Column layout from topological depth — deterministic, draggable afterwards. */
function layoutGraph(rawNodes: RawConcept[], edges: ConceptEdge[]): ConceptNode[] {
  const ids = new Set(rawNodes.map((n) => n.id));
  const indeg: Record<string, number> = {};
  const fwd: Record<string, string[]> = {};
  for (const id of ids) indeg[id] = 0;
  for (const [a, b] of edges) {
    (fwd[a] = fwd[a] ?? []).push(b);
    indeg[b] += 1;
  }
  // Kahn longest-path depth; cyclic leftovers land in the last column.
  const depth: Record<string, number> = {};
  const queue = [...ids].filter((id) => indeg[id] === 0);
  for (const id of queue) depth[id] = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of fwd[cur] ?? []) {
      depth[next] = Math.max(depth[next] ?? 0, depth[cur] + 1);
      if (--indeg[next] === 0) queue.push(next);
    }
  }
  let maxDepth = 0;
  for (const id of ids) {
    if (depth[id] === undefined) depth[id] = maxDepth + 1; // cycle leftover
    maxDepth = Math.max(maxDepth, depth[id]);
  }
  const byCol: Record<number, string[]> = {};
  for (const n of rawNodes) (byCol[depth[n.id]] = byCol[depth[n.id]] ?? []).push(n.id);
  const degree = (id: string) => edges.filter(([a, b]) => a === id || b === id).length;
  return rawNodes.map((n): ConceptNode => {
    const d = depth[n.id];
    const col = byCol[d];
    const i = col.indexOf(n.id);
    return {
      ...n, // id, label, summary and the four axes, exactly as validated
      // Resolved here, once, and stored on the node. Recomputing it on every
      // read would mean shipping a new catalogue silently re-cut the ladder
      // under a run already in progress.
      phasePlan: resolvePlan(n.kind, n.domain, n.importance, n.difficulty, {
        ...evidence(n),
        neighbours: degree(n.id),
      }),
      state: "unknown" as const,
      g: d + 1,
      week: 0,
      x: 110 + d * 245 + (i % 2 === 1 ? 30 : 0),
      y: 440 + (i - (col.length - 1) / 2) * 140,
    };
  });
}

/** The 2-3 scoped sub-map offers a too-broad topic comes back with instead of
 *  a mush map, or null when this payload isn't one. */
export function validateScopeOffer(raw: unknown): ScopeOffer[] | null {
  const root = obj(raw, "payload");
  if (root.tooBroad !== true) return null;
  return arr(root.scopes, "scopes", 2, 3).map((v, i) => {
    const s = obj(v, `scopes[${i}]`);
    return {
      label: str(s.label, `scopes[${i}].label`),
      note: str(s.note, `scopes[${i}].note`),
    };
  });
}

/** Nodes and edges together: the map itself — its own prompt now, so it can
 *  ship the moment it's written instead of waiting on the diagnostic. */
export function validateGraphPart(
  raw: unknown,
  bounds: { min: number; max: number } = mapNodeBounds(),
  goal?: GoalKind,
): { nodes: RawConcept[]; edges: ConceptEdge[]; meta?: MapMeta } {
  const root = obj(raw, "payload");
  // Only a header the model wrote: a defaulted one would stamp `general` over
  // a topic the map never classified, and the streamed and single-shot maps
  // must assemble to the same payload whether or not it came.
  const meta = root.about ? asMapMeta(root.about) : undefined;
  const seen: SeenConcepts = new Map();
  const nodes = arr(root.nodes, "nodes", bounds.min, bounds.max).flatMap((v, i) => {
    const n = inherit(obj(v, `nodes[${i}]`), meta?.domain);
    const id = slug(n.id, `nodes[${i}].id`);
    const label = str(n.label, `nodes[${i}].label`);
    if (claim(seen, id, label)) return []; // a restatement — its edges fold onto the kept node
    return {
      id,
      label,
      // A missing sentence costs one node its rail copy, not the learner their
      // whole map — the rail falls back to the state line.
      summary: n.summary ? str(n.summary, `nodes[${i}].summary`) : undefined,
      ...nodeAxes(n, goal),
    };
  });
  if (nodes.length < bounds.min) fail(`only ${nodes.length} distinct concepts`);
  const edges: ConceptEdge[] = [];
  // Bounded to match the check below, which is the real floor: it tolerates up
  // to four roots, while `nodes.length - 1` demanded a spanning tree of the RAW
  // list. 80 rejected any wide map with three prereqs a node (40 → 117 edges).
  const floor = Math.max(1, nodes.length - 4);
  for (const [i, v] of arr(root.edges, "edges", floor, 400).entries()) {
    const e = arr(v, `edges[${i}]`, 2, 3);
    const from = seen.get(slug(e[0], `edges[${i}][0]`));
    const to = seen.get(slug(e[1], `edges[${i}][1]`));
    if (!from || !to || from === to) continue; // drop, don't fail
    if (!edges.some(([a, b]) => a === from && b === to)) edges.push([from, to]);
  }
  if (edges.length < nodes.length - 4)
    fail("too few valid edges — every node needs prerequisites wired");
  // A prerequisite cycle would permanently lock those nodes on the map —
  // Kahn must consume every node or the payload is rejected (#16).
  {
    const indeg: Record<string, number> = {};
    const fwd: Record<string, string[]> = {};
    for (const n of nodes) indeg[n.id] = 0;
    for (const [a, b] of edges) {
      (fwd[a] = fwd[a] ?? []).push(b);
      indeg[b] += 1;
    }
    const queue = nodes.map((n) => n.id).filter((id) => indeg[id] === 0);
    let visited = 0;
    while (queue.length) {
      const cur = queue.shift()!;
      visited += 1;
      for (const next of fwd[cur] ?? []) if (--indeg[next] === 0) queue.push(next);
    }
    if (visited < nodes.length)
      fail("edges contain a prerequisite cycle — the map must be a DAG");
  }
  return { nodes, edges, meta };
}

function withPrereqs(nodes: ConceptNode[], edges: ConceptEdge[]): MapNode[] {
  const prereqs: Record<string, string[]> = {};
  for (const [from, to] of edges) (prereqs[to] = prereqs[to] ?? []).push(from);
  return nodes.map((n) => ({ ...n, prereqs: prereqs[n.id] ?? [] }));
}

/** The centred column layout, over nodes that carry their own prereqs. Shared
 *  by the single-shot pass and the stream's settling pass, so a streamed map
 *  and a generated-in-one-piece map are laid out identically. */
function layoutMapNodes(mapNodes: MapNode[]): MapNode[] {
  const { edges } = graphFromMapNodes(mapNodes);
  return withPrereqs(
    layoutGraph(
      mapNodes.map(({ id, label, summary, ...axes }) => ({
        id,
        label,
        summary,
        ...nodeAxes(axes),
      })),
      edges,
    ),
    edges,
  );
}

/**
 * The map's own prompt — nothing else. Split from the placement questions so
 * this call is small and fast: the learner sees the map assemble long before
 * any question is ready, instead of waiting on one combined generation.
 *
 * This is the single-shot pass: fully validated (edge-count floor, DAG check)
 * with `generateJson`'s one corrective retry. `generateMapStream` below is what
 * a learner normally gets; this stays the fallback when the stream fails before
 * its first frame, and the reference the streamed payload must round-trip to.
 */
export async function generateMap(
  params: MapParams,
): Promise<CurriculumMapPayload | { scopes: ScopeOffer[] }> {
  params = await withSyllabus(params);
  const { language = "en" } = params;
  const bounds = mapNodeBounds(
    params.goal === "pareto" ? (params.paretoPct ?? PARETO_DEFAULT) : undefined,
  );
  const raw = await generateJson<
    | { scopes: ScopeOffer[] }
    | { nodes: RawConcept[]; edges: ConceptEdge[]; meta?: MapMeta }
  >(
    user(
      `${mapContext(params)}

Otherwise return JSON:
${graphShape(bounds.ask)}

${mapRules(bounds.ask, params.goal)}${languageNote(language)}`,
    ),
    (r) => {
      const scopes = validateScopeOffer(r);
      return scopes ? { scopes } : validateGraphPart(r, bounds, params.goal);
    },
    { label: "curriculum-map" },
  );
  if ("scopes" in raw) return { scopes: raw.scopes };
  const nodes = withPrereqs(layoutGraph(raw.nodes, raw.edges), raw.edges);
  noteChain(nodes, params.topic);
  return raw.meta ? { nodes, meta: raw.meta } : { nodes };
}

/**
 * The map, one concept at a time.
 *
 * This is the generation no cache can hide (the node ids don't exist until it
 * returns, so it can never be warmed) and the one SPEC §2 asks to *watch*:
 * "animates nodes into place foundations-first". Asking for the concepts as
 * separate top-level objects in prerequisite order makes that literal — each
 * one is placed the moment it is written instead of after the last edge of the
 * last node.
 *
 * Layout is still computed here, never trusted from the model. A node's column
 * is `1 + max(depth of its prereqs)`, which — because prereqs always precede
 * their dependants — is exactly the longest-path depth `layoutGraph` computes,
 * so a node's x is final the moment it arrives. Only y is provisional: columns
 * are centred, and a column's height isn't known until the stream ends. The
 * final pass re-yields every node at its original index with the settled
 * layout, which `framesToPayload` folds over the provisional one.
 */
export async function* generateMapStream(params: MapParams): AsyncGenerator<StreamFrame> {
  params = await withSyllabus(params);
  const { language = "en" } = params;
  const bounds = mapNodeBounds(
    params.goal === "pareto" ? (params.paretoPct ?? PARETO_DEFAULT) : undefined,
  );
  let yielded = 0;
  try {
    const seen: SeenConcepts = new Map();
    const depth: Record<string, number> = {};
    const column: Record<number, number> = {};
    const accepted: MapNode[] = [];
    // Set by the "about" object, which comes first: every concept after it
    // inherits the topic's domain unless it says why not (W2.3).
    let topicDomain: MapMeta["domain"] | undefined;

    const guard = restartGuard((raw, i) =>
      validateMapConcept(raw, i, seen, params.goal, topicDomain),
    );
    const stream = streamJsonObjects<
      | { scopes: ScopeOffer[] }
      | { about: MapMeta }
      | { restarted: true }
      | (RawConcept & { prereqs: string[] })
    >(
      user(
        `${mapContext(params)}

Otherwise write SEPARATE top-level JSON objects, one after another — NOT
wrapped in an array or a {"nodes": [...]} object, no markdown fences, no
numbering, no commentary before/after/between them. The FIRST object is the
map as a whole:
${ABOUT_SHAPE}
Then the concepts, in prerequisite order: every concept another one depends on must already have been
written above it. Each object has this shape:
${NODE_SHAPE.slice(0, -1)}, "prereqs": ["ids of concepts already written above"]}

"prereqs" is empty only for true foundations — every other concept names at
least one. ${mapRules(bounds.ask, params.goal)}${languageNote(language)}`,
      ),
      (raw, index) => {
        // The too-broad answer is a single object and comes before any
        // concept, so it comes down this same wire untouched (#30).
        const offers = accepted.length === 0 ? validateScopeOffer(raw) : null;
        if (offers) return { scopes: offers };
        const about = (raw as { about?: unknown } | null)?.about;
        if (about && accepted.length === 0) return { about: asMapMeta(about) };
        return guard(raw, index);
      },
      { label: "curriculum-map-stream" },
    );

    for await (const item of stream) {
      if ("restarted" in item) break;
      if ("about" in item) {
        topicDomain = item.about.domain;
        yield { p: "meta", v: item.about };
        continue;
      }
      // The too-broad answer is the whole reply, and always arrives first (the
      // validator only accepts it at index 0), so there is nothing to reconcile.
      if ("scopes" in item) {
        for (const [i, v] of item.scopes.entries()) yield { p: "scopes", i, v };
        return;
      }
      if (accepted.length >= bounds.max) break;
      const d = item.prereqs.reduce((max, p) => Math.max(max, (depth[p] ?? 0) + 1), 0);
      depth[item.id] = d;
      const i = column[d] ?? 0;
      column[d] = i + 1;
      // Final x and final *spacing*; only the column's vertical offset is
      // provisional, since centring needs a height the stream doesn't have yet.
      // The settling pass slides each column up as one piece — nodes never
      // re-space and never cross.
      const node: MapNode = {
        ...item,
        // Provisional: the neighbour count Connect is rationed on is only known
        // once the map is whole, so the settling pass resolves it again.
        phasePlan: resolvePlan(
          item.kind,
          item.domain,
          item.importance,
          item.difficulty,
          evidence(item),
        ),
        state: "unknown",
        g: d + 1,
        week: 0,
        x: 110 + d * 245 + (i % 2 === 1 ? 30 : 0),
        y: 440 + i * 140,
      };
      accepted.push(node);
      yield { p: "nodes", i: yielded++, v: node };
    }

    const settled = layoutMapNodes(await backstopAxes(accepted, params));
    // The one whole-graph check per-concept validation can't make. Throwing
    // here is deliberate: it is mid-stream, so nothing is written to
    // `content_cache` and reopening retries, while the learner keeps the map
    // already on their screen.
    if (settled.length < bounds.min) fail(`a ${settled.length}-concept map is too short`);
    if (settled.reduce((n, node) => n + node.prereqs.length, 0) < settled.length - 4)
      fail("too few prerequisites — every concept past the foundations needs one");
    for (const [i, v] of settled.entries()) yield { p: "nodes", i, v };
    noteChain(settled, params.topic);
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "map_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const result = await generateMap(params);
    if ("scopes" in result) {
      for (const [i, v] of result.scopes.entries()) yield { p: "scopes", i, v };
      return;
    }
    if (result.meta) yield { p: "meta", v: result.meta };
    for (const [i, v] of result.nodes.entries()) yield { p: "nodes", i, v };
  }
}

// The prompt half lives in `./mapPrompt` now. Re-exported here so every call
// site that already imports these from `./map` (or from the barrel) keeps
// working — the split is internal, not a change to this module's surface.
export {
  DOMAIN_MAP_RULE,
  DOMAIN_RULE,
  KIND_RULE,
  SUMMARY_RULE,
  mapNodeBounds,
  type MapParams,
} from "./mapPrompt";

export { validateDiagnosticQuestion, type RawDiagnostic } from "./diagnosticQuestion";
