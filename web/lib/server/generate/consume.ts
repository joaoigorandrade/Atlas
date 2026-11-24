// ---- kind: consume ---------------------------------------------------------
import { verifyChunkCheck } from "./verify";
import { cellNote, consumeBand } from "./cellNote";
import type { Cell } from "@/lib/curriculum";
import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  filled,
  interestNote,
  domainNote,
  kindNote,
  languageNote,
  obj,
  sizeRule,
  str,
  user,
  lensNote,
} from "./common";
import { CONSUME_SECTION_EXAMPLE, CONSUME_SECTION_SHAPE } from "./shapes";
import {
  CONSUME_SECTION_BOUNDS,
  ConsumeChunk,
  ConsumeFigure,
  ConsumePrediction,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson, streamJsonObjectsProgressive } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import type { Domain, NodeKind } from "@/lib/curriculum";

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

/** Fisher-Yates. The answer's slot has to carry no information — see the note
 *  in `validatePrediction`. Not seeded: the shuffle happens once, on the way
 *  into the cache, so the learner sees one stable order either way. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A multiple-choice question with verdict copy — a section's closing check. */
function validatePrediction(raw: unknown, name: string): ConsumePrediction {
  const pred = obj(raw, name);
  const opts = arr(pred.opts, `${name}.opts`, 3, 3).map((o, j) => {
    const opt = obj(o, `${name}.opts[${j}]`);
    return {
      label: filled(opt.label, `${name}.opts[${j}].label`),
      correct: opt.correct === true,
    };
  });
  if (opts.filter((o) => o.correct).length !== 1)
    fail(`${name}.opts must have exactly one correct option`);
  return {
    q: filled(pred.q, `${name}.q`),
    // Shuffled here rather than at either client, because this is the one
    // place both of them go through and because the order is what gets cached:
    // a section shuffled per render would move the options under a learner
    // re-reading it. Measured over the runs already generated, the model put
    // the answer in slot 2 of 3 in 73% of checks and never once in slot 3 —
    // "it's the middle one" was a strictly better strategy than reading.
    opts: shuffle(opts),
    right: filled(pred.right, `${name}.right`),
    wrong: filled(pred.wrong, `${name}.wrong`),
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
        d: filled(term.d, `chunks[${i}].terms[${j}].d`),
      };
    }),
    // Empty paragraphs are dropped before the bound, not rejected by it. A
    // trailing "" carries nothing, and `str` throwing on it cost the whole
    // section — the most expensive unit this generator produces — over a
    // blank the learner would never have seen. The 2-5 bound then applies to
    // real paragraphs, so a section that is genuinely too thin still fails.
    body: arr(
      Array.isArray(c.body)
        ? c.body.filter((p) => typeof p !== "string" || p.trim())
        : c.body,
      `chunks[${i}].body`,
      2,
      5,
    ).map((p, j) => filled(p, `chunks[${i}].body[${j}]`)),
    example: {
      title: str(ex.title, `chunks[${i}].example.title`),
      steps: arr(ex.steps, `chunks[${i}].example.steps`, 2, 6).map((s, j) =>
        filled(s, `chunks[${i}].example.steps[${j}]`),
      ),
      visual: ex.visual ? str(ex.visual, `chunks[${i}].example.visual`) : undefined,
    },
    takeaway: filled(c.takeaway, `chunks[${i}].takeaway`),
    // Optional on purpose: the shape tells the model never to invent a work,
    // so it must be able to omit rather than fabricate one per section.
    cite: c.cite ? str(c.cite, `chunks[${i}].cite`) : undefined,
    diagram: hasFigure ? str(c.diagram, `chunks[${i}].diagram`) : undefined,
    figure: hasFigure ? validateFigure(c.figure, `chunks[${i}].figure`) : undefined,
    ask: filled(c.ask, `chunks[${i}].ask`),
    // The comprehension check that closes every section — a receipt for
    // reading it. Consume reads; anything the model volunteers before the
    // prose is dropped.
    check: validatePrediction(c.check, `chunks[${i}].check`),
  };
}

/**
 * A section as it is being written — the kicker and the paragraphs so far, and
 * nothing that gates.
 *
 * The shape is written in order (kicker → takeaway → terms → body → example →
 * check), so a redraw is prose with a truncated last paragraph and no material
 * past it — the takeaway the model has already written is held back with the
 * rest. Everything that *acts* is left out on purpose: half a worked example
 * teaches nothing, and half a check has options nobody can answer.
 *
 * The empty `takeaway` is how a reader tells a draft from a section: every
 * validated section carries one (`str` rejects an empty string), so no extra
 * flag has to ride along on the wire or through the cache.
 */
function draftConsumeSection(raw: unknown, i: number): ConsumeChunk | null {
  const c = raw as { kicker?: unknown; body?: unknown };
  const kicker = typeof c?.kicker === "string" ? c.kicker : "";
  const body = (Array.isArray(c?.body) ? c.body : []).filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  if (!kicker.trim() && body.length === 0) return null;
  // Cast because a draft is deliberately missing the fields a whole section
  // must have — it is only ever rendered, never validated, assembled or cached.
  return {
    id: `c${i + 1}`,
    kicker,
    terms: [],
    body,
    takeaway: "",
    ask: "",
  } as unknown as ConsumeChunk;
}

/** Images cost money per draw: one `visual` per pass, the first one wins.
 *  Returns a filter that strips the field from every later section. */
export function oneVisual(): (c: ConsumeChunk) => ConsumeChunk {
  let seen = false;
  return (c) => {
    if (!c.example?.visual) return c;
    if (!seen) return (seen = true), c;
    return { ...c, example: { ...c.example, visual: undefined } };
  };
}

export function validateConsume(raw: unknown): ConsumeChunk[] {
  const root = obj(raw, "payload");
  return arr(
    root.chunks,
    "chunks",
    CONSUME_SECTION_BOUNDS.min,
    CONSUME_SECTION_BOUNDS.max,
  )
    .map(validateConsumeSection)
    .map(oneVisual());
}

function consumeContext(
  params: Boundary & {
    nodeKind?: NodeKind;
    domain?: Domain;
    /** The node's cell — `cellNote`; server-stamped, never from a client. */
    cell?: Cell;
    topic: string;
    nodeLabel: string;
    prereqLabels: string[];
    interests: string;
    language?: Language;
  },
): string {
  const { topic, nodeLabel, prereqLabels, interests } = params;
  return `Write the Consume pass, the first reading, for the concept "${nodeLabel}" within the topic "${topic}".
The learner already knows: ${prereqLabels.join(", ") || "nothing yet — this is a foundation"}.

WHO YOU ARE WRITING FOR. One learner, reading on their own. Write to them as "you", in plain, conversational sentences: a knowledgeable tutor explaining at a table, not a textbook. This is the phase where they are taught; the testing happens in later phases.

HOW THE LEARNER MEETS EACH SECTION — write for this sequence:
1. Before reading it, they answer the section's check from memory, first in their own words. If they get it right, the section collapses to its takeaway and they move on, so the check must test the section's central idea, and the takeaway alone must carry that idea completely for someone who already knew it.
2. Otherwise they read it — the terms, the prose, the worked example — and answer the same check again. Continuing is gated on it.

${sizeRule({
  unit: "sections",
  ...consumeBand(params.cell),
  atMin: "a concept with one mechanism and one way to get it wrong",
  atMax: "a concept with several genuinely separate moving parts",
})}

WRITE EACH SECTION'S FIELDS IN THIS ORDER:
- "takeaway" first: the one idea this section exists to teach, as a sentence precise enough to act on — a rule, a condition, a relation or a quantity, never a slogan. Everything after it serves it.
- "terms": only the terms the prose below uses that the learner does not already have, each defined in one line, before the paragraph that first uses it. None is a fine answer.
- "body": 2-5 paragraphs of 3-6 sentences, each paragraph with one job. Open on the problem or question the idea answers; give a concrete case before the general statement; then the mechanism — why it works, not only that it does. Real numbers and real cases throughout. No restating the kicker, no "it can be shown that", no bullet-point skeletons, and no paragraph that repeats the one before it.
- "example": one worked case, with real values, that applies this section's takeaway. Lead every step with a bold label of 1-3 words naming what the step is for, a colon, then the actual work ("**Set up:** …", "**Check:** …"), so the learner sees the moves and not only the result.
- "example.visual": write it in exactly ONE section of the pass whenever any worked case is spatial — an electric circuit, a geometry construction, a free-body or force diagram, a molecule, a graph to sketch. Pick the section whose example most needs the picture. It is an image prompt, in English, describing exactly that setup with the example's own values: every component and how it connects, labels only as short tags ("R1 = 4 Ω", "12 V", "A"). If no example in the pass is spatial, omit it everywhere.
- "diagram" and "figure", together: only for a process, a hierarchy or a causal relationship, drawn as its stages and what passes between them. Omit both for a definition, a comparison or anything else — never invent boxes to fill the slot.
- "ask": the question a learner is most likely left with after this section, phrased as they would ask it. It is offered as a suggestion when they highlight a passage to ask about.
- "check": answerable by someone who understood THIS section's takeaway, and not by someone who only knows the topic in general or read the kicker. Because it is also asked before the section, and asked first as an open question, the question must stand alone: state the case or the values inside it, ask for something they can answer in a phrase, never "which of the following", and never point at the material ("in the example", "this section", "as shown above"). Write three options, all within a few words of the same length and equally specific, so the longest or most qualified one is never the answer; the two wrong ones are plausible misreadings of this section — one of them the misconception, if this section is where it bites. The options are shuffled after you write them, so the slot you mark correct carries no information. "right": one line that confirms the answer and gives its reason, since a learner who guessed should still leave with it. "wrong": one line naming the misreading and where the section settles it — no new material.
- "cite": optional. One real, well-known work to read next on this — title and author, or a named lecture series — and never a citation of the prose above. Only a work you are certain exists, never with an invented page, section or chapter number. Omit the field otherwise.

ACROSS THE WHOLE PASS:
- Build in this order: what it is → why it works or where it comes from → how it behaves → where it breaks or is misused → where it leads. That is the order of the beats, not a list of sections: a small concept covers several beats inside one section.
- Correct the common misconception as a refutation, once, in the section where it bites: state the wrong idea the way a learner would hold it, say plainly that it is wrong, say what true thing makes it tempting, then show the case where it fails.
- Every section teaches something no other section does. When the concept is covered, stop.
- ${interestNote(interests)} When you use an analogy, say in a clause where it stops holding.
${boundaryNote(params)}${lensNote(params)}${kindNote(params.nodeKind, "consume")}${domainNote(params.domain, "consume")}${cellNote(params.cell, "consume")}
Where a note about this concept's kind, domain or weight differs from the general rules above, the note wins.`;
}

export async function generateConsume(
  params: Boundary & {
    nodeKind?: NodeKind;
    domain?: Domain;
    /** The node's cell — `cellNote`; server-stamped, never from a client. */
    cell?: Cell;
    topic: string;
    nodeLabel: string;
    prereqLabels: string[];
    interests: string;
    language?: Language;
  },
): Promise<ConsumeChunk[]> {
  const chunks = await generateJson(
    user(
      `${consumeContext(params)}

Return JSON:
{
  "chunks": [${CONSUME_SECTION_SHAPE}, ...]   // as many sections as the concept earns
}

${CONSUME_SECTION_EXAMPLE}${languageNote(params.language)}`,
    ),
    validateConsume,
    { label: "consume" },
  );
  // Each section's check is blind-solved before it is cached (W2.1).
  return Promise.all(chunks.map((c) => verifyChunkCheck(params, c)));
}

/**
 * Streamed variant: sections render as they're written instead of the
 * learner waiting on all 5. Asks for 5 standalone JSON objects (not one
 * wrapping array, so each is a complete, parseable unit as soon as its
 * closing brace lands) and yields each the moment it validates.
 *
 * It also yields the section currently being written, on a timer
 * (`draftConsumeSection`), so the first screen of a reading is the prose
 * appearing rather than a placeholder standing in for it — the wait used to
 * be the whole of the first section, which is the longest one there is.
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
const withoutCheck = <T extends { check?: unknown }>(c: T): T => {
  const { check: _held, ...rest } = c;
  return rest as T;
};

export async function* generateConsumeStream(
  params: Boundary & {
    nodeKind?: NodeKind;
    domain?: Domain;
    /** The node's cell — `cellNote`; server-stamped, never from a client. */
    cell?: Cell;
    topic: string;
    nodeLabel: string;
    prereqLabels: string[];
    interests: string;
    language?: Language;
  },
): AsyncGenerator<StreamFrame> {
  let yielded = 0;
  try {
    const stream = streamJsonObjectsProgressive(
      user(
        `${consumeContext(params)}

Write the sections as SEPARATE top-level JSON objects, one after another
— NOT wrapped in an array or a {"chunks": [...]} object, no markdown fences,
no numbering, no commentary before/after/between them. Each object has this
shape:
${CONSUME_SECTION_SHAPE}

${CONSUME_SECTION_EXAMPLE}${languageNote(params.language)}`,
      ),
      validateConsumeSection,
      { label: "consume-stream", partial: draftConsumeSection },
    );
    // A section lands at once without its check; the check follows at the
    // same index once blind-solved (W2.1), while the next section is written.
    const checked: StreamFrame[] = [];
    const pending: Promise<void>[] = [];
    const capVisual = oneVisual();
    for await (const chunk of stream) {
      while (checked.length) yield checked.shift()!;
      // Past the cap the payload fails its shape and is never cached, so every
      // learner on this node would pay for the same over-long reading again.
      if (yielded >= CONSUME_SECTION_BOUNDS.max) break;
      if (chunk.partial) {
        yield { p: "chunks", i: yielded, v: withoutCheck(chunk.value), partial: true };
        continue;
      }
      const i = yielded++;
      chunk.value = capVisual(chunk.value);
      yield { p: "chunks", i, v: withoutCheck(chunk.value) };
      if (chunk.value.check)
        pending.push(
          verifyChunkCheck(params, chunk.value).then((v) => {
            if (v.check) checked.push({ p: "chunks", i, v });
          }),
        );
    }
    await Promise.all(pending);
    while (checked.length) yield checked.shift()!;
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
