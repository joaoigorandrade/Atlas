// The content engine: one generator per content kind. Each builds a prompt,
// asks OpenRouter for JSON (generateJson validates + retries once), then
// post-processes into the exact shapes the client renders — layout, ids, and
// gap offsets are computed here, never trusted from the model.

import {
  type AltKey,
  type ConceptEdge,
  type ConceptGraph,
  type ConceptNode,
  type ConsumeChunk,
  type CrucibleContent,
  type DiagnosticQuestion,
  type ElaborationContent,
  type FeynmanBeat,
  type ForecastTone,
  type GoalKind,
  type RetainContent,
  type ReviewCard,
  type SocraticStep,
} from "@/lib/curriculum";
import { generateJson, type ChatMessage } from "@/lib/server/openrouter";

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

/** Personal-interest flavoring shared by several prompts. */
function interestNote(interests: string): string {
  return interests.trim()
    ? `Where an analogy helps, draw it from the learner's stated interests (${interests.trim()}) — but only when it genuinely fits.`
    : "Use concrete, everyday analogies when they genuinely fit.";
}

// ---- kind: curriculum ------------------------------------------------------

export interface CurriculumPayload {
  graph: ConceptGraph;
  diagnostic: DiagnosticQuestion[];
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

export function validateCurriculum(raw: unknown): {
  scopes?: ScopeOffer[];
  nodes: Array<{ id: string; label: string }>;
  edges: ConceptEdge[];
  diagnostic: Array<{
    nodeId: string;
    q: string;
    note: string;
    opts: Array<{ label: string; effect: "mastered" | "shaky" | "none" }>;
    gapLabel?: string;
    gapReason?: string;
  }>;
} {
  const root = obj(raw, "payload");
  // Too-broad topics come back as 2-3 scoped sub-map offers, not a mush map.
  if (root.tooBroad === true) {
    const scopes = arr(root.scopes, "scopes", 2, 3).map((v, i) => {
      const s = obj(v, `scopes[${i}]`);
      return {
        label: str(s.label, `scopes[${i}].label`),
        note: str(s.note, `scopes[${i}].note`),
      };
    });
    return { scopes, nodes: [], edges: [], diagnostic: [] };
  }
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
  if (edges.length < nodes.length - 4) fail("too few valid edges — every node needs prerequisites wired");
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
  const diagnostic = arr(root.diagnostic, "diagnostic", 3, 3).map((v, i) => {
    const d = obj(v, `diagnostic[${i}]`);
    const nodeId = str(d.nodeId, `diagnostic[${i}].nodeId`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    if (!seen.has(nodeId)) fail(`diagnostic[${i}].nodeId "${nodeId}" is not a node id`);
    return {
      nodeId,
      q: str(d.q, `diagnostic[${i}].q`),
      note: str(d.note, `diagnostic[${i}].note`),
      opts: arr(d.opts, `diagnostic[${i}].opts`, 3, 3).map((o, j) => {
        const opt = obj(o, `diagnostic[${i}].opts[${j}]`);
        return {
          label: str(opt.label, `diagnostic[${i}].opts[${j}].label`),
          effect: oneOf(
            opt.effect,
            ["mastered", "shaky", "none"] as const,
            `diagnostic[${i}].opts[${j}].effect`,
          ),
        };
      }),
      gapLabel: d.gapLabel ? str(d.gapLabel, `diagnostic[${i}].gapLabel`) : undefined,
      gapReason: d.gapReason ? str(d.gapReason, `diagnostic[${i}].gapReason`) : undefined,
    };
  });
  return { nodes, edges, diagnostic };
}

export async function generateCurriculum(params: {
  topic: string;
  goal: GoalKind;
  interests: string;
  /** Extracted syllabus/outline text that grounds the map (#30), if uploaded. */
  outline?: string;
}): Promise<CurriculumPayload | { scopes: ScopeOffer[] }> {
  const { topic, goal, interests, outline } = params;
  const grounding = outline?.trim()
    ? `\nGround the map in this course outline the learner uploaded — its units and their order are the source of truth for what to cover:\n"""\n${outline.trim().slice(0, 6000)}\n"""\n`
    : "";
  const raw = await generateJson(
    user(
      `Build a prerequisite concept map for the topic "${topic}". ${GOAL_HINT[goal]}
${grounding}
If (and only if) the topic is far too broad for one coherent 12-18 concept map (e.g. "science", "math", "history"), instead return:
{"tooBroad": true, "scopes": [{"label": "a focused sub-topic (2-4 words)", "note": "one sentence on what this scoped map covers"}, ...]}   // exactly 2-3 offers

Otherwise return JSON:
{
  "nodes": [{"id": "short-kebab-id", "label": "Concept Name"}, ...],   // 12 to 18 concepts, foundations through capstone
  "edges": [["prereq-id", "dependent-id"], ...],                        // direction is prerequisite -> dependent; must form a DAG; every non-root node needs at least one prerequisite
  "diagnostic": [                                                        // exactly 3 placement questions, ordered easy -> hard
    {
      "nodeId": "id of the concept the question probes (pick 3 different early/mid concepts)",
      "q": "the question, phrased as a quick self-assessment the learner answers honestly",
      "note": "one sentence on what the answer changes about the map",
      "opts": [
        {"label": "confident answer", "effect": "mastered"},
        {"label": "partial/hesitant answer", "effect": "shaky"},
        {"label": "no idea answer", "effect": "none"}
      ],
      "gapLabel": "the precise sub-concept a hesitant answer splits out (2-4 words)",
      "gapReason": "why it split, phrased to the learner ('you hesitated on ...')"
    }
  ]
}

Rules: labels are 1-3 words, title case. Node count 12-18. The map must read left-to-right from true foundations to the topic's capstone ideas. Diagnostic questions probe concepts a learner with prior exposure might already own.`,
    ),
    validateCurriculum,
    { label: "curriculum" },
  );
  if (raw.scopes) return { scopes: raw.scopes };
  const nodes = layoutGraph(raw.nodes, raw.edges);
  const total = raw.diagnostic.length;
  const diagnostic: DiagnosticQuestion[] = raw.diagnostic.map((d, i) => ({
    tag: `Question ${i + 1} of ${total}`,
    q: d.q,
    note: d.note,
    nodeId: d.nodeId,
    opts: d.opts,
    gap:
      d.gapLabel && d.gapReason
        ? {
            id: `gap-diag-${d.nodeId}`,
            label: d.gapLabel,
            reason: d.gapReason,
            dx: -85,
            dy: 148,
          }
        : undefined,
  }));
  return { graph: { nodes, edges: raw.edges }, diagnostic };
}

// ---- kind: consume ---------------------------------------------------------

const ALT_KEYS: readonly AltKey[] = ["simpler", "example", "analogy", "deeper"];

function validateConsume(raw: unknown): ConsumeChunk[] {
  const root = obj(raw, "payload");
  return arr(root.chunks, "chunks", 3, 5).map((v, i) => {
    const c = obj(v, `chunks[${i}]`);
    const pred = obj(c.pred, `chunks[${i}].pred`);
    const opts = arr(pred.opts, `chunks[${i}].pred.opts`, 3, 3).map((o, j) => {
      const opt = obj(o, `chunks[${i}].pred.opts[${j}]`);
      return {
        label: str(opt.label, `chunks[${i}].pred.opts[${j}].label`),
        correct: opt.correct === true,
      };
    });
    if (opts.filter((o) => o.correct).length !== 1)
      fail(`chunks[${i}].pred.opts must have exactly one correct option`);
    const alt = obj(c.alt, `chunks[${i}].alt`);
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
      pred: { q: str(pred.q, `chunks[${i}].pred.q`), opts },
      right: str(c.right, `chunks[${i}].right`),
      wrong: str(c.wrong, `chunks[${i}].wrong`),
      body: str(c.body, `chunks[${i}].body`),
      cite: str(c.cite, `chunks[${i}].cite`),
      diagram: str(c.diagram, `chunks[${i}].diagram`),
      ask: str(c.ask, `chunks[${i}].ask`),
      alt: Object.fromEntries(
        ALT_KEYS.map((k) => [k, str(alt[k], `chunks[${i}].alt.${k}`)]),
      ) as Record<AltKey, string>,
    };
  });
}

export async function generateConsume(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
}): Promise<ConsumeChunk[]> {
  const { topic, nodeLabel, prereqLabels, interests } = params;
  return generateJson(
    user(
      `Write the Consume (first reading) pass for the concept "${nodeLabel}" within the topic "${topic}".
The learner already knows: ${prereqLabels.join(", ") || "nothing yet — this is a foundation"}.
${interestNote(interests)}

Return JSON with 4 chunks that build the concept from "what it is" to "ready to apply":
{
  "chunks": [
    {
      "kicker": "1 · What it is",                         // segment label: number · 2-4 words
      "terms": [{"t": "term", "d": "its pre-taught one-line definition"}],   // 0-3 key terms the paragraph uses
      "pred": {                                            // a predict-before-reveal question about THIS chunk
        "q": "the guess the learner makes before reading",
        "opts": [{"label": "...", "correct": false}, {"label": "...", "correct": true}, {"label": "...", "correct": false}]
      },
      "right": "one-line verdict after a correct guess",
      "wrong": "one-line honest correction after a wrong guess",
      "body": "the explanation itself, 2-4 sentences, precise and concrete",
      "cite": "a real canonical source (book §, lecture series chapter) — never invent one",
      "diagram": "caption for a simple schematic diagram of this chunk",
      "ask": "a mini-Socratic prompt that answers a likely question with a question",
      "alt": {
        "simpler": "the body rewritten plainly",
        "example": "a fully worked concrete example",
        "analogy": "an analogy that maps the structure",
        "deeper": "the sharper, more rigorous version"
      }
    }, ...
  ]
}`,
    ),
    validateConsume,
    { label: "consume" },
  );
}

// ---- kind: socratic --------------------------------------------------------

const MOVES = [
  "Clarify",
  "Challenge the assumption",
  "Probe the reasoning",
  "Probe the implications",
] as const;
const QUALITIES = ["correct", "near", "wrong", "lost"] as const;

export function validateSocratic(raw: unknown): SocraticStep[] {
  const root = obj(raw, "payload");
  return arr(root.steps, "steps", 3, 5).map((v, i) => {
    const s = obj(v, `steps[${i}]`);
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
    const scratch = s.scratch
      ? {
          prompt: str(obj(s.scratch, `steps[${i}].scratch`).prompt, `steps[${i}].scratch.prompt`),
          reaction: str(
            obj(s.scratch, `steps[${i}].scratch`).reaction,
            `steps[${i}].scratch.reaction`,
          ),
        }
      : undefined;
    return {
      id: `s${i + 1}`,
      move: oneOf(s.move, MOVES, `steps[${i}].move`),
      prompt: str(s.prompt, `steps[${i}].prompt`),
      replies,
      hint: str(s.hint, `steps[${i}].hint`),
      tell: str(s.tell, `steps[${i}].tell`),
      ...(scratch ? { scratch } : {}),
    };
  });
}

export async function generateSocratic(params: {
  topic: string;
  nodeLabel: string;
  interests: string;
}): Promise<SocraticStep[]> {
  const { topic, nodeLabel, interests } = params;
  return generateJson(
    user(
      `Write a Socratic questioning session (4 steps) for the concept "${nodeLabel}" within "${topic}".
The learner just finished a first reading. You are a contingent tutor: hint when near, teach when lost, and — most important — anti-sycophantic: a wrong reply is caught and named, gently but plainly.
${interestNote(interests)}

Return JSON:
{
  "steps": [
    {
      "move": "Clarify" | "Challenge the assumption" | "Probe the reasoning" | "Probe the implications",   // use each move once, in this order
      "prompt": "the probing question the tutor opens with",
      "replies": [    // 3 plausible learner replies; exactly one "correct"; include a common misconception as "wrong"
        {"label": "what the learner says", "quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's honest, specific reaction"}
      ],
      "hint": "an 'I'm stuck' nudge that reframes without giving it away",
      "tell": "the direct instruction for 'Just tell me' — complete and precise",
      "scratch": {"prompt": "a work-it-out-on-the-pad task", "reaction": "the tutor's reaction that catches the most common error in that work"}   // include on exactly ONE middle step, omit elsewhere
    }, ...
  ]
}`,
    ),
    validateSocratic,
    { label: "socratic" },
  );
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

export function validateFeynman(nodeId: string) {
  return (raw: unknown): FeynmanBeat[] => {
    const root = obj(raw, "payload");
    return arr(root.beats, "beats", 3, 4).map((v, i) => {
      const b = obj(v, `beats[${i}]`);
      const replies = arr(b.replies, `beats[${i}].replies`, 3, 3).map((r, j) => {
        const rep = obj(r, `beats[${i}].replies[${j}]`);
        return {
          label: rejectEcho(
            str(rep.label, `beats[${i}].replies[${j}].label`),
            `beats[${i}].replies[${j}].label`,
          ),
          verdict: oneOf(rep.verdict, VERDICTS, `beats[${i}].replies[${j}].verdict`),
          response: str(rep.response, `beats[${i}].replies[${j}].response`),
        };
      });
      if (!replies.some((r) => r.verdict === "good"))
        fail(`beats[${i}].replies needs a "good" option`);
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
        transcript: str(b.transcript, `beats[${i}].transcript`),
        interjection: str(b.interjection, `beats[${i}].interjection`),
        replies,
        fix: { probe: str(fix.probe, `beats[${i}].fix.probe`), replies: fixReplies },
        gap: {
          id: `gap-ft-${nodeId}-${i + 1}`,
          label: str(b.gapLabel, `beats[${i}].gapLabel`),
          reason: str(b.gapReason, `beats[${i}].gapReason`),
          dx,
          dy,
        },
      };
    });
  };
}

export async function generateFeynman(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
}): Promise<FeynmanBeat[]> {
  const { topic, nodeId, nodeLabel, interests } = params;
  return generateJson(
    user(
      `Write a Feynman teach-back session (4 beats) for the concept "${nodeLabel}" within "${topic}".
The learner teaches; the AI plays a NAIVE STUDENT who interrupts with exactly the questions that expose hand-waving.
${interestNote(interests)}

Return JSON:
{
  "beats": [
    {
      "subPoint": "the sub-point being taught (3-6 words)",
      "transcript": "what the learner plausibly says teaching this sub-point, first person, 2-3 sentences",
      "interjection": "the naive student's interrupting question — innocent, and aimed precisely at the likely gap",
      "replies": [   // 3 ways the learner might answer, each WRITTEN OUT VERBATIM in the learner's own words — never a description like "a precise answer"
        {"label": "<the actual complete, precise answer, written out>", "verdict": "good", "response": "the student's satisfied reaction"},
        {"label": "<an actual hand-wavy dodge, written out>", "verdict": "skipped", "response": "the student saying they still don't get it, naming what was skipped"},
        {"label": "<an actual confidently wrong claim (a real misconception), written out>", "verdict": "confused", "response": "the student noticing the contradiction, wrong-footed"}
      ],
      "fix": {   // the targeted micro-pass that closes just this sub-point
        "probe": "one Socratic question aimed straight at the gap",
        "replies": [{"label": "...", "correct": true, "response": "..."}, {"label": "the misconception again", "correct": false, "response": "the specific catch"}]
      },
      "gapLabel": "the gap's map label (2-5 words)",
      "gapReason": "why it split out, phrased to the learner ('you taught X as Y — the Z trap')"
    }, ...
  ]
}`,
    ),
    validateFeynman(nodeId),
    { label: "feynman" },
  );
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
    const wanted = Math.min(CONNECT_SLOTS.length, Math.max(2, pool.length));
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
    void wanted;
    const base: ElaborationContent = {
      centerId: nodeId,
      centerLabel: nodeLabel,
      encoding,
      detectNote: str(root.detectNote, "detectNote"),
      center: { x: 290, y: 210 },
      cands,
    };
    if (encoding === "list-like") {
      base.items = arr(root.items, "items (required for list-like)", 3, 8).map((s, i) =>
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
}): Promise<ElaborationContent> {
  const { topic, nodeId, nodeLabel, pool, interests } = params;
  return generateJson(
    user(
      `Write the Connect (elaboration) pass for the concept "${nodeLabel}" within "${topic}".
The learner wires the new concept into concepts they already own. Their prior concepts (id: label):
${pool.map((p) => `- ${p.id}: ${p.label}`).join("\n")}
${interestNote(interests)}

First auto-detect the encoding: "conceptual" for a mental-model idea (mnemonics would be noise), "list-like" ONLY for genuinely enumerable material — a fixed sequence of steps, a taxonomy, vocabulary.

Return JSON:
{
  "encoding": "conceptual" | "list-like",
  "detectNote": "one-sentence plain-language rationale for the choice, first person ('I'm using elaboration — wiring, not memorizing')",
  "cands": [   // pick the 3-5 MOST related prior concepts from the list above
    {"id": "an id from the list", "rel": "the true relationship, one sentence, specific to both concepts — a draft the learner can accept or rewrite"}
  ],
  "items": ["step 1", ...],          // list-like only: the ordered items a mnemonic organizes
  "mnemonics": [                       // list-like only: 3 offered aids
    {"kind": "Acronym" | "Method of loci" | "Vivid image", "title": "short title", "body": "the aid itself, editable"}
  ]
}`,
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
}): Promise<CrucibleContent> {
  const { topic, nodeId, nodeLabel, masteredLabels, interests } = params;
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
}`,
    ),
    validateCrucible(nodeId, nodeLabel, masteredLabels),
    { label: "crucible" },
  );
}

// ---- kind: retain ----------------------------------------------------------

const CARD_TYPES = ["recall", "why", "apply"] as const;
const TONES: readonly ForecastTone[] = ["due", "soft", "solid"];

function validateRetain(budgetMin: number, nodeIds: Set<string>) {
  return (raw: unknown): RetainContent => {
    const root = obj(raw, "payload");
    const forecast = arr(root.forecast, "forecast", 3, 3).map((v, i) => {
      const f = obj(v, `forecast[${i}]`);
      return {
        label: str(f.label, `forecast[${i}].label`),
        count: str(f.count, `forecast[${i}].count`),
        sub: str(f.sub, `forecast[${i}].sub`),
        tone: oneOf(f.tone, TONES, `forecast[${i}].tone`),
      };
    });
    const cards: ReviewCard[] = arr(root.cards, "cards", 4, 8).map((v, i) => {
      const c = obj(v, `cards[${i}]`);
      const node = str(c.node, `cards[${i}].node`).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      if (!nodeIds.has(node)) fail(`cards[${i}].node "${node}" is not a learned node id`);
      const fsrsRaw = obj(c.fsrs, `cards[${i}].fsrs`);
      const fsrs = {
        again: str(fsrsRaw.again, `cards[${i}].fsrs.again`),
        hard: str(fsrsRaw.hard, `cards[${i}].fsrs.hard`),
        good: str(fsrsRaw.good, `cards[${i}].fsrs.good`),
        easy: str(fsrsRaw.easy, `cards[${i}].fsrs.easy`),
      };
      const type = oneOf(c.type, CARD_TYPES, `cards[${i}].type`);
      const hasCloze = Array.isArray(c.cloze) && typeof c.answer === "string";
      const card: ReviewCard = {
        id: `r${i + 1}`,
        type,
        source: str(c.source, `cards[${i}].source`),
        node,
        back: str(c.back, `cards[${i}].back`),
        fsrs,
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
    return { budgetMin, forecast, cards };
  };
}

export async function generateRetain(params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string }>;
  interests: string;
}): Promise<RetainContent> {
  const { topic, budgetMin, nodes, interests } = params;
  return generateJson(
    user(
      `Write today's Retain (spaced-review) queue for the topic "${topic}".
Cards are auto-generated from earlier sessions — atomic, one fact each, varied by type. Daily budget: ~${budgetMin} minutes.
The learner's nodes in rotation (id: label — state):
${nodes.map((n) => `- ${n.id}: ${n.label} — ${n.state}`).join("\n")}
${interestNote(interests)}

Return JSON:
{
  "forecast": [
    {"label": "Due now", "count": "N cards", "sub": "~${budgetMin} min", "tone": "due"},
    {"label": "Decaying this week", "count": "N cards", "sub": "recall dropping below 90%", "tone": "soft"},
    {"label": "Rock-solid", "count": "N cards", "sub": "next lift 30 d+ out", "tone": "solid"}
  ],
  "cards": [   // 5-6 cards; mix of types; "recall" cards use cloze, "why"/"apply" use front
    {
      "type": "recall" | "why" | "apply",
      "source": "Consume" | "Socratic" | "Feynman" | "Connect" | "Crucible",   // which phase plausibly drafted it
      "node": "a node id from the list",
      "cloze": ["text before the blank ", " text after the blank"],   // recall only
      "answer": "what fills the blank",                                 // recall only
      "front": "the question",                                          // why/apply only
      "back": "the full answer revealed on flip, 1-2 sentences",
      "fsrs": {"again": "<10 min", "hard": "1 d", "good": "4 d", "easy": "9 d"},   // plausible intervals per grade
      "reExplain": "the 30-second Socratic re-explanation shown if this card is missed"
    }, ...
  ]
}`,
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

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
}

export async function judgeSocratic(params: {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
}): Promise<SocraticJudgement> {
  const { topic, nodeLabel, question, reference, answer } = params;
  return generateJson(
    [
      JUDGE_SYSTEM,
      {
        role: "user",
        content: `Concept: "${nodeLabel}" (topic: ${topic}).
The tutor asked: "${question}"
A fully correct answer would convey: "${reference}"
The learner answered: """${answer}"""

Classify and respond contingently:
- "correct": the substance is right (wording may differ) → affirm specifically, one sentence.
- "near": right direction, one piece missing/imprecise → give a hint that reframes WITHOUT giving the answer, then re-ask.
- "wrong": contains a real error or misconception → name the error plainly and specifically, quoting their words; do not reveal the full answer.
- "lost": empty, "I don't know", or entirely off-track → drop the Socratic act and teach the answer directly and completely.

Return JSON: {"quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's reply to the learner"}`,
      },
    ],
    (raw) => {
      const root = obj(raw, "payload");
      return {
        quality: oneOf(root.quality, QUALITIES, "quality"),
        response: str(root.response, "response"),
      };
    },
    { label: "judge-socratic", role: "judge" },
  );
}

export interface FeynmanJudgement {
  verdict: "good" | "skipped" | "confused";
  response: string;
}

export async function judgeFeynman(params: {
  topic: string;
  nodeLabel: string;
  subPoint: string;
  reference: string;
  explanation: string;
}): Promise<FeynmanJudgement> {
  const { topic, nodeLabel, subPoint, reference, explanation } = params;
  return generateJson(
    [
      JUDGE_SYSTEM,
      {
        role: "user",
        content: `The learner is teaching the concept "${nodeLabel}" (topic: ${topic}) to a naive student.
Sub-point under test: "${subPoint}"
A solid explanation would convey: "${reference}"
The learner's own explanation: """${explanation}"""

Diff their explanation against the sub-point:
- "good": the sub-point is genuinely explained (their words, their structure — paraphrase is fine).
- "skipped": hand-waved, asserted without explanation, or not addressed at all.
- "confused": contains a real error or misconception about this sub-point.

Respond AS the naive student, quoting or referencing the learner's actual words: pleased if good, still-puzzled and naming what was skipped if skipped, noticing the contradiction if confused.

Return JSON: {"verdict": "good" | "skipped" | "confused", "response": "the naive student's reaction, referencing their words"}`,
      },
    ],
    (raw) => {
      const root = obj(raw, "payload");
      return {
        verdict: oneOf(root.verdict, VERDICTS, "verdict"),
        response: str(root.response, "response"),
      };
    },
    { label: "judge-feynman", role: "judge" },
  );
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  /** Present when outcome is "partial": the actually-missing sub-concept. */
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

export async function judgeCrucible(params: {
  topic: string;
  nodeLabel: string;
  problem: string;
  hint: string;
  attempt: string;
}): Promise<CrucibleJudgement> {
  const { topic, nodeLabel, problem, hint, attempt } = params;
  return generateJson(
    [
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
}`,
      },
    ],
    (raw) => {
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
    },
    { label: "judge-crucible", role: "judge" },
  );
}
