// ---- kind: curriculum map --------------------------------------------------
import { arr, fail, languageNote, obj, str, user } from "./common";
import {
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
  asDiagnosticKind,
  asDomain,
  resolvePlan,
  type DiagnosticKind,
  type Domain,
  NodeKind,
  PARETO_DEFAULT,
  asNodeKind,
  graphFromMapNodes,
} from "@/lib/curriculum";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** The map on the wire: a flat list of laid-out nodes, each carrying its own
 *  prerequisites. Flat because the map streams one concept at a time and
 *  `framesToPayload` can only assemble flat parts — `graphFromMapNodes` turns
 *  it back into a `ConceptGraph` on both sides. */
export interface CurriculumMapPayload {
  nodes: MapNode[];
}

/** A scoped sub-map offer returned instead of a map when the topic is too
 *  broad to be one coherent 12-18 node map (#30). */
export interface ScopeOffer {
  label: string;
  note: string;
}

/** A validated concept before layout — the same shape whether it arrived in one
 *  payload or one streamed object at a time. */
type RawConcept = {
  id: string;
  label: string;
  summary?: string;
  kind: NodeKind;
  domain: Domain;
};

/** A node id as the map stores it — written at five sites before this existed. */
const slug = (v: unknown, at: string) =>
  str(v, at)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");

/** Column layout from topological depth — deterministic, draggable afterwards. */
function layoutGraph(
  rawNodes: Array<{
    id: string;
    label: string;
    summary?: string;
    kind: NodeKind;
    domain?: Domain;
  }>,
  edges: ConceptEdge[],
): ConceptNode[] {
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
  const nodes: ConceptNode[] = rawNodes.map((n) => {
    const d = depth[n.id];
    const col = byCol[d];
    const i = col.indexOf(n.id);
    return {
      id: n.id,
      label: n.label,
      summary: n.summary,
      kind: n.kind,
      domain: n.domain,
      // Resolved here, once, and stored on the node. Recomputing it on every
      // read would mean shipping a new catalogue silently re-cut the ladder
      // under a run already in progress.
      phasePlan: resolvePlan(n.kind, n.domain ?? "general"),
      state: "unknown" as const,
      g: d + 1,
      week: 0,
      x: 110 + d * 245 + (i % 2 === 1 ? 30 : 0),
      y: 440 + (i - (col.length - 1) / 2) * 140,
    };
  });
  return nodes;
}

/** One placement question, before `tag` and `difficulty` are attached. */
export interface RawDiagnostic {
  nodeId: string;
  q: string;
  note: string;
  type: DiagnosticKind;
  opts: Array<{ label: string }>;
  correctIndex: number;
  /** The answer key, shaped by `type` — see `DiagnosticQuestion.expected`. */
  expected?: string[];
  gapLabel?: string;
  gapReason?: string;
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
): { nodes: RawConcept[]; edges: ConceptEdge[] } {
  const root = obj(raw, "payload");
  const seen = new Set<string>();
  const nodes = arr(root.nodes, "nodes", bounds.min, bounds.max).map((v, i) => {
    const n = obj(v, `nodes[${i}]`);
    const id = slug(n.id, `nodes[${i}].id`);
    if (seen.has(id)) fail(`duplicate node id "${id}"`);
    seen.add(id);
    return {
      id,
      label: str(n.label, `nodes[${i}].label`),
      // A missing sentence costs one node its rail copy, not the learner their
      // whole map — the rail falls back to the state line.
      summary: n.summary ? str(n.summary, `nodes[${i}].summary`) : undefined,
      // Defaulted, never failed: one bad discriminator must not cost a whole
      // map, and "concept" is exactly the behaviour every node had before
      // kinds existed.
      kind: asNodeKind(n.kind),
      // Same softness as `kind`: an unrecognised domain becomes `general`, which
      // is exactly how every node behaved before this axis existed.
      domain: asDomain(n.domain),
    };
  });
  const edges: ConceptEdge[] = [];
  // Bounded to match the check below, which is the real floor: it tolerates up
  // to four roots, while `nodes.length - 1` demanded a spanning tree of the RAW
  // list. 80 rejected any wide map with three prereqs a node (40 → 117 edges).
  const floor = Math.max(1, nodes.length - 4);
  for (const [i, v] of arr(root.edges, "edges", floor, 400).entries()) {
    const e = arr(v, `edges[${i}]`, 2, 3);
    const from = slug(e[0], `edges[${i}][0]`);
    const to = slug(e[1], `edges[${i}][1]`);
    if (!seen.has(from) || !seen.has(to) || from === to) continue; // drop, don't fail
    edges.push([from, to]);
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
  return { nodes, edges };
}

/** One objective placement question, checked against the offered node
 *  candidates and the model's own option count. */
export function validateDiagnosticQuestion(
  raw: unknown,
  nodeIds: Set<string>,
): RawDiagnostic {
  const d = obj(raw, "payload");
  const nodeId = str(d.nodeId, "nodeId")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  if (!nodeIds.has(nodeId))
    fail(`nodeId "${nodeId}" is not one of the offered candidates`);
  const type = asDiagnosticKind(d.type);
  // Each kind carries exactly what `gradeDiagnostic` needs to rule on it, and
  // nothing else. A kind whose answer key is missing is unmarkable, so it
  // fails here rather than passing every learner silently.
  const opts =
    type === "mcq" || type === "order"
      ? arr(d.opts, "opts", type === "mcq" ? 4 : 3, type === "mcq" ? 4 : 6).map(
          (o, j) => ({ label: str(o, `opts[${j}]`) }),
        )
      : [];
  let expected: string[] | undefined;
  if (type === "compute") expected = [str(d.expected, "expected")];
  else if (type === "speak")
    expected = arr(d.accept, "accept", 1, 6).map((a, j) => str(a, `accept[${j}]`));
  else if (type === "order") {
    expected = arr(d.correctOrder, "correctOrder", opts.length, opts.length).map((o, j) =>
      str(o, `correctOrder[${j}]`),
    );
    const labels = new Set(opts.map((o) => o.label));
    for (const label of expected)
      if (!labels.has(label))
        fail(`correctOrder names "${label}", which is not one of the options`);
    // Membership alone let `["A","A","B"]` through, which `checkOrder` compares
    // element-wise — an unpassable probe that then spawns a gap off the answer.
    if (new Set(expected).size !== expected.length)
      fail("correctOrder must use each option exactly once");
  }
  if (type === "mcq") {
    if (
      typeof d.correctIndex !== "number" ||
      !Number.isInteger(d.correctIndex) ||
      d.correctIndex < 0 ||
      d.correctIndex > 3
    )
      fail("correctIndex must be an integer 0-3");
  }
  return {
    nodeId,
    q: str(d.q, "q"),
    note: str(d.note, "note"),
    type,
    opts,
    // -1 is the honest value where there is nothing to pick, and is what
    // `gradeDiagnostic` will never match against.
    correctIndex: type === "mcq" ? (d.correctIndex as number) : -1,
    expected,
    gapLabel: d.gapLabel ? str(d.gapLabel, "gapLabel") : undefined,
    gapReason: d.gapReason ? str(d.gapReason, "gapReason") : undefined,
  };
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
      mapNodes.map(({ id, label, summary, kind, domain }) => ({
        id,
        label,
        summary,
        kind: asNodeKind(kind),
        domain: asDomain(domain),
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
  const { language = "en" } = params;
  const bounds = mapNodeBounds(
    params.goal === "pareto" ? (params.paretoPct ?? PARETO_DEFAULT) : undefined,
  );
  const raw = await generateJson<
    | { scopes: ScopeOffer[] }
    | {
        nodes: Array<{
          id: string;
          label: string;
          summary?: string;
          kind: NodeKind;
          domain: Domain;
        }>;
        edges: ConceptEdge[];
      }
  >(
    user(
      `${mapContext(params)}

Otherwise return JSON:
${graphShape(bounds.ask)}

${mapRules(bounds.ask)}${languageNote(language)}`,
    ),
    (r) => {
      const scopes = validateScopeOffer(r);
      return scopes ? { scopes } : validateGraphPart(r, bounds);
    },
    { label: "curriculum-map" },
  );
  if ("scopes" in raw) return { scopes: raw.scopes };
  return { nodes: withPrereqs(layoutGraph(raw.nodes, raw.edges), raw.edges) };
}

/** One streamed concept, before layout: its id, its label, and the concepts it
 *  depends on — which must already have been written, so a forward reference is
 *  dropped rather than believed. That one rule is what makes a prerequisite
 *  cycle structurally impossible without a whole-graph check. */
export function validateMapConcept(
  raw: unknown,
  index: number,
  seen: Set<string>,
): RawConcept & { prereqs: string[] } {
  const c = obj(raw, `concept[${index}]`);
  const id = slug(c.id, `concept[${index}].id`);
  if (seen.has(id)) fail(`duplicate node id "${id}"`);
  const prereqs = Array.isArray(c.prereqs)
    ? c.prereqs
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
        // Forward and self references are dropped, not failed: one hallucinated
        // id must not cost the learner the whole map.
        .filter((p) => seen.has(p) && p !== id)
    : [];
  return {
    id,
    label: str(c.label, `concept[${index}].label`),
    // Soft, like the single-shot validator: a concept that arrives without its
    // sentence still lands on the map.
    summary: c.summary ? str(c.summary, `concept[${index}].summary`) : undefined,
    // Same softness: an unrecognised discriminator becomes `concept`, which is
    // what every node was before kinds existed.
    kind: asNodeKind(c.kind),
    domain: asDomain(c.domain),
    prereqs,
  };
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
  const { language = "en" } = params;
  const bounds = mapNodeBounds(
    params.goal === "pareto" ? (params.paretoPct ?? PARETO_DEFAULT) : undefined,
  );
  let yielded = 0;
  try {
    const seen = new Set<string>();
    const depth: Record<string, number> = {};
    const column: Record<number, number> = {};
    const accepted: MapNode[] = [];

    const stream = streamJsonObjects<
      | { scopes: ScopeOffer[] }
      | {
          id: string;
          label: string;
          summary?: string;
          kind: NodeKind;
          domain: Domain;
          prereqs: string[];
        }
    >(
      user(
        `${mapContext(params)}

Otherwise write the concepts as SEPARATE top-level JSON objects, one after
another — NOT wrapped in an array or a {"nodes": [...]} object, no markdown
fences, no numbering, no commentary before/after/between them. Write them in
prerequisite order: every concept another one depends on must already have been
written above it. Each object has this shape:
{"id": "short-kebab-id", "label": "Concept Name", "summary": "one sentence on what this concept is", "kind": "fact|concept|procedure|principle", "domain": "formal|executable|empirical|interpretive|performative|craft|general", "prereqs": ["ids of concepts already written above"]}

"prereqs" is empty only for true foundations — every other concept names at
least one. ${mapRules(bounds.ask)}${languageNote(language)}`,
      ),
      (raw, index) => {
        // The too-broad answer is a single object and always the first one, so
        // it comes down this same wire untouched (#30).
        const offers = index === 0 ? validateScopeOffer(raw) : null;
        if (offers) return { scopes: offers };
        return validateMapConcept(raw, index, seen);
      },
      { label: "curriculum-map-stream" },
    );

    for await (const item of stream) {
      // The too-broad answer is the whole reply, and always arrives first (the
      // validator only accepts it at index 0), so there is nothing to reconcile.
      if ("scopes" in item) {
        for (const [i, v] of item.scopes.entries()) yield { p: "scopes", i, v };
        return;
      }
      if (accepted.length >= bounds.max) break;
      seen.add(item.id);
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
        phasePlan: resolvePlan(item.kind, item.domain ?? "general"),
        state: "unknown",
        g: d + 1,
        week: 0,
        x: 110 + d * 245 + (i % 2 === 1 ? 30 : 0),
        y: 440 + i * 140,
      };
      accepted.push(node);
      yield { p: "nodes", i: yielded++, v: node };
    }

    const settled = layoutMapNodes(accepted);
    // The one whole-graph check per-concept validation can't make. Throwing
    // here is deliberate: it is mid-stream, so nothing is written to
    // `content_cache` and reopening retries, while the learner keeps the map
    // already on their screen.
    const edgeCount = settled.reduce((n, node) => n + node.prereqs.length, 0);
    if (edgeCount < settled.length - 4)
      fail("too few prerequisites — every concept past the foundations needs one");
    for (const [i, v] of settled.entries()) yield { p: "nodes", i, v };
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
