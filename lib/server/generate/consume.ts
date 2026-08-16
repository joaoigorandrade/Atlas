// ---- kind: consume ---------------------------------------------------------
import {
  arr,
  boundaryNote,
  fail,
  interestNote,
  languageNote,
  obj,
  sizeRule,
  str,
  user,
} from "./common";
import { CONSUME_SECTION_SHAPE } from "./shapes";
import {
  CONSUME_SECTION_BOUNDS,
  ConsumeChunk,
  ConsumeFigure,
  ConsumePrediction,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjects } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

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
    body: arr(c.body, `chunks[${i}].body`, 2, 5).map((p, j) =>
      str(p, `chunks[${i}].body[${j}]`),
    ),
    example: {
      title: str(ex.title, `chunks[${i}].example.title`),
      steps: arr(ex.steps, `chunks[${i}].example.steps`, 2, 6).map((s, j) =>
        str(s, `chunks[${i}].example.steps[${j}]`),
      ),
    },
    takeaway: str(c.takeaway, `chunks[${i}].takeaway`),
    // Optional on purpose: the shape tells the model never to invent a work,
    // so it must be able to omit rather than fabricate one per section.
    cite: c.cite ? str(c.cite, `chunks[${i}].cite`) : undefined,
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
  return arr(
    root.chunks,
    "chunks",
    CONSUME_SECTION_BOUNDS.min,
    CONSUME_SECTION_BOUNDS.max,
  ).map(validateConsumeSection);
}

function consumeContext(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
  /** What the rest of the map already taught / will teach — see `boundaryNote`. */
  priorLabels?: string[];
  laterLabels?: string[];
}): string {
  const { topic, nodeLabel, prereqLabels, interests, language = "en" } = params;
  return `Write the Consume (first reading) pass for the concept "${nodeLabel}" within the topic "${topic}".
The learner already knows: ${prereqLabels.join(", ") || "nothing yet — this is a foundation"}.
${interestNote(interests)}

${sizeRule({
  unit: "sections",
  min: 2,
  max: 5,
  atMin: "a concept with one mechanism and one way to get it wrong",
  atMax: "a concept with several genuinely separate moving parts",
})}

This is the READING phase — the learner is here to be taught, not tested. Write
real teaching material: explain the idea, show where it comes from, work an
example, name what usually goes wrong. Real questioning happens in later
phases, so the pass carries no questions before the prose — only one short
comprehension check per section ("check"), which closes it and which the
learner must get right before continuing. A check is a receipt for reading,
not a test: it asks for something stated or worked in THAT section's prose or
example, and its wrong options are plausible misreadings, never absurd.

Rules for the prose:
- Teach, don't summarize. Each section's body is 2-5 full paragraphs of 3-6
  sentences — enough that a learner who reads only this understands the idea,
  and no more: a paragraph that restates the one above it is padding.
- Be concrete: real numbers, real cases, the actual mechanism. No "it can be
  shown that", no bullet-point skeletons, no restating the section title.
- Build in order: what it is → why it works / where it comes from → how it
  behaves → where it breaks or is misused → how it connects onward. That is the
  ORDER, not a checklist of five sections — a small concept covers several of
  those beats inside one section.
- Name the common misconception explicitly and say why it is wrong.
${boundaryNote(params)}${languageNote(language)}`;
}

export async function generateConsume(params: {
  topic: string;
  nodeLabel: string;
  prereqLabels: string[];
  interests: string;
  language?: Language;
  /** What the rest of the map already taught / will teach — see `boundaryNote`. */
  priorLabels?: string[];
  laterLabels?: string[];
}): Promise<ConsumeChunk[]> {
  return generateJson(
    user(
      `${consumeContext(params)}

Return JSON:
{
  "chunks": [${CONSUME_SECTION_SHAPE}, ...]   // as many sections as the concept earns
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
  /** What the rest of the map already taught / will teach — see `boundaryNote`. */
  priorLabels?: string[];
  laterLabels?: string[];
}): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjects(
      user(
        `${consumeContext(params)}

Write the sections as SEPARATE top-level JSON objects, one after another
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
