// The content engine: one generator per content kind. Each builds a prompt,
// asks OpenRouter for JSON (generateJson validates + retries once), then
// post-processes into the exact shapes the client renders — layout, ids, and
// gap offsets are computed here, never trusted from the model.

import {
  DIAGNOSTIC_COUNT,
  FEYNMAN_BEATS,
  MODEL_BEAT_BOUNDS,
  SOCRATIC_MAX_STEPS,
  SOCRATIC_MIN_STEPS,
  SOCRATIC_SPARES,
  SOCRATIC_STEPS,
  altControls,
  graphFromMapNodes,
  lensNote,
  type AltKey,
  type ConceptEdge,
  type ConceptNode,
  type ConsumeChunk,
  type ConsumeFigure,
  type ConsumeModelBeat,
  type ConsumePrediction,
  type CrucibleContent,
  type DiagnosticDifficulty,
  type DiagnosticQuestion,
  type ElaborationContent,
  type FeynmanBeat,
  type ForecastTone,
  type GoalKind,
  type MapNode,
  type RetainContent,
  type ReviewCard,
  type SocraticStep,
} from "@/lib/curriculum";
import {
  generateJson,
  streamJsonObjects,
  streamJsonObjectsProgressive,
  type ChatMessage,
} from "@/lib/server/openrouter";
import { CONSUME_SECTION_SHAPE, MODEL_BEAT_SHAPE } from "@/lib/server/generate/shapes";
import type { StreamFrame } from "@/lib/server/stream";

// ---- tiny validation helpers (throw readable errors for the retry loop) ----

function fail(msg: string): never {
  throw new Error(msg);
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(`${name} must be an object`);
  return v as Record<string, unknown>;
}

function arr(v: unknown, name: string, min = 1, max = 40): unknown[] {
  if (!Array.isArray(v)) fail(`${name} must be an array`);
  if (v.length < min || v.length > max)
    fail(`${name} must have ${min}-${max} items (got ${v.length})`);
  return v;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) fail(`${name} must be a non-empty string`);
  return v.trim();
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  const s = str(v, name);
  if (!allowed.includes(s as T))
    fail(`${name} must be one of ${allowed.join(", ")} (got "${s}")`);
  return s as T;
}

// Phrases from our own prompt templates that must never appear verbatim in
// generated learner-facing labels — a match means the model echoed the
// template instead of writing a concrete answer (#10).
const TEMPLATE_ECHOES = [
  "a complete, precise answer",
  "a hand-wave",
  "you'll feel it",
  "just trust it",
  "confidently wrong answer",
  "a real misconception",
  "what the learner says",
  "a common misconception as",
];

function rejectEcho(label: string, name: string): string {
  const lower = label.toLowerCase();
  for (const phrase of TEMPLATE_ECHOES)
    if (lower.includes(phrase))
      fail(
        `${name} echoes the prompt template ("${phrase}") — write the concrete answer itself, not a description of it`,
      );
  return label;
}

/** Reject "X instead of X" non-errors — a named error must actually differ (#10).
 *  Observed live: "resulting in [4, 2] instead of [4, 2]". */
function rejectSelfIdenticalError(text: string, name: string): string {
  const lower = text.toLowerCase();
  const marker = " instead of ";
  const idx = lower.indexOf(marker);
  if (idx === -1) return text;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const before = norm(lower.slice(0, idx));
  const tail = norm(
    lower.slice(idx + marker.length).split(/[.;!?]|,\s(?:so|which|and)\b/)[0] ?? "",
  );
  if (tail && before.endsWith(tail)) {
    // Token boundary: "…wrote 16 instead of 6" must not match on the "6".
    const ch = before[before.length - tail.length - 1] ?? " ";
    if (!/[a-z0-9]/.test(ch))
      fail(
        `${name} names an error where before and after are identical ("${tail}") — describe a real, different error`,
      );
  }
  return text;
}

const SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You are the content engine of Atlas, a mastery-learning platform built on a living concept map. " +
    "You produce rigorous, honest pedagogy: precise definitions, desirable difficulties, anti-sycophancy " +
    "(wrong reasoning is caught and named, never smoothed over). " +
    "Reply with ONLY one valid JSON object — no markdown fences, no prose before or after.",
};

function user(content: string): ChatMessage[] {
  return [SYSTEM, { role: "user", content }];
}

// Server-safe copy of lib/i18n.tsx's type — that file is "use client" and
// must never be imported from server code, so this is redeclared here (the
// base engine file) and re-exported for lib/server/job.ts to use.
export type Language = "en" | "pt-BR";

/** Appended to every prompt. Field NAMES stay English (the app parses fixed
 *  keys) — only the natural-language VALUES the model writes should switch. */
function languageNote(language: Language | undefined): string {
  return language === "pt-BR"
    ? "\n\nRespond entirely in Brazilian Portuguese (pt-BR): every natural-language string value. Keep all JSON field names and enum values (e.g. \"correct\", \"mastered\") exactly as specified in English."
    : "";
}

/** Personal-interest flavoring shared by several prompts. */
function interestNote(interests: string): string {
  return interests.trim()
    ? `Where an analogy helps, draw it from the learner's stated interests (${interests.trim()}) — but only when it genuinely fits.`
    : "Use concrete, everyday analogies when they genuinely fit.";
}

// ---- kind: curriculum map --------------------------------------------------

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
};

/** Column layout from topological depth — deterministic, draggable afterwards. */
function layoutGraph(
  rawNodes: Array<{ id: string; label: string }>,
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
export function validateGraphPart(raw: unknown): {
  nodes: Array<{ id: string; label: string }>;
  edges: ConceptEdge[];
} {
  const root = obj(raw, "payload");
  const seen = new Set<string>();
  const nodes = arr(root.nodes, "nodes", 10, 24).map((v, i) => {
    const n = obj(v, `nodes[${i}]`);
    const id = str(n.id, `nodes[${i}].id`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    if (seen.has(id)) fail(`duplicate node id "${id}"`);
    seen.add(id);
    return { id, label: str(n.label, `nodes[${i}].label`) };
  });
  const edges: ConceptEdge[] = [];
  for (const [i, v] of arr(root.edges, "edges", nodes.length - 1, 80).entries()) {
    const e = arr(v, `edges[${i}]`, 2, 3);
    const from = str(e[0], `edges[${i}][0]`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const to = str(e[1], `edges[${i}][1]`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
  const nodeId = str(d.nodeId, "nodeId").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!nodeIds.has(nodeId)) fail(`nodeId "${nodeId}" is not one of the offered candidates`);
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
  /** Extracted syllabus/outline text that grounds the map (#30), if uploaded. */
  outline?: string;
  language?: Language;
}

/** The opening every curriculum-adjacent prompt shares: what to build, what
 *  grounds it, and the too-broad escape hatch. */
function mapContext(params: MapParams): string {
  const { topic, goal, outline } = params;
  const grounding = outline?.trim()
    ? `\nGround the map in this course outline the learner uploaded — its units and their order are the source of truth for what to cover:\n"""\n${outline.trim().slice(0, 6000)}\n"""\n`
    : "";
  return `Build a prerequisite concept map for the topic "${topic}". ${GOAL_HINT[goal]}
${grounding}
If (and only if) the topic is far too broad for one coherent 12-18 concept map (e.g. "science", "math", "history"), instead return ONE object and nothing else:
{"tooBroad": true, "scopes": [{"label": "a focused sub-topic (2-4 words)", "note": "one sentence on what this scoped map covers"}, ...]}   // exactly 2-3 offers`;
}

const GRAPH_SHAPE = `{
  "nodes": [{"id": "short-kebab-id", "label": "Concept Name"}, ...],   // 12 to 18 concepts, foundations through capstone
  "edges": [["prereq-id", "dependent-id"], ...]                        // direction is prerequisite -> dependent; must form a DAG; every non-root node needs at least one prerequisite
}`;

const MAP_RULES =
  "Rules: labels are 1-3 words, title case. Node count 12-18. The map must read left-to-right from true foundations to the topic's capstone ideas.";

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
      mapNodes.map(({ id, label }) => ({ id, label })),
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
  const raw = await generateJson<
    | { scopes: ScopeOffer[] }
    | { nodes: Array<{ id: string; label: string }>; edges: ConceptEdge[] }
  >(
    user(
      `${mapContext(params)}

Otherwise return JSON:
${GRAPH_SHAPE}

${MAP_RULES}${languageNote(language)}`,
    ),
    (r) => {
      const scopes = validateScopeOffer(r);
      return scopes ? { scopes } : validateGraphPart(r);
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
): { id: string; label: string; prereqs: string[] } {
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
  return { id, label: str(c.label, `concept[${index}].label`), prereqs };
}

/** The map's node-count bounds, mirroring `validateGraphPart` rather than the
 *  12-18 the prompt asks for. `Job.shape` uses the same numbers. */
export const MAP_NODE_BOUNDS = { min: 10, max: 24 } as const;

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
  let yielded = 0;
  try {
    const seen = new Set<string>();
    const depth: Record<string, number> = {};
    const column: Record<number, number> = {};
    const accepted: MapNode[] = [];

    const stream = streamJsonObjects<
      { scopes: ScopeOffer[] } | { id: string; label: string; prereqs: string[] }
    >(
      user(
        `${mapContext(params)}

Otherwise write the concepts as SEPARATE top-level JSON objects, one after
another — NOT wrapped in an array or a {"nodes": [...]} object, no markdown
fences, no numbering, no commentary before/after/between them. Write them in
prerequisite order: every concept another one depends on must already have been
written above it. Each object has this shape:
{"id": "short-kebab-id", "label": "Concept Name", "prereqs": ["ids of concepts already written above"]}

"prereqs" is empty only for true foundations — every other concept names at
least one. ${MAP_RULES}${languageNote(language)}`,
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
      if (accepted.length >= MAP_NODE_BOUNDS.max) break;
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

const DIFFICULTY_HINT: Record<DiagnosticDifficulty, string> = {
  easy: "a question anyone with cursory exposure to the topic would answer correctly",
  medium: "a question testing solid working knowledge, not just recognition",
  hard: "a question that separates genuine mastery from surface familiarity",
};

export interface DiagnosticQuestionParams {
  topic: string;
  goal: GoalKind;
  interests: string;
  language?: Language;
  /** Concept nodes this question may probe — already-asked nodes excluded, so
   *  the 5 questions never repeat a concept. */
  nodeCandidates: Array<{ id: string; label: string }>;
  difficulty: DiagnosticDifficulty;
  /** 0-based position in the placement — only used for the display tag. */
  index: number;
}

/**
 * One objective, ENEM-style placement question at the requested difficulty —
 * its own call, made only once the learner has answered the previous one,
 * since the next difficulty depends on that answer (see `stepDifficulty`).
 */
export async function generateDiagnosticQuestion(
  params: DiagnosticQuestionParams,
): Promise<DiagnosticQuestion> {
  const { language = "en", nodeCandidates, difficulty, index } = params;
  const nodeIds = new Set(nodeCandidates.map((n) => n.id));
  const candidateList = nodeCandidates.map((n) => `${n.id} (${n.label})`).join(", ");
  const raw = await generateJson(
    user(
      `Write ONE placement question for a learner of "${params.topic}", probing one of these concepts: ${candidateList}.

The question must be ${DIFFICULTY_HINT[difficulty]}.

Return JSON:
{
  "nodeId": "the concept id from the list above this question probes",
  "q": "the question",
  "note": "one sentence on what the answer changes about the map",
  "opts": ["option A", "option B", "option C", "option D"],
  "correctIndex": 0,
  "gapLabel": "the precise sub-concept a miss exposes (2-4 words)",
  "gapReason": "why it exposes that, phrased to the learner ('you missed ...')"
}

Rules: exactly one of the 4 options is correct; the other three are plausible distractors a partially-informed learner might pick, not throwaway wrong answers. Keep the question and options concise.${languageNote(language)}`,
    ),
    (r) => validateDiagnosticQuestion(r, nodeIds),
    { label: "diagnostic-question" },
  );
  return {
    tag: `Question ${index + 1} of ${DIAGNOSTIC_COUNT}`,
    q: raw.q,
    note: raw.note,
    nodeId: raw.nodeId,
    difficulty,
    opts: raw.opts,
    correctIndex: raw.correctIndex,
    gap:
      raw.gapLabel && raw.gapReason
        ? {
            id: `gap-diag-${raw.nodeId}`,
            label: raw.gapLabel,
            reason: raw.gapReason,
            dx: -85,
            dy: 148,
          }
        : undefined,
  };
}

// ---- kind: consume ---------------------------------------------------------

export function validateFigure(raw: unknown, name: string): ConsumeFigure {
  const f = obj(raw, name);
  const nodes = arr(f.nodes, `${name}.nodes`, 2, 8).map((v, i) => {
    const n = obj(v, `${name}.nodes[${i}]`);
    return {
      id: str(n.id, `${name}.nodes[${i}].id`),
      label: str(n.label, `${name}.nodes[${i}].label`),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) fail(`${name}.nodes have duplicate ids`);
  const edges = arr(f.edges, `${name}.edges`, 1, 12).map((v, i) => {
    const e = obj(v, `${name}.edges[${i}]`);
    const from = str(e.from, `${name}.edges[${i}].from`);
    const to = str(e.to, `${name}.edges[${i}].to`);
    if (!ids.has(from) || !ids.has(to))
      fail(`${name}.edges[${i}] references a node id that is not in nodes`);
    if (from === to) fail(`${name}.edges[${i}] points a node at itself`);
    return {
      from,
      to,
      label: typeof e.label === "string" && e.label.trim() ? e.label.trim() : undefined,
    };
  });
  return { nodes, edges };
}

/** A multiple-choice question with verdict copy — a section's closing check. */
function validatePrediction(raw: unknown, name: string): ConsumePrediction {
  const pred = obj(raw, name);
  const opts = arr(pred.opts, `${name}.opts`, 3, 3).map((o, j) => {
    const opt = obj(o, `${name}.opts[${j}]`);
    return {
      label: str(opt.label, `${name}.opts[${j}].label`),
      correct: opt.correct === true,
    };
  });
  if (opts.filter((o) => o.correct).length !== 1)
    fail(`${name}.opts must have exactly one correct option`);
  return {
    q: str(pred.q, `${name}.q`),
    opts,
    right: str(pred.right, `${name}.right`),
    wrong: str(pred.wrong, `${name}.wrong`),
  };
}

/** One section of the reading pass. Every lens a learner can open over it is
 *  its own on-demand generation (see "kind: model" below), so a section
 *  validates — and renders — the moment its own material is written. */
function validateConsumeSection(raw: unknown, i: number): ConsumeChunk {
  const c = obj(raw, `chunks[${i}]`);
  const ex = obj(c.example, `chunks[${i}].example`);
  // The model omits both together when a section isn't structural — a
  // definition or comparison doesn't get an invented box-and-arrow graph.
  const hasFigure = c.figure != null;
  return {
    id: `c${i + 1}`,
    kicker: str(c.kicker, `chunks[${i}].kicker`),
    terms: arr(c.terms ?? [], `chunks[${i}].terms`, 0, 3).map((t, j) => {
      const term = obj(t, `chunks[${i}].terms[${j}]`);
      return {
        t: str(term.t, `chunks[${i}].terms[${j}].t`),
        d: str(term.d, `chunks[${i}].terms[${j}].d`),
      };
    }),
    body: arr(c.body, `chunks[${i}].body`, 3, 5).map((p, j) =>
      str(p, `chunks[${i}].body[${j}]`),
    ),
    example: {
      title: str(ex.title, `chunks[${i}].example.title`),
      steps: arr(ex.steps, `chunks[${i}].example.steps`, 2, 6).map((s, j) =>
        str(s, `chunks[${i}].example.steps[${j}]`),
      ),
    },
    takeaway: str(c.takeaway, `chunks[${i}].takeaway`),
    cite: str(c.cite, `chunks[${i}].cite`),
    diagram: hasFigure ? str(c.diagram, `chunks[${i}].diagram`) : undefined,
    figure: hasFigure ? validateFigure(c.figure, `chunks[${i}].figure`) : undefined,
    ask: str(c.ask, `chunks[${i}].ask`),
    // The comprehension check that closes every section — a receipt for
    // reading it. Consume reads; anything the model volunteers before the
    // prose is dropped.
    check: validatePrediction(c.check, `chunks[${i}].check`),
  };
}

export function validateConsume(raw: unknown): ConsumeChunk[] {
  const root = obj(raw, "payload");
  return arr(root.chunks, "chunks", 4, 6).map(validateConsumeSection);
}

function consumeContext(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
}): string {
  const { topic, nodeLabel, prereqLabels, interests, language = "en" } = params;
  return `Write the Consume (first reading) pass for the concept "${nodeLabel}" within the topic "${topic}".
The learner already knows: ${prereqLabels.join(", ") || "nothing yet — this is a foundation"}.
${interestNote(interests)}

This is the READING phase — the learner is here to be taught, not tested. Write
real teaching material: explain the idea, show where it comes from, work an
example, name what usually goes wrong. Real questioning happens in later
phases, so the pass carries no questions before the prose — only one short
comprehension check per section ("check"), which closes it and which the
learner must get right before continuing. A check is a receipt for reading,
not a test: it asks for something stated or worked in THAT section's prose or
example, and its wrong options are plausible misreadings, never absurd.

Rules for the prose:
- Teach, don't summarize. Each section's body is 3-5 full paragraphs of 3-6
  sentences — enough that a learner who reads only this understands the idea.
- Be concrete: real numbers, real cases, the actual mechanism. No "it can be
  shown that", no bullet-point skeletons, no restating the section title.
- Build in order: what it is → why it works / where it comes from → how it
  behaves → where it breaks or is misused → how it connects onward.
- Name the common misconception explicitly and say why it is wrong.${languageNote(language)}`;
}

export async function generateConsume(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
}): Promise<ConsumeChunk[]> {
  return generateJson(
    user(
      `${consumeContext(params)}

Return JSON with 5 sections:
{
  "chunks": [${CONSUME_SECTION_SHAPE}, ...]
}`,
    ),
    validateConsume,
    { label: "consume" },
  );
}

/**
 * Streamed variant: sections render as they're written instead of the
 * learner waiting on all 5. Asks for 5 standalone JSON objects (not one
 * wrapping array, so each is a complete, parseable unit as soon as its
 * closing brace lands) and yields each the moment it validates.
 *
 * No corrective retry mid-stream — if the very first section fails to parse
 * or validate (the model ignored the format, a network hiccup), that's
 * indistinguishable from "nothing usable happened yet", so this falls back
 * to the proven, retried `generateConsume` instead of leaving the learner on
 * a stalled stream. A failure *after* at least one section has already
 * streamed out has no clean way to restart in place, so it just surfaces —
 * rare in practice since `generateConsume`'s single-shot path covers the
 * common failure mode (format non-compliance) upstream of this point.
 */
export async function* generateConsumeStream(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
}): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${consumeContext(params)}

Write the 5 sections as 5 SEPARATE top-level JSON objects, one after another
— NOT wrapped in an array or a {"chunks": [...]} object, no markdown fences,
no numbering, no commentary before/after/between them. Each object has this
shape:
${CONSUME_SECTION_SHAPE}${languageNote(params.language)}`,
      ),
      validateConsumeSection,
      { label: "consume-stream" },
    );
    for await (const chunk of stream) yield { p: "chunks", i: yielded++, v: chunk };
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "consume_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const chunks = await generateConsume(params);
    for (const [i, chunk] of chunks.entries()) yield { p: "chunks", i, v: chunk };
  }
}

// ---- kind: model -----------------------------------------------------------
// One lens, opened over one section of the reading (see `ConsumeModelBeat`).
//
// This is the only generation in the app the learner asks for *from inside* a
// screen they are already reading, which shapes it twice over: it streams, so
// the first beat lands while the rest are still being written, and it is keyed
// on the section's own prose rather than on the node — two learners looking at
// the same cached section through the same lens share the row, and a section
// generated at temperature 0.6 can never be handed a walkthrough written for
// somebody else's wording of it.

/** What each lens asks the model for. The learner-facing promise lives in
 *  `lensNote` (lib/curriculum.ts); these are its instructions. */
const LENS_BRIEF: Record<AltKey, string> = {
  simpler:
    "Strip the idea to its plainest form. Short sentences, no jargon that isn't defined on the spot, no loss of correctness — a plainer route to the same understanding, never a vaguer one.",
  example:
    "Work a SECOND, different concrete case end to end — different numbers, a different setting, the same mechanism. Show the actual work in each beat, never just describe it.",
  analogy:
    "Build one analogy from something the learner already understands and map it part by part onto the concept. Name where the analogy breaks down in the last beat — an unqualified analogy teaches a misconception.",
  deeper:
    "Go one layer below the reading: the precise statement, the condition that makes it hold, the case that motivates it. This is the small print a textbook would set apart — rigorous, and still explained.",
};

export function validateConsumeModelBeat(raw: unknown, i: number): ConsumeModelBeat {
  const b = obj(raw, `beats[${i}]`);
  return {
    label: rejectEcho(str(b.label, `beats[${i}].label`), `beats[${i}].label`),
    text: str(b.text, `beats[${i}].text`),
  };
}

/** A beat mid-sentence. `label` is written before `text`, so a redraw with a
 *  label and no prose is still worth showing — it names what is coming. */
function draftConsumeModelBeat(raw: unknown): ConsumeModelBeat | null {
  const b = raw as { label?: unknown; text?: unknown };
  const label = typeof b?.label === "string" ? b.label : "";
  const text = typeof b?.text === "string" ? b.text : "";
  return label || text ? { label, text } : null;
}

export function validateConsumeModel(raw: unknown): ConsumeModelBeat[] {
  const root = obj(raw, "payload");
  return arr(
    root.beats,
    "beats",
    MODEL_BEAT_BOUNDS.min,
    MODEL_BEAT_BOUNDS.max,
  ).map(validateConsumeModelBeat);
}

export interface ModelParams {
  topic: string;
  nodeLabel: string;
  /** Which of the four controls the learner tapped. */
  lens: AltKey;
  /** The section being looked at, as it is on screen behind the view. */
  kicker: string;
  body: string[];
  takeaway: string;
  interests: string;
  language?: Language;
}

/** The shared framing of both model-view prompts. */
function modelContext(params: ModelParams): string {
  const { topic, nodeLabel, lens, kicker, body, takeaway, interests } = params;
  const label = new Map(altControls("en")).get(lens) ?? lens;
  return `A learner is reading the section "${kicker}" of the pass on "${nodeLabel}" within "${topic}". This is the section, exactly as it sits on their screen:

${body.join("\n\n")}

Takeaway: ${takeaway}

They tapped "${label}" — "${lensNote(lens, "en")}" — which opens a MODEL VIEW over that section. ${LENS_BRIEF[lens]}

The section is NOT replaced: it stays on screen underneath, and they will go back to it. So:
- Cover the SAME material. A model view that drifts to a neighbouring topic strands the learner.
- Never restate the prose above sentence for sentence — they just read it. This is a different route through it.
- Write ${MODEL_BEAT_BOUNDS.min}-${MODEL_BEAT_BOUNDS.max} beats that are revealed one at a time and build in order, each picking up where the last left off. The first beat must stand on its own, since it is on screen while the rest are still being written.
${interestNote(interests)}`;
}

export async function generateConsumeModel(
  params: ModelParams,
): Promise<ConsumeModelBeat[]> {
  return generateJson(
    user(
      `${modelContext(params)}

Return JSON:
{
  "beats": [${MODEL_BEAT_SHAPE}, ...]
}${languageNote(params.language)}`,
    ),
    validateConsumeModel,
    { label: "model" },
  );
}

/**
 * Streamed variant: the first beat is on screen — and reading — while the rest
 * are still being decoded, which is the whole point of a view opened from
 * inside a screen the learner is already on.
 *
 * Same fallback contract as the other streamed kinds: a failure before the
 * first beat drops to the retried single-shot path, since "the model ignored
 * the format" is indistinguishable from "nothing usable happened yet". After
 * that it surfaces, the client keeps what landed, and nothing incomplete is
 * cached — so reopening the lens retries.
 */
export async function* generateConsumeModelStream(
  params: ModelParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjectsProgressive(
      user(
        `${modelContext(params)}

Write the beats as SEPARATE top-level JSON objects, one after another — NOT
wrapped in an array or a {"beats": [...]} object, no markdown fences, no
numbering, no commentary before/after/between them. Each object has this shape:
${MODEL_BEAT_SHAPE}${languageNote(params.language)}`,
      ),
      validateConsumeModelBeat,
      { label: "model-stream", partial: draftConsumeModelBeat },
    );
    for await (const beat of stream) {
      if (beat.partial) {
        yield { p: "beats", i: yielded, v: beat.value, partial: true };
        continue;
      }
      yield { p: "beats", i: yielded++, v: beat.value };
    }
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "model_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const beats = await generateConsumeModel(params);
    for (const [i, beat] of beats.entries()) yield { p: "beats", i, v: beat };
  }
}

// ---- kind: passage ---------------------------------------------------------
// "Ask about this" — the learner highlights a passage mid-reading and asks
// about it. Consume's one concession to interruption, and the only place in
// the phase where the learner sets the question.
//
// Never cached, for the same reason `judge` isn't: the payload is an answer to
// one learner's own words about one arbitrary substring of the prose. Two
// learners highlighting the same sentence have not asked the same thing.

/** One paragraph of a streamed answer — its own JSON object so it renders the
 *  moment its closing brace lands. */
function validatePassagePart(raw: unknown, i: number): string {
  const o = obj(raw, `answer[${i}]`);
  return str(o.p, `answer[${i}].p`);
}

/** …and the same paragraph mid-sentence, for the token-by-token redraws. A
 *  paragraph is a bare string, so a partial one needs nothing but the prefix. */
function draftPassagePart(raw: unknown): string | null {
  const p = (raw as { p?: unknown })?.p;
  return typeof p === "string" && p.trim() ? p : null;
}

export function validatePassage(raw: unknown): string[] {
  const root = obj(raw, "payload");
  return arr(root.answer, "answer", 1, 4).map((p, i) => str(p, `answer[${i}]`));
}

export interface PassageParams {
  topic: string;
  nodeLabel: string;
  /** The section's kicker — "3 · Where it breaks". */
  kicker: string;
  /** The prose the learner is reading, as shown. */
  section: string;
  /** What they highlighted. */
  selection: string;
  /** What they asked, or empty — an empty question means "explain this". */
  question: string;
  language?: Language;
}

function passageContext(p: PassageParams): string {
  const asked = p.question.trim();
  return `A learner is part-way through the reading pass on "${p.nodeLabel}" within the topic "${p.topic}". They highlighted a passage in the section "${p.kicker}" and asked about it.

THE SECTION THEY ARE READING:
${p.section}

WHAT THEY HIGHLIGHTED:
"""
${p.selection}
"""

THEIR QUESTION:
${asked || "(none — they tapped “explain this”, so explain the highlighted passage.)"}

Answer THAT question, about THAT passage. Rules:
- Answer the question actually asked. Do not restate the passage back at them,
  do not summarize the section, do not open with a preamble about what a good
  question it is.
- Stay grounded in the section above — this is a clarification of material the
  learner is looking at, not a new lesson. If the honest answer is genuinely
  outside this section, say so in a sentence and give the short version anyway.
- If the question rests on a misunderstanding, name the misunderstanding first
  and plainly, then answer. Never validate faulty reasoning to be agreeable.
- If the passage is genuinely ambiguous or the sentence is poorly worded, say
  that rather than inventing a reading of it.
- Be concrete: a number, a case, the actual mechanism. 2-3 short paragraphs,
  and stop — they are mid-reading and want to get back to it.${languageNote(p.language)}`;
}

export async function generatePassage(params: PassageParams): Promise<string[]> {
  return generateJson(
    user(
      `${passageContext(params)}

Return JSON:
{
  "answer": ["paragraph 1", "paragraph 2"]   // 1-4 short paragraphs
}`,
    ),
    validatePassage,
    { label: "passage" },
  );
}

/**
 * Streamed variant: the answer paints word by word, paragraph by paragraph.
 * This is the one generation the learner waits on with the reading still on
 * screen behind it, so first-paint latency is the whole game — a complete
 * answer that arrives in one piece four seconds later reads as a hang.
 *
 * Token-by-token here rather than merely per-paragraph: an answer is 2-3
 * paragraphs, so paragraph frames alone still leave the panel empty for the
 * seconds it takes to write the first one.
 *
 * Falls back to the retried single-shot path if it fails before yielding
 * anything, exactly as the Consume stream does.
 */
export async function* generatePassageStream(
  params: PassageParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjectsProgressive(
      user(
        `${passageContext(params)}

Write the answer as 2-3 SEPARATE top-level JSON objects, one per paragraph, one
after another — NOT wrapped in an array or an object, no markdown fences, no
commentary before/after/between them. Each object has this shape:
{"p": "one paragraph of the answer"}`,
      ),
      validatePassagePart,
      { label: "passage-stream", partial: draftPassagePart },
    );
    for await (const part of stream) {
      if (part.partial) {
        yield { p: "answer", i: yielded, v: part.value, partial: true };
        continue;
      }
      yield { p: "answer", i: yielded++, v: part.value };
    }
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "passage_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const answer = await generatePassage(params);
    for (const [i, part] of answer.entries()) yield { p: "answer", i, v: part };
  }
}

// ---- kind: socratic --------------------------------------------------------

const MOVES = [
  "Clarify",
  "Challenge the assumption",
  "Probe the reasoning",
  "Probe the implications",
] as const;
const QUALITIES = ["correct", "near", "wrong", "lost"] as const;

/** The shared framing of both Socratic prompts. */
function socraticContext(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
}): string {
  return `Write a Socratic questioning session for the concept "${params.nodeLabel}" within "${params.topic}".
The learner just finished a first reading. You are a contingent tutor: hint when near, teach when lost, and — most important — anti-sycophantic: a wrong reply is caught and named, gently but plainly.
${interestNote(params.interests)}
Write ${SOCRATIC_MIN_STEPS}-${SOCRATIC_STEPS} CORE probes — as many as this concept actually needs and no more; a simple idea gets ${SOCRATIC_MIN_STEPS}, a genuinely layered one gets ${SOCRATIC_STEPS} — each using a different move, in the order listed, each picking up where the last left off.
Then write exactly ${SOCRATIC_SPARES} further probes marked "spare": true, last. These are held back: they are only asked of a learner who keeps needing help, so each must go DEEPER on the hardest part of the concept rather than restate an earlier probe.`;
}

const SOCRATIC_STEP_SHAPE = `{
      "spare": false,   // true only on the held-back extra probes, which come last
      "move": "Clarify" | "Challenge the assumption" | "Probe the reasoning" | "Probe the implications",   // core probes: each move once, in this order; a spare reuses whichever fits
      "prompt": "the probing question the tutor opens with",
      "replies": [    // 3 plausible learner replies; exactly one "correct"; include a common misconception as "wrong"
        {"label": "what the learner says", "quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's honest, specific reaction"}
      ],
      "hint": "an 'I'm stuck' nudge that reframes without giving it away",
      "tell": "the direct instruction for 'Just tell me' — complete and precise"
    }`;

export function validateSocraticStep(raw: unknown, i: number): SocraticStep {
  const s = obj(raw, `steps[${i}]`);
  const replies = arr(s.replies, `steps[${i}].replies`, 3, 4).map((r, j) => {
    const rep = obj(r, `steps[${i}].replies[${j}]`);
    return {
      label: rejectEcho(
        str(rep.label, `steps[${i}].replies[${j}].label`),
        `steps[${i}].replies[${j}].label`,
      ),
      quality: oneOf(rep.quality, QUALITIES, `steps[${i}].replies[${j}].quality`),
      response: str(rep.response, `steps[${i}].replies[${j}].response`),
    };
  });
  if (!replies.some((r) => r.quality === "correct"))
    fail(`steps[${i}].replies needs a correct option`);
  return {
    id: `s${i + 1}`,
    ...(s.spare === true ? { spare: true as const } : null),
    move: oneOf(s.move, MOVES, `steps[${i}].move`),
    prompt: str(s.prompt, `steps[${i}].prompt`),
    replies,
    hint: str(s.hint, `steps[${i}].hint`),
    tell: str(s.tell, `steps[${i}].tell`),
  };
}

export function validateSocratic(raw: unknown): SocraticStep[] {
  const root = obj(raw, "payload");
  return arr(root.steps, "steps", SOCRATIC_MIN_STEPS, SOCRATIC_MAX_STEPS).map(
    validateSocraticStep,
  );
}

export async function generateSocratic(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
}): Promise<SocraticStep[]> {
  return generateJson(
    user(
      `${socraticContext(params)}

Return JSON:
{
  "steps": [${SOCRATIC_STEP_SHAPE}, ...]   // the core probes, then the ${SOCRATIC_SPARES} spares
}${languageNote(params.language ?? "en")}`,
    ),
    validateSocratic,
    { label: "socratic" },
  );
}

/**
 * Streamed variant: the tutor's first probe lands as soon as it is written
 * instead of the learner waiting on all four.
 *
 * The steps stay in ONE call rather than fanning out. The prompt requires a
 * progression — each move used once, in order, building on the last — and four
 * independent calls would each be written blind to the others. That coherence
 * is the pedagogy; no latency number buys it back.
 *
 * `hint` and `tell` stay inside their step. Beyond being small, `tell` is what
 * `AtlasApp` hands the judge as the reference answer, so a step without it
 * cannot be judged.
 */
export async function* generateSocraticStream(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
}): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${socraticContext(params)}

Write the steps as SEPARATE top-level JSON objects, one after
another — NOT wrapped in an array or a {"steps": [...]} object, no markdown
fences, no numbering, no commentary before/after/between them. Each object has
this shape:
${SOCRATIC_STEP_SHAPE}${languageNote(params.language ?? "en")}`,
      ),
      validateSocraticStep,
      { label: "socratic-stream" },
    );
    for await (const step of stream) yield { p: "steps", i: yielded++, v: step };
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "socratic_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const steps = await generateSocratic(params);
    for (const [i, step] of steps.entries()) yield { p: "steps", i, v: step };
  }
}

// ---- kind: feynman ---------------------------------------------------------

const VERDICTS = ["good", "skipped", "confused"] as const;
/** Placement offsets for gap sub-nodes spawned from a teach-back, per beat. */
const FEYNMAN_GAP_OFFSETS: ReadonlyArray<[number, number]> = [
  [-140, 150],
  [70, 172],
  [-168, 66],
  [120, 150],
];

/** One teach-back beat — a rubric row, not a script. The gap offset is indexed
 *  modulo the offset table, so a beat validates identically whether it arrived
 *  in an array or alone. */
export function validateFeynmanBeat(nodeId: string) {
  return (raw: unknown, i: number): FeynmanBeat => {
    const b = obj(raw, `beats[${i}]`);
    const mustConvey = arr(b.mustConvey, `beats[${i}].mustConvey`, 1, 4).map((m, j) =>
      rejectEcho(
        str(m, `beats[${i}].mustConvey[${j}]`),
        `beats[${i}].mustConvey[${j}]`,
      ),
    );
    const fix = obj(b.fix, `beats[${i}].fix`);
    const fixReplies = arr(fix.replies, `beats[${i}].fix.replies`, 2, 3).map((r, j) => {
      const rep = obj(r, `beats[${i}].fix.replies[${j}]`);
      return {
        label: str(rep.label, `beats[${i}].fix.replies[${j}].label`),
        correct: rep.correct === true,
        response: str(rep.response, `beats[${i}].fix.replies[${j}].response`),
      };
    });
    if (!fixReplies.some((r) => r.correct) || !fixReplies.some((r) => !r.correct))
      fail(`beats[${i}].fix.replies needs one correct and one incorrect option`);
    const [dx, dy] = FEYNMAN_GAP_OFFSETS[i % FEYNMAN_GAP_OFFSETS.length];
    return {
      id: `ft-${nodeId}-${i + 1}`,
      subPoint: str(b.subPoint, `beats[${i}].subPoint`),
      mustConvey,
      fix: { probe: str(fix.probe, `beats[${i}].fix.probe`), replies: fixReplies },
      gap: {
        id: `gap-ft-${nodeId}-${i + 1}`,
        label: str(b.gapLabel, `beats[${i}].gapLabel`),
        reason: str(b.gapReason, `beats[${i}].gapReason`),
        dx,
        dy,
      },
    };
  };
}

export function validateFeynman(nodeId: string) {
  const beat = validateFeynmanBeat(nodeId);
  return (raw: unknown): FeynmanBeat[] => {
    const root = obj(raw, "payload");
    return arr(root.beats, "beats", 3, 4).map(beat);
  };
}

interface FeynmanParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
}

/** The shared framing of both Feynman prompts. */
function feynmanContext(params: FeynmanParams): string {
  return `Write the RUBRIC for a Feynman teach-back on the concept "${params.nodeLabel}" within "${params.topic}": the ${FEYNMAN_BEATS} sub-points a learner must cover to have genuinely explained it to someone who has never heard of it.
The learner never sees these — they teach the concept from a blank page, and their explanation is diffed against these rows. So each sub-point is what a *complete* explanation contains, in the order it would naturally be taught, not a question or a prompt.
${interestNote(params.interests)}`;
}

const FEYNMAN_BEAT_SHAPE = `{
      "subPoint": "the sub-point a complete explanation must cover (3-6 words)",
      "mustConvey": ["2-3 specific things the learner's own words have to get across for this sub-point to count as taught — the grading rubric, concrete and checkable, not 'explains it well'"],
      "fix": {   // the targeted micro-pass that closes just this sub-point
        "probe": "one Socratic question aimed straight at the gap",
        "replies": [{"label": "...", "correct": true, "response": "..."}, {"label": "the likely misconception, written out", "correct": false, "response": "the specific catch"}]
      },
      "gapLabel": "the gap's map label (2-5 words)",
      "gapReason": "why it split out, phrased to the learner ('the Z trap' — the sentence continues after a quote of their own words)"
    }`;

export async function generateFeynman(params: FeynmanParams): Promise<FeynmanBeat[]> {
  return generateJson(
    user(
      `${feynmanContext(params)}

Return JSON:
{
  "beats": [${FEYNMAN_BEAT_SHAPE}, ...]   // exactly ${FEYNMAN_BEATS}
}${languageNote(params.language ?? "en")}`,
    ),
    validateFeynman(params.nodeId),
    { label: "feynman" },
  );
}

/**
 * Streamed variant: the first beat opens the teach-back instead of the learner
 * waiting on all four. This is the largest payload of any phase and the least
 * reliably warmed — Socratic only starts warming it at Socratic entry — so it
 * is the one most often paid for in full.
 *
 * One call, not four: the beats are explicitly a progression, and each `fix`
 * micro-pass belongs to its own beat, so a beat is self-contained the moment
 * it closes. `FeynmanView` dereferences `beat.fix.probe` directly, which is
 * why `fix` is never deferred out of the beat.
 */
export async function* generateFeynmanStream(
  params: FeynmanParams,
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${feynmanContext(params)}

Write the ${FEYNMAN_BEATS} beats as ${FEYNMAN_BEATS} SEPARATE top-level JSON objects, one
after another — NOT wrapped in an array or a {"beats": [...]} object, no
markdown fences, no numbering, no commentary before/after/between them. Each
object has this shape:
${FEYNMAN_BEAT_SHAPE}${languageNote(params.language ?? "en")}`,
      ),
      validateFeynmanBeat(params.nodeId),
      { label: "feynman-stream" },
    );
    for await (const beat of stream) yield { p: "beats", i: yielded++, v: beat };
  } catch (err) {
    if (yielded > 0) throw err;
    console.error(
      JSON.stringify({
        evt: "feynman_stream_fallback",
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
    const beats = await generateFeynman(params);
    for (const [i, beat] of beats.entries()) yield { p: "beats", i, v: beat };
  }
}

// ---- kind: connect ---------------------------------------------------------

/** The concept-web slots (560×440 canvas) the demo design places candidates in. */
const CONNECT_SLOTS: ReadonlyArray<[number, number]> = [
  [104, 66],
  [408, 92],
  [472, 314],
  [250, 404],
  [64, 300],
];

function validateConnect(
  nodeId: string,
  nodeLabel: string,
  pool: Array<{ id: string; label: string }>,
) {
  return (raw: unknown): ElaborationContent => {
    const root = obj(raw, "payload");
    const encoding = oneOf(root.encoding, ["conceptual", "list-like"] as const, "encoding");
    const byId = new Map(pool.map((p) => [p.id, p.label]));
    const seen = new Set<string>();
    const cands = arr(root.cands, "cands", Math.min(2, pool.length), CONNECT_SLOTS.length)
      .map((v, i) => {
        const c = obj(v, `cands[${i}]`);
        const id = str(c.id, `cands[${i}].id`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!byId.has(id) || seen.has(id)) return null;
        seen.add(id);
        const [x, y] = CONNECT_SLOTS[seen.size - 1];
        return { id, label: byId.get(id)!, x, y, rel: str(c.rel, `cands[${i}].rel`) };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (cands.length < Math.min(2, pool.length))
      fail(`cands must include at least ${Math.min(2, pool.length)} ids from the provided list`);
    const base: ElaborationContent = {
      centerId: nodeId,
      centerLabel: nodeLabel,
      encoding,
      detectNote: str(root.detectNote, "detectNote"),
      center: { x: 290, y: 210 },
      cands,
    };
    if (encoding === "list-like") {
      // The cap is generous on purpose: "vocab" is a named list-like case, and
      // a twenty-noun set used to fail validation twice and throw the learner
      // an error instead of a phase.
      base.items = arr(root.items, "items (required for list-like)", 3, 30).map((s, i) =>
        str(s, `items[${i}]`),
      );
      base.mnemonics = arr(root.mnemonics, "mnemonics (required for list-like)", 2, 3).map(
        (v, i) => {
          const m = obj(v, `mnemonics[${i}]`);
          return {
            kind: str(m.kind, `mnemonics[${i}].kind`),
            title: str(m.title, `mnemonics[${i}].title`),
            body: str(m.body, `mnemonics[${i}].body`),
          };
        },
      );
    }
    return base;
  };
}

export async function generateConnect(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  pool: Array<{ id: string; label: string }>;
  interests: string;
  language?: Language;
}): Promise<ElaborationContent> {
  const { topic, nodeId, nodeLabel, pool, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write the Connect (elaboration) pass for the concept "${nodeLabel}" within "${topic}".
The learner wires the new concept into concepts they already own. Their prior concepts (id: label):
${pool.map((p) => `- ${p.id}: ${p.label}`).join("\n")}
${interestNote(interests)}

First auto-detect the encoding. Apply this test: could a learner be fairly asked to reproduce a fixed set or ordered sequence from memory — named stages, a closed taxonomy, an algorithm's steps, vocabulary? Then it is "list-like", even when the material also carries deep ideas (the stages of mitosis, the HTTP status classes, the cranial nerves, an elimination procedure are all list-like). Use "conceptual" when there is nothing enumerable to hold in order and a mnemonic would be noise.

Return JSON:
{
  "encoding": "conceptual" | "list-like",
  "detectNote": "one-sentence plain-language rationale for the choice, first person ('I'm using elaboration — wiring, not memorizing')",
  "cands": [   // pick the 3-5 MOST related prior concepts from the list above
    {"id": "an id from the list", "rel": "the true relationship, one sentence, specific to both concepts — a draft the learner can accept or rewrite"}
  ],
  "items": ["step 1", ...],          // list-like only: 3-30 ordered items a mnemonic organizes
  "mnemonics": [                       // list-like only: 2-3 offered aids, each a DIFFERENT kind
    {"kind": "Acronym" | "Method of loci" | "Vivid image", "title": "short title", "body": "the aid itself, editable"}
  ]
}${languageNote(language)}`,
    ),
    validateConnect(nodeId, nodeLabel, pool),
    { label: "connect" },
  );
}

// ---- kind: crucible --------------------------------------------------------

const RUNGS = [
  { label: "Recall a definition" },
  { label: "Guided application" },
  { label: "Novel transfer" },
  { label: "Interleaved mix" },
  { label: "Boss · whole branch" },
];

export function validateCrucible(
  nodeId: string,
  nodeLabel: string,
  masteredLabels: string[],
) {
  return (raw: unknown): CrucibleContent => {
    const root = obj(raw, "payload");
    const problems = arr(root.problems, "problems", 2, 2).map((v, i) => {
      const p = obj(v, `problems[${i}]`);
      return {
        tag: str(p.tag, `problems[${i}].tag`),
        q: str(p.q, `problems[${i}].q`),
        hint: str(p.hint, `problems[${i}].hint`),
        placeholder: str(p.placeholder, `problems[${i}].placeholder`),
        sample: str(p.sample, `problems[${i}].sample`),
      };
    });
    const transfer = arr(root.transfer, "transfer", 3, 3).map((v, i) => {
      const t = obj(v, `transfer[${i}]`);
      return {
        verdict: oneOf(t.verdict, ["good", "red"] as const, `transfer[${i}].verdict`),
        text: rejectSelfIdenticalError(
          str(t.text, `transfer[${i}].text`),
          `transfer[${i}].text`,
        ),
      };
    });
    if (!transfer.some((t) => t.verdict === "red") || !transfer.some((t) => t.verdict === "good"))
      fail("transfer needs at least one good and one red row");
    // "Drawn from your map" must be true: keep only draws that name real
    // mastered nodes; an interest or invented label is dropped (#15).
    const rawDraws = arr(root.draws, "draws", 1, 4).map((s, i) => str(s, `draws[${i}]`));
    const owned = new Map(masteredLabels.map((l) => [l.toLowerCase(), l]));
    const draws =
      masteredLabels.length === 0
        ? rawDraws // nothing to validate against on a fresh map
        : [...new Set(rawDraws.map((d) => owned.get(d.toLowerCase())).filter((d): d is string => !!d))];
    if (draws.length < 1)
      fail(
        `draws must name concepts from the learner's map (${masteredLabels.join(", ")}) — never interests or invented labels`,
      );
    return {
      centerId: nodeId,
      centerLabel: nodeLabel,
      draws,
      rungs: RUNGS,
      gap: {
        id: `gap-cru-${nodeId}`,
        label: str(root.gapLabel, "gapLabel"),
        reason: str(root.gapReason, "gapReason"),
        dx: 165,
        dy: 78,
      },
      problems,
      transfer,
      reExplain: str(root.reExplain, "reExplain"),
    };
  };
}

export async function generateCrucible(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  masteredLabels: string[];
  interests: string;
  language?: Language;
}): Promise<CrucibleContent> {
  const { topic, nodeId, nodeLabel, masteredLabels, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write the Crucible (application/transfer) pass for the concept "${nodeLabel}" within "${topic}".
Force the knowledge into a NOVEL context it was never taught in — that's the truest mastery signal.
Concepts the learner already owns, to interleave: ${masteredLabels.join(", ") || "the concept's own prerequisites"}.
${interestNote(interests)}

Return JSON:
{
  "draws": ["2-3 owned concepts the problem interleaves"],
  "problems": [
    { "tag": "Novel transfer · a framing you were never handed",
      "q": "a concrete real-world problem that IS this concept wearing unfamiliar clothes — never name the concept",
      "hint": "a reframe that doesn't give it away",
      "placeholder": "workspace placeholder text",
      "sample": "a plausible learner attempt that gets MOST of it right but contains one precise, realistic error" },
    { "tag": "Guided application · one rung down",
      "q": "the same idea scaffolded: one step isolated, partially filled in",
      "hint": "the rule that closes the remaining step",
      "placeholder": "workspace placeholder text",
      "sample": "the correct completed attempt" }
  ],
  "transfer": [   // the diagnostic for the FIRST problem's sample attempt: what carried over, what didn't
    {"verdict": "good", "text": "sub-concept that transferred, and how it showed"},
    {"verdict": "good", "text": "another sub-concept that transferred"},
    {"verdict": "red", "text": "the precise sub-concept that did NOT carry over — name the error in the sample and the rule that fixes it"}
  ],
  "gapLabel": "that failed sub-concept as a map label (3-7 words)",
  "gapReason": "why it split out, phrased to the learner",
  "reExplain": "a 30-second Socratic re-explanation aimed straight at the gap, ending with one question"
}${languageNote(language)}`,
    ),
    validateCrucible(nodeId, nodeLabel, masteredLabels),
    { label: "crucible" },
  );
}

// ---- kind: retain ----------------------------------------------------------

const CARD_TYPES = ["recall", "why", "apply"] as const;

/**
 * The Retain generation is a card FACTORY, not the queue.
 *
 * What it produces is converted once into `StoredCard`s and then lives in the
 * FSRS store forever; the queue the learner actually sees is rebuilt from that
 * store by `retainContentFromStore`. So three things this prompt used to ask
 * for were generated, validated, cached — and thrown away on arrival:
 *
 *   - `forecast`: rebuilt from real due dates by `forecastRows`.
 *   - each card's `fsrs` intervals: rebuilt from the real scheduler by
 *     `intervalLabels`. `newStoredCard` is typed `Omit<StoredCard, "fsrs">`
 *     precisely because it supplies its own.
 *   - each card's `id`: reassigned as `${node}-retain-${stamp}-${i}`.
 *
 * Together that was roughly a quarter of a blocking generation spent on
 * output nothing reads. Asking for plausible-looking spaced-repetition
 * intervals from a language model was always the wrong shape anyway — the
 * scheduler knows them exactly.
 */
export function validateRetain(budgetMin: number, nodeIds: Set<string>) {
  return (raw: unknown): RetainContent => {
    const root = obj(raw, "payload");
    const cards: ReviewCard[] = arr(root.cards, "cards", 4, 8).map((v, i) => {
      const c = obj(v, `cards[${i}]`);
      const node = str(c.node, `cards[${i}].node`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!nodeIds.has(node)) fail(`cards[${i}].node "${node}" is not a learned node id`);
      const type = oneOf(c.type, CARD_TYPES, `cards[${i}].type`);
      const hasCloze = Array.isArray(c.cloze) && typeof c.answer === "string";
      const card: ReviewCard = {
        id: `r${i + 1}`,
        type,
        source: str(c.source, `cards[${i}].source`),
        node,
        // A cloze card's answer IS its back; models routinely omit `back`
        // there, and rejecting that blocked the whole Review queue.
        back: str(hasCloze ? (c.back ?? c.answer) : c.back, `cards[${i}].back`),
        fails: true,
        reExplain: str(c.reExplain, `cards[${i}].reExplain`),
      };
      if (hasCloze) {
        const cloze = arr(c.cloze, `cards[${i}].cloze`, 2, 2).map((s, j) =>
          str(s, `cards[${i}].cloze[${j}]`),
        );
        card.cloze = [cloze[0], cloze[1]];
        card.answer = str(c.answer, `cards[${i}].answer`);
      } else {
        card.front = str(c.front, `cards[${i}].front`);
      }
      return card;
    });
    return { budgetMin, cards };
  };
}

export async function generateRetain(params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string }>;
  interests: string;
  language?: Language;
}): Promise<RetainContent> {
  const { topic, budgetMin, nodes, interests, language = "en" } = params;
  return generateJson(
    user(
      `Draft the review cards for the topic "${topic}".
Cards are atomic — one fact each — and varied by type. Daily budget: ~${budgetMin} minutes.
The learner's nodes in rotation (id: label — state):
${nodes.map((n) => `- ${n.id}: ${n.label} — ${n.state}`).join("\n")}
${interestNote(interests)}

Write the cards only. Scheduling — when each card is next due, and what each
grade button is worth — is the scheduler's job, not yours.

Return JSON:
{
  "cards": [   // 5-6 cards; mix of types; "recall" cards use cloze, "why"/"apply" use front
    {
      "type": "recall" | "why" | "apply",
      "source": "Consume" | "Socratic" | "Feynman" | "Connect" | "Crucible",   // which phase plausibly drafted it
      "node": "a node id from the list",
      "cloze": ["text before the blank ", " text after the blank"],   // recall only
      "answer": "what fills the blank",                                 // recall only
      "front": "the question",                                          // why/apply only
      "back": "the full answer revealed on flip, 1-2 sentences",
      "reExplain": "the 30-second Socratic re-explanation shown if this card is missed"
    }, ...
  ]
}${languageNote(language)}`,
    ),
    validateRetain(budgetMin, new Set(nodes.map((n) => n.id))),
    { label: "retain" },
  );
}

// ---- kind: judge -----------------------------------------------------------
// The live judging loop (#25-#27): the learner's own words, classified by a
// (configurably stronger) judge model. Anti-sycophancy is enforced in the
// prompt: wrong reasoning is named plainly, never affirmed.

const JUDGE_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You judge a learner's answer in a mastery-learning app. You are rigorous and anti-sycophantic: " +
    "a wrong answer is named plainly and specifically (quote the wrong part), never affirmed or smoothed over. " +
    "A near-miss earns a hint, never the full answer. Empty, evasive, or off-topic input is never treated as correct. " +
    "Reply with ONLY one valid JSON object.",
};

/**
 * Judging, verdict-first.
 *
 * The judge is the one generation that can never be cached — it grades one
 * learner's own words — and the one the learner meets most often, so its
 * latency is felt more than anything else in the app. The verdict is ~15
 * tokens; the critique that follows it is the long part. Asking for them as
 * two separate top-level objects lets the UI unblock on the first (the tutor
 * advances, the mastery write lands, the input reopens) while the critique is
 * still being written.
 *
 * `AGENTS.md` forbids streaming a call that needs a corrective retry — and the
 * judge does. That constraint is kept, not broken: this only *starts* on the
 * stream. If the full object never validates, the retried single-shot
 * `generateJson` still produces it, and the client patches the streamed
 * placeholder with the real thing. The verdict is never invented locally.
 */
async function* judgeStream<T extends object>(
  messages: ChatMessage[],
  spec: {
    /** What object 1 must contain — the smallest thing that unblocks the UI. */
    firstShape: string;
    first: (raw: unknown) => Partial<T>;
    full: (raw: unknown) => T;
    label: string;
  },
): AsyncGenerator<StreamFrame> {
  const last = messages.length - 1;
  const streamed: ChatMessage[] = messages.map((m, i) =>
    i === last
      ? {
          ...m,
          content: `${m.content}

Write TWO SEPARATE top-level JSON objects, one after another — NOT wrapped in
an array, no markdown fences, nothing before/after/between them.

First, immediately, the verdict alone: ${spec.firstShape}
Then the full object described above (it repeats the verdict and adds the rest).`,
        }
      : m,
  );

  // Each object is tried as the *complete* judgement first, and only then as
  // the verdict prefix. That ordering is what makes a model that ignores the
  // two-object instruction — and writes the whole thing at once — cost one
  // call rather than two: its single object validates as full, and the
  // fallback below never runs.
  let complete = false;
  let sent = 0;
  try {
    for await (const item of streamJsonObjectsProgressive<Partial<T> | T>(
      streamed,
      (raw) => {
        try {
          const value = spec.full(raw);
          complete = true;
          return value;
        } catch {
          return spec.first(raw);
        }
      },
      // The critique is the long half of a judgement and the learner is
      // watching an open bubble for it, so it goes out as it is written. Only
      // `response` is drafted: a partial verdict would be a *different*
      // classification than the one the model settles on, and that one drives
      // mastery writes.
      {
        label: `${spec.label}-stream`,
        role: "judge",
        partial: (raw) => {
          const response = (raw as { response?: unknown })?.response;
          return typeof response === "string" && response.trim()
            ? ({ response } as unknown as Partial<T>)
            : null;
        },
      },
    )) {
      if (item.partial) {
        yield { p: "judgement", v: item.value, partial: true };
        continue;
      }
      sent++;
      yield { p: "judgement", v: item.value };
      if (complete) return;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "judge_stream_fallback",
        label: spec.label,
        sent,
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
  }
  // Nothing streamed, or only the verdict did: the full judgement still owes
  // the learner a critique, so it comes off the proven retried path. A later
  // frame for the same slot replaces the earlier one, here and in the client.
  yield {
    p: "judgement",
    v: await generateJson(messages, spec.full, { label: spec.label, role: "judge" }),
  };
}

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
  /** The wrong idea, tagged for the run-wide roll-up — present on a caught
   *  "near"/"wrong", absent otherwise. */
  misconception?: string;
}

interface JudgeSocraticTurn {
  role: "ai" | "learner";
  text: string;
}

interface JudgeSocraticMisconception {
  label: string;
  quality: string;
}

/** Silent → name it and move on; Show me → drop the act. The learner sets this
 *  by hand or lets it fade with mastery — either way the judge follows it. */
const SOCRATIC_HELP_INSTRUCTION: Record<number, string> = {
  0: `Scaffolding is set to Silent: on a "near" or "wrong", name the error plainly and re-ask — no reframing hint.`,
  1: `Scaffolding is set to Hint: on a "near" or "wrong", give exactly one reframing hint, then re-ask.`,
  2: `Scaffolding is set to Guide: on a "near" or "wrong", walk through one step of the reasoning aloud with them, then re-ask.`,
  3: `Scaffolding is set to Show me: on a "near" or "wrong", teach the relevant piece directly and completely rather than re-asking.`,
};

interface JudgeSocraticParams {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
  /** Recent transcript for this step, oldest first — so a repeated hint or a
   *  misgraded reframe doesn't happen twice (#A). */
  history?: JudgeSocraticTurn[];
  /** Which attempt this is on the current step — 1 on the first try. */
  attempt?: number;
  /** The anticipated wrong/near replies authored with this step — a bank of
   *  misconceptions to catch by name instead of generically. */
  misconceptions?: JudgeSocraticMisconception[];
  /** What this learner keeps getting wrong across nodes and sessions — the one
   *  thing a tutor can only know from having been there before. */
  recurring?: string[];
  /** The scaffolding dial (0-3, Silent → Show me). Defaults to Hint. */
  help?: number;
  language?: Language;
}

function socraticJudgeMessages(params: JudgeSocraticParams): ChatMessage[] {
  const {
    topic,
    nodeLabel,
    question,
    reference,
    answer,
    history,
    attempt,
    misconceptions,
    recurring,
    help,
    language = "en",
  } = params;
  const historyBlock =
    history && history.length
      ? `\nThe conversation on this step so far:\n${history
          .map((t) => `${t.role === "ai" ? "Tutor" : "Learner"}: ${t.text}`)
          .join("\n")}\n`
      : "";
  const misconceptionBlock =
    misconceptions && misconceptions.length
      ? `\nMisconceptions anticipated for this step: ${misconceptions
          .map((m) => `"${m.label}" (${m.quality})`)
          .join("; ")}. If the learner's answer matches one, catch it by name.\n`
      : "";
  const recurringBlock =
    recurring && recurring.length
      ? `\nAcross earlier sessions this learner keeps hitting: ${recurring.join(
          "; ",
        )}. If this answer is another instance of one of those, say so — name the pattern ("this is the same swap you made on X") instead of catching it cold again. If it isn't, don't mention them at all.\n`
      : "";
  return [
      JUDGE_SYSTEM,
      {
        role: "user",
        content: `Concept: "${nodeLabel}" (topic: ${topic}).
The tutor asked: "${question}"
A fully correct answer would convey: "${reference}"
${historyBlock}${misconceptionBlock}${recurringBlock}This is attempt ${attempt ?? 1} on this step. Do not repeat a hint already given above — advance it.
${SOCRATIC_HELP_INSTRUCTION[help ?? 1]}
The learner answered: """${answer}"""

Classify and respond contingently:
- "correct": the substance is right (wording may differ) → affirm specifically, one sentence.
- "near": right direction, one piece missing/imprecise → give a hint that reframes WITHOUT giving the answer, then re-ask — a *different* angle than any hint already given.
- "wrong": contains a real error or misconception → name the error plainly and specifically, quoting their words; do not reveal the full answer.
- "lost": empty, "I don't know", or entirely off-track → drop the Socratic act and teach the answer directly and completely.

Return JSON: {"quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's reply to the learner", "misconception": "on \"near\"/\"wrong\" only: the wrong idea itself in 3-8 words, phrased to still read out of context weeks later (e.g. \"treats scaling as rotation\") — omit otherwise"}${languageNote(language)}`,
      },
  ];
}

const validateSocraticJudgement = (raw: unknown): SocraticJudgement => {
  const root = obj(raw, "payload");
  // The tag is the only part of a caught wrong turn that outlives the session,
  // but it is still read leniently: a judgement without one still judges.
  const tag = typeof root.misconception === "string" ? root.misconception.trim() : "";
  return {
    quality: oneOf(root.quality, QUALITIES, "quality"),
    response: str(root.response, "response"),
    ...(tag ? { misconception: tag.slice(0, 120) } : null),
  };
};

export async function judgeSocratic(
  params: JudgeSocraticParams,
): Promise<SocraticJudgement> {
  return generateJson(socraticJudgeMessages(params), validateSocraticJudgement, {
    label: "judge-socratic",
    role: "judge",
  });
}

export function judgeSocraticStream(
  params: JudgeSocraticParams,
): AsyncGenerator<StreamFrame> {
  return judgeStream<SocraticJudgement>(socraticJudgeMessages(params), {
    firstShape: `{"quality": "correct" | "near" | "wrong" | "lost"}`,
    first: (raw) => ({
      quality: oneOf(obj(raw, "verdict").quality, QUALITIES, "quality"),
    }),
    full: validateSocraticJudgement,
    label: "judge-socratic",
  });
}

export interface FeynmanVerdictRow {
  /** Index into the rubric the judge was given. */
  i: number;
  verdict: "good" | "skipped" | "confused";
  /** The learner's own words that earned a gap — quoted back on the map. */
  quote?: string;
}

export interface FeynmanJudgement {
  verdicts: FeynmanVerdictRow[];
  response: string;
  /** Terms they used but never unpacked — the Feynman rule, checked. */
  jargon: string[];
}

interface JudgeFeynmanParams {
  topic: string;
  nodeLabel: string;
  /** The rubric rows, in order: what a complete explanation had to convey. */
  rubric: Array<{ subPoint: string; mustConvey: string[] }>;
  explanation: string;
  language?: Language;
}

function feynmanJudgeMessages(params: JudgeFeynmanParams): ChatMessage[] {
  const { topic, nodeLabel, rubric, explanation, language = "en" } = params;
  const rows = rubric
    .map(
      (r, i) =>
        `${i}. ${r.subPoint} — must convey: ${r.mustConvey.join("; ")}`,
    )
    .join("\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner just taught the concept "${nodeLabel}" (topic: ${topic}) from a blank page to a naive student who has never heard of it. They were NOT shown the rubric below — what they never thought to mention is the finding.

Rubric — the sub-points a complete explanation covers:
${rows}

The learner's explanation, verbatim: """${explanation}"""

Diff the explanation against every rubric row, by index:
- "good": their own words genuinely convey the row (paraphrase, their own structure and examples are all fine — this is not a keyword match).
- "skipped": never addressed, or asserted with no explanation behind it. A row they simply never mentioned is "skipped".
- "confused": addressed, but with a real error or misconception in it.
On "skipped" and "confused", quote the learner's own words that earned it in \`quote\` — the exact fragment, under 20 words. For a row they never mentioned at all, leave \`quote\` empty.

Also apply the Feynman rule itself: list in \`jargon\` every technical term they leaned on without ever unpacking it in plain language (the term as they wrote it, at most 5). Fluent recitation of named terms is exactly the failure this phase exists to catch. Empty array if they explained everything they named.

Respond AS the naive student in \`response\`: 2-4 sentences, quoting or referencing their actual words — pleased where it landed, still-puzzled and naming precisely what was missing where it didn't. Never smooth over an error.

Return JSON: {"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row], "response": "...", "jargon": ["..."]}${languageNote(language)}`,
    },
  ];
}

/** The verdict rows alone — the smallest thing that opens the Gap Report. */
function validateFeynmanVerdicts(raw: unknown, count: number): FeynmanVerdictRow[] {
  const root = obj(raw, "payload");
  const rows = arr(root.verdicts, "verdicts", 1, Math.max(count, 1)).map((r, j) => {
    const row = obj(r, `verdicts[${j}]`);
    const i = typeof row.i === "number" ? Math.trunc(row.i) : NaN;
    if (!Number.isFinite(i) || i < 0 || i >= count)
      fail(`verdicts[${j}].i must be a rubric index 0-${count - 1}`);
    const quote = typeof row.quote === "string" ? row.quote.trim().slice(0, 200) : "";
    return {
      i,
      verdict: oneOf(row.verdict, VERDICTS, `verdicts[${j}].verdict`),
      ...(quote ? { quote } : null),
    };
  });
  // One ruling per row: a repeated index is the model second-guessing itself,
  // and the first ruling is the one it committed to.
  return rows.filter((r, at) => rows.findIndex((o) => o.i === r.i) === at);
}

const validateFeynmanJudgement =
  (count: number) =>
  (raw: unknown): FeynmanJudgement => {
    const root = obj(raw, "payload");
    return {
      verdicts: validateFeynmanVerdicts(raw, count),
      response: str(root.response, "response"),
      jargon: Array.isArray(root.jargon)
        ? root.jargon
            .filter((t): t is string => typeof t === "string" && !!t.trim())
            .slice(0, 5)
            .map((t) => t.trim().slice(0, 60))
        : [],
    };
  };

export async function judgeFeynman(
  params: JudgeFeynmanParams,
): Promise<FeynmanJudgement> {
  return generateJson(
    feynmanJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    { label: "judge-feynman", role: "judge" },
  );
}

export function judgeFeynmanStream(
  params: JudgeFeynmanParams,
): AsyncGenerator<StreamFrame> {
  const count = params.rubric.length;
  return judgeStream<FeynmanJudgement>(feynmanJudgeMessages(params), {
    firstShape: `{"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row]}`,
    first: (raw) => ({ verdicts: validateFeynmanVerdicts(raw, count) }),
    full: validateFeynmanJudgement(count),
    label: "judge-feynman",
  });
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  /** Present when outcome is "partial": the actually-missing sub-concept. */
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

interface JudgeCrucibleParams {
  topic: string;
  nodeLabel: string;
  problem: string;
  hint: string;
  attempt: string;
  language?: Language;
}

function crucibleJudgeMessages(params: JudgeCrucibleParams): ChatMessage[] {
  const { topic, nodeLabel, problem, hint, attempt, language = "en" } = params;
  return [
      JUDGE_SYSTEM,
      {
        role: "user",
        content: `Concept under test: "${nodeLabel}" (topic: ${topic}).
Transfer problem posed: """${problem}"""
(The intended reframe: ${hint})
The learner's actual attempt: """${attempt}"""

Grade the attempt. "pass" ONLY if the core concept genuinely transferred — the reasoning is right where it matters (arithmetic slips that don't touch the concept may pass with a note). Anything empty, vague, off-topic, or containing a conceptual error is "partial". Never grade generously.

Return JSON:
{
  "outcome": "pass" | "partial",
  "transfer": [   // exactly 3 rows diagnosing THIS attempt — quote or reference what they actually wrote
    {"verdict": "good" | "red", "text": "which sub-concept transferred or broke, grounded in their words"}
  ],
  "gapLabel": "the missing sub-concept as a map label (3-7 words)",   // partial only
  "gapReason": "why it split out, phrased to the learner, quoting their error",   // partial only
  "reExplain": "a 30-second Socratic re-explanation aimed straight at that gap, ending with one question"   // partial only
}${languageNote(language)}`,
      },
  ];
}

const validateCrucibleJudgement = (raw: unknown): CrucibleJudgement => {
      const root = obj(raw, "payload");
      const outcome = oneOf(root.outcome, ["pass", "partial"] as const, "outcome");
      const transfer = arr(root.transfer, "transfer", 3, 3).map((v, i) => {
        const t = obj(v, `transfer[${i}]`);
        return {
          verdict: oneOf(t.verdict, ["good", "red"] as const, `transfer[${i}].verdict`),
          text: str(t.text, `transfer[${i}].text`),
        };
      });
      if (outcome === "partial" && !transfer.some((t) => t.verdict === "red"))
        fail('a "partial" outcome needs at least one red transfer row');
      const out: CrucibleJudgement = { outcome, transfer };
      if (outcome === "partial") {
        out.gapLabel = str(root.gapLabel, "gapLabel (required for partial)");
        out.gapReason = str(root.gapReason, "gapReason (required for partial)");
        out.reExplain = str(root.reExplain, "reExplain (required for partial)");
      }
      return out;
};

export async function judgeCrucible(
  params: JudgeCrucibleParams,
): Promise<CrucibleJudgement> {
  return generateJson(crucibleJudgeMessages(params), validateCrucibleJudgement, {
    label: "judge-crucible",
    role: "judge",
  });
}

/** The worst wait measured in the app (28 s on one attempt) — and the one
 *  whose verdict is a single word. `outcome` alone opens the result panel; the
 *  three diagnostic rows land into it. */
export function judgeCrucibleStream(
  params: JudgeCrucibleParams,
): AsyncGenerator<StreamFrame> {
  return judgeStream<CrucibleJudgement>(crucibleJudgeMessages(params), {
    firstShape: `{"outcome": "pass" | "partial"}`,
    first: (raw) => ({
      outcome: oneOf(obj(raw, "verdict").outcome, ["pass", "partial"] as const, "outcome"),
    }),
    full: validateCrucibleJudgement,
    label: "judge-crucible",
  });
}

// ---- judge mode: choice ----------------------------------------------------
// The open-ended half of every surface that also has a closed form (placement,
// the Consume hook, the Feynman fix pass). The learner writes in their own
// words; the judge maps that onto the option index the existing closed-path
// logic already keys on, so nothing downstream changes.

export interface ChoiceJudgement {
  index: number;
  response: string;
}

/** Split out for tests: the index must land inside the option list. */
export function validateChoice(count: number) {
  return (raw: unknown): ChoiceJudgement => {
    const root = obj(raw, "payload");
    const index = typeof root.index === "number" ? root.index : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= count)
      fail(`index must be an integer 0-${count - 1} (got ${JSON.stringify(root.index)})`);
    return { index, response: str(root.response, "response") };
  };
}

interface JudgeChoiceParams {
  topic: string;
  nodeLabel?: string;
  question: string;
  options: string[];
  answer: string;
  language?: Language;
}

function choiceJudgeMessages(params: JudgeChoiceParams): ChatMessage[] {
  const { topic, nodeLabel, question, options, answer, language = "en" } = params;
  return [
      JUDGE_SYSTEM,
      {
        role: "user",
        content: `Topic: ${topic}${nodeLabel ? ` · concept: "${nodeLabel}"` : ""}.
The learner was asked: "${question}"
They answered in their own words: """${answer}"""

Map their answer onto the closest of these candidate answers:
${options.map((o, i) => `${i}. ${o}`).join("\n")}

Pick the candidate that matches what they ACTUALLY said, not what they should have said. Empty, vague, evasive or off-topic answers map to the weakest / least-correct candidate — never a generous one.

Return JSON: {"index": <number>, "response": "one sentence to the learner naming what their answer showed, quoting their words"}${languageNote(language)}`,
      },
  ];
}

export async function judgeChoice(
  params: JudgeChoiceParams,
): Promise<ChoiceJudgement> {
  return generateJson(choiceJudgeMessages(params), validateChoice(params.options.length), {
    label: "judge-choice",
    role: "judge",
  });
}

export function judgeChoiceStream(
  params: JudgeChoiceParams,
): AsyncGenerator<StreamFrame> {
  const count = params.options.length;
  return judgeStream<ChoiceJudgement>(choiceJudgeMessages(params), {
    firstShape: `{"index": <number>}`,
    // Not `validateChoice` with a blank response — that validator (rightly)
    // rejects an empty `response`, so the verdict-only object would fail.
    first: (raw) => {
      const index = obj(raw, "verdict").index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= count)
        fail(`index must be an integer 0-${count - 1}`);
      return { index: index as number };
    },
    full: validateChoice(count),
    label: "judge-choice",
  });
}
