// ---- kind: curriculum map --------------------------------------------------
import { arr, fail, languageNote, obj, sizeRule, str, user } from "./common";
import {
  ConceptEdge,
  ConceptNode,
  GoalKind,
  MapNode,
  PARETO_DEFAULT,
  graphFromMapNodes,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
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

const GOAL_HINT: Record<GoalKind, string> = {
  exam: "The learner is preparing for an exam — cover the canonical syllabus.",
  project: "The learner wants to build something real — bias toward applicable tools.",
  mastery: "The learner wants deep general mastery — favor conceptual foundations.",
  pareto: "", // supplied per-request by `paretoNote` — it depends on the chosen share.
};

/** Column layout from topological depth — deterministic, draggable afterwards. */
function layoutGraph(
  rawNodes: Array<{ id: string; label: string; summary?: string }>,
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
  opts: Array<{ label: string }>;
  correctIndex: number;
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
): {
  nodes: Array<{ id: string; label: string; summary?: string }>;
  edges: ConceptEdge[];
} {
  const root = obj(raw, "payload");
  const seen = new Set<string>();
  const nodes = arr(root.nodes, "nodes", bounds.min, bounds.max).map((v, i) => {
    const n = obj(v, `nodes[${i}]`);
    const id = str(n.id, `nodes[${i}].id`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    if (seen.has(id)) fail(`duplicate node id "${id}"`);
    seen.add(id);
    return {
      id,
      label: str(n.label, `nodes[${i}].label`),
      // A missing sentence costs one node its rail copy, not the learner their
      // whole map — the rail falls back to the state line.
      summary: n.summary ? str(n.summary, `nodes[${i}].summary`) : undefined,
    };
  });
  const edges: ConceptEdge[] = [];
  for (const [i, v] of arr(root.edges, "edges", nodes.length - 1, 80).entries()) {
    const e = arr(v, `edges[${i}]`, 2, 3);
    const from = str(e[0], `edges[${i}][0]`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const to = str(e[1], `edges[${i}][1]`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
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
  const opts = arr(d.opts, "opts", 4, 4).map((o, j) => ({
    label: str(o, `opts[${j}]`),
  }));
  if (
    typeof d.correctIndex !== "number" ||
    !Number.isInteger(d.correctIndex) ||
    d.correctIndex < 0 ||
    d.correctIndex > 3
  )
    fail("correctIndex must be an integer 0-3");
  return {
    nodeId,
    q: str(d.q, "q"),
    note: str(d.note, "note"),
    opts,
    correctIndex: d.correctIndex,
    gapLabel: d.gapLabel ? str(d.gapLabel, "gapLabel") : undefined,
    gapReason: d.gapReason ? str(d.gapReason, "gapReason") : undefined,
  };
}

export interface MapParams {
  topic: string;
  goal: GoalKind;
  /** Share of real-world results to cover when goal is "pareto" (#pareto):
   *  a smaller map of only the highest-leverage concepts. */
  paretoPct?: number;
  /** Extracted syllabus/outline text that grounds the map (#30), if uploaded. */
  outline?: string;
  language?: Language;
}

/** The opening every curriculum-adjacent prompt shares: what to build, what
 *  grounds it, and the too-broad escape hatch. */
function paretoNote(params: MapParams): string {
  if (params.goal !== "pareto") return "";
  const pct = params.paretoPct ?? PARETO_DEFAULT;
  return `The learner wants a Pareto map: only the concepts that carry roughly the top ${pct}% of real-world results in this topic, at the least effort. Ruthlessly drop edge cases, history, rarely-used variants and completeness-for-its-own-sake — keep what a competent practitioner actually uses ${pct === 80 ? "most weeks" : "every day"}. A smaller, higher-leverage map is the goal, not coverage.`;
}

/** Concept-count band per map: the range the prompt asks for, plus the
 *  validator bounds around it. A Pareto map is deliberately smaller. */
export function mapNodeBounds(paretoPct?: number): {
  ask: [number, number];
  min: number;
  max: number;
} {
  // The band is wide on purpose and the prompt picks from it: a topic that is
  // one technique is not 12 concepts, and asking for 12 anyway got 12 — the
  // surplus arriving as chapter headings and split hairs.
  if (paretoPct === undefined) return { ask: [6, 16], min: 5, max: 20 };
  // 20% -> ~7 concepts, 50% -> ~12, 80% -> ~17.
  const target = Math.round(4 + (paretoPct / 100) * 16);
  return {
    ask: [target - 1, target + 1],
    min: Math.max(4, target - 3),
    max: target + 4,
  };
}

function mapContext(params: MapParams): string {
  const { topic, goal, outline } = params;
  const grounding = outline?.trim()
    ? `\nGround the map in this course outline the learner uploaded — its units and their order are the source of truth for what to cover:\n"""\n${outline.trim().slice(0, 6000)}\n"""\n`
    : "";
  return `Build a prerequisite concept map for the topic "${topic}". ${GOAL_HINT[goal]}${paretoNote(params)}
${grounding}
If (and only if) the topic is far too broad for one coherent concept map (e.g. "science", "math", "history"), instead return ONE object and nothing else:
{"tooBroad": true, "scopes": [{"label": "a focused sub-topic (2-4 words)", "note": "one sentence on what this scoped map covers"}, ...]}   // exactly 2-3 offers`;
}

const graphShape = (ask: [number, number]) => `{
  "nodes": [{"id": "short-kebab-id", "label": "Concept Name", "summary": "one sentence on what this concept is"}, ...],   // ${ask[0]} to ${ask[1]} concepts, foundations through capstone
  "edges": [["prereq-id", "dependent-id"], ...]                        // direction is prerequisite -> dependent; must form a DAG; every non-root node needs at least one prerequisite
}`;

/** The summary rule, shared by the single-shot and streamed map prompts: it is
 *  the only thing the detail rail says about the topic itself, so it has to
 *  teach the gist rather than restate the label. */
export const SUMMARY_RULE = `"summary" is ONE sentence (max ~22 words) telling a learner who has never met this concept what it actually is and what it lets them do — concrete and specific to this topic. Never restate the label ("Gradient Descent is about gradient descent"), never describe the concept's role in the map or its difficulty, never start with "This concept".`;

const mapRules = (ask: [number, number]) =>
  `Rules: labels are 1-3 words, title case. ${SUMMARY_RULE}
${sizeRule({
  unit: "concepts",
  min: ask[0],
  max: ask[1],
  atMin:
    "a topic that is one technique or one mechanism, where a handful of concepts genuinely is the whole of it",
  atMax: "a broad field with several separate branches a learner must cross",
})}
The map must read left-to-right from true foundations to the topic's capstone ideas. Every node is a CONCEPT the learner can be taught and then tested on — never a chapter heading or a container: no "Introduction", "Overview", "Fundamentals", "Advanced Topics", "Applications", "Conclusion".`;

/** Attach each node's prerequisites, so a laid-out map travels as one flat
 *  list. The inverse of `graphFromMapNodes`. */
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
      mapNodes.map(({ id, label, summary }) => ({ id, label, summary })),
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
        nodes: Array<{ id: string; label: string; summary?: string }>;
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
): { id: string; label: string; summary?: string; prereqs: string[] } {
  const c = obj(raw, `concept[${index}]`);
  const id = str(c.id, `concept[${index}].id`)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
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
      | { id: string; label: string; summary?: string; prereqs: string[] }
    >(
      user(
        `${mapContext(params)}

Otherwise write the concepts as SEPARATE top-level JSON objects, one after
another — NOT wrapped in an array or a {"nodes": [...]} object, no markdown
fences, no numbering, no commentary before/after/between them. Write them in
prerequisite order: every concept another one depends on must already have been
written above it. Each object has this shape:
{"id": "short-kebab-id", "label": "Concept Name", "summary": "one sentence on what this concept is", "prereqs": ["ids of concepts already written above"]}

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
