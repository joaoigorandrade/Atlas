// One request → one job: the normalized inputs, the cache key they hash to,
// and the thunk that generates the content when the cache misses. Both
// /api/generate and /api/content resolve requests through here, which is what
// guarantees the batch warm addresses the exact same rows a real generation
// would write. Normalization (the input caps, the list trimming) happens before
// the key is derived, so a request and its capped twin share a cache entry.

import type { Language } from "@/lib/i18n";
import {
  generateConsume,
  generateConsumeModel,
  generateConsumeModelStream,
  generateConsumeStream,
  generateExplain,
  generateMap,
  generateMapStream,
  generatePassage,
  generatePassageStream,
  generatePerform,
  generateRetain,
  retainNodes,
  generateSummary,
  judgeChoice,
  judgeChoiceStream,
  judgePerform,
  judgeRecall,
  judgeRecallStream,
  judgePerformStream,
  mapNodeBounds,
  continentLinksParams,
  linksPayload,
  verifiedRun,
} from "@/lib/server/generate";
import { contentKey, type CacheableKind } from "@/lib/server/contentCache";
import { examJob } from "./examJob";
import {
  CAPS,
  badRequest,
  boundary,
  neighboursAxis,
  topicAxes,
  labels,
  nodeAxes,
  rubricRows,
  s,
  sketchUrl,
  type GenerateBody,
  type GenerateKind,
} from "./jobInput";
import {
  payloadToFrames,
  type StreamFrame,
  type StreamShapes,
} from "@/lib/server/stream";
import { FIXTURES, fixturePayload } from "@/lib/server/fixtures";
import { otherFixture } from "@/lib/server/fixturesPhases";
import {
  ALT_KEYS,
  CONSUME_SECTION_BOUNDS,
  MODEL_BEAT_BOUNDS,
  type AltKey,
  type GoalKind,
} from "@/lib/curriculum";

export interface Job {
  kind: GenerateKind;
  /** Where this job's output lives in `content_cache`, or null when the kind
   *  is uncacheable (a judge call grades one learner's own words). */
  key: string | null;
  /** Produce the response body in one piece. Called on a cache miss, and as
   *  the fallback whenever a streamed attempt fails before its first frame. */
  run: () => Promise<Record<string, unknown>>;
  /** Set for kinds that can deliver progressively: the route streams frames to
   *  the client as they're written rather than waiting on the whole payload.
   *  `shape` says what a complete set of frames looks like, so the assembled
   *  payload written back to `content_cache` is exactly what `run` would have
   *  returned — no half-payload can ever be cached. */
  stream?: () => AsyncGenerator<StreamFrame>;
  shape?: StreamShapes;
  /** Model calls this job may make — how many `generation_log` rows it writes,
   *  so spend telemetry counts calls rather than surfaces. Defaults to 1. */
  cost?: number;
}

/**
 * Validate + normalize a request and describe the work it implies.
 * Throws BadRequest for anything malformed; the caller maps that to a 400.
 */
export function resolveJob(body: GenerateBody): Job {
  const job = buildJob(body);
  return FIXTURES ? asFixture(job, body) : job;
}

/**
 * The same job, answered from `lib/server/fixtures.ts` instead of OpenRouter
 * (docs/PLAN-QUALITY.md §1.1). Deliberately narrow: normalization, the caps and
 * the BadRequest checks all still run — `buildJob` has already done them — so a
 * fixture run exercises the real request contract, not a bypass of it.
 *
 * `key` is dropped on purpose. A fixture must never be written into
 * `content_cache`, where a live deploy could later read it as real content.
 */
function asFixture(job: Job, body: GenerateBody): Job {
  const payload = fixturePayload(job.kind, body) ?? otherFixture(job.kind, body);
  if (!payload) return job;
  const shape = job.shape;
  return {
    ...job,
    key: null,
    run: async () => payload,
    stream: shape
      ? async function* () {
          for (const frame of payloadToFrames(payload, shape)) yield frame;
        }
      : undefined,
  };
}

function buildJob(body: GenerateBody): Job {
  const topic = s(body.topic).trim();
  const interests = s(body.interests).slice(0, CAPS.interests);
  const nodeId = s(body.nodeId).slice(0, CAPS.nodeLabel);
  const nodeLabel = s(body.nodeLabel);
  const language: Language = body.language === "pt-BR" ? "pt-BR" : "en";

  if (!topic) throw badRequest("topic is required");
  if (topic.length > CAPS.topic)
    throw badRequest(`topic is too long (max ${CAPS.topic} characters)`);
  if (nodeLabel.length > CAPS.nodeLabel)
    throw badRequest(`nodeLabel is too long (max ${CAPS.nodeLabel} characters)`);

  /** Cacheable job: the key hashes exactly the params the generator sees. */
  const cacheable = <P>(
    kind: CacheableKind,
    params: P,
    run: (p: P) => Promise<Record<string, unknown>>,
  ): Job => ({
    kind,
    key: contentKey(kind, params),
    // Closed items are blind-solved before they are cached (W2.1).
    run: () => verifiedRun(kind, params as never, run as never),
  });

  /** The params every per-node item phase keys on — one builder, so a new axis
   *  cannot reach five of them and miss the sixth. */
  const itemParams = () => {
    if (!nodeId || !nodeLabel) throw badRequest("nodeId and nodeLabel are required");
    return {
      topic,
      nodeId,
      nodeLabel,
      interests,
      language,
      ...boundary(body),
      ...nodeAxes(body),
    };
  };

  // Which time through a node's Crucible or Perform this is — server-stamped
  // from the attempts log (`withNodeCell`). Omitted when 0, so every row
  // written before it keeps its address.
  const rerun =
    typeof body.rerun === "number" ? Math.max(0, Math.min(9, Math.round(body.rerun))) : 0;

  switch (body.kind) {
    case "curriculum": {
      // One flow: whatever goal an older client sends, the map is built for it.
      const goal: GoalKind = "glance";
      // `interests` is deliberately absent. The map prompt never used it —
      // interests flavor analogies inside a concept, not which concepts the
      // topic is made of — so keying on it split byte-identical maps across
      // rows and cost the shared cache the one generation that can never be
      // warmed. Two learners on the same topic now share a map.
      const params = {
        topic,
        goal,
        // Omitted unless true, so an ordinary build still keys to the row it
        // always did. A scoped build genuinely asks a different prompt and
        // earns its own row rather than forking the common one.
        ...(body.scoped === true ? { scoped: true } : {}),
        ...neighboursAxis(body),
        // The learner's target shapes the map (W5.1); the axes the map writes
        // about itself (language, shape) are its outputs, never its key.
        ...(topicAxes(body).target ? { target: topicAxes(body).target } : {}),
        outline: s(body.outline).slice(0, CAPS.outline),
        language,
        // The map kind's own version, so a map-prompt change never re-bills every
        // kind through `VERSION`. 2: "about" header (W1.1); 3: one named chapter
        // maps that chapter; 4: a glance ends on its use; 5: caps, never pads; 6-7: levels.
        mapV: 7,
      };
      return {
        kind: "curriculum",
        key: contentKey("curriculum", params),
        run: async () => ({ ...(await generateMap(params)) }),
        stream: () => generateMapStream(params),
        // Mirrors `validateGraphPart`'s bound, not the narrower band the prompt
        // asks for — a Pareto map is deliberately smaller. The scopes variant
        // is the too-broad answer (#30) — a complete, cacheable payload with
        // no map in it at all.
        // The header-carrying map first; a map cached before the header still
        // assembles through the second shape.
        shape: [
          { nodes: mapNodeBounds(undefined, goal), meta: "one" },
          { nodes: mapNodeBounds(undefined, goal) },
          { scopes: { min: 2, max: 3 } },
        ],
      };
    }

    case "summary": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      // One sentence for one concept — the backfill for a node whose map
      // arrived without it. Cached like any other generation: two learners on
      // the same topic share the row, and it is a handful of tokens either way.
      return cacheable(
        "summary",
        { topic, nodeLabel, prereqLabels: labels(body.prereqLabels), language },
        async (p) => ({ summary: await generateSummary(p) }),
      );
    }
    case "continentLinks": // which maps of a continent share material
      return cacheable("continentLinks", continentLinksParams(body, topic), linksPayload);

    case "consume": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      const params = {
        topic,
        nodeLabel,
        prereqLabels: labels(body.prereqLabels),
        interests,
        language,
        ...boundary(body),
        ...nodeAxes(body),
      };
      return {
        kind: "consume",
        key: contentKey("consume", params),
        run: async () => ({ chunks: await generateConsume(params) }),
        stream: () => generateConsumeStream(params),
        // Mirrors `validateConsume`'s bound, not the 2-5 band the prompt asks
        // for — a pass is as long as its concept earns.
        shape: { chunks: { ...CONSUME_SECTION_BOUNDS } },
      };
    }

    case "model": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      const lens = ALT_KEYS.find((k) => k === body.lens);
      if (!lens) throw badRequest(`unknown lens "${String(body.lens)}"`);
      const kicker = s(body.kicker).slice(0, CAPS.nodeLabel);
      // The section's own prose, keyed on rather than merely passed: two
      // learners reading the *same* cached section share this row, and a
      // walkthrough can never be grafted onto wording it wasn't written for.
      const sectionBody = (Array.isArray(body.sectionBody) ? body.sectionBody : [])
        .filter((p): p is string => typeof p === "string")
        .slice(0, 8)
        .map((p) => p.slice(0, CAPS.freeText));
      if (!kicker || sectionBody.length === 0)
        throw badRequest("kicker and sectionBody are required");
      const params = {
        topic,
        nodeLabel,
        lens: lens as AltKey,
        kicker,
        body: sectionBody,
        takeaway: s(body.takeaway).slice(0, CAPS.freeText),
        interests,
        language,
      };
      return {
        kind: "model",
        key: contentKey("model", params),
        run: async () => ({ beats: await generateConsumeModel(params) }),
        stream: () => generateConsumeModelStream(params),
        // Mirrors `validateConsumeModel`'s bound, not the count the prompt
        // asks for.
        shape: { beats: { ...MODEL_BEAT_BOUNDS } },
      };
    }

    case "passage": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      const selection = s(body.selection).slice(0, CAPS.freeText).trim();
      if (!selection) throw badRequest("selection is required");
      const params = {
        topic,
        nodeLabel,
        kicker: s(body.kicker).slice(0, CAPS.nodeLabel),
        section: s(body.section).slice(0, CAPS.freeText),
        selection,
        // Optional on purpose: a learner who highlights and taps without
        // typing is asking "explain this", which is a real question.
        question: s(body.question).slice(0, CAPS.freeText).trim(),
        language,
      };
      // Never cached — one learner's own words about one arbitrary substring.
      return {
        kind: "passage",
        key: null,
        run: async () => ({ answer: await generatePassage(params) }),
        stream: () => generatePassageStream(params),
        // Mirrors `validatePassage`'s 1-4 bound, not the 2-3 the prompt asks
        // for. Nothing is cached here, but the shape is still what decides
        // whether an assembled answer is complete.
        shape: { answer: { min: 1, max: 4 } },
      };
    }

    case "explain":
      return cacheable("explain", itemParams(), async (p) => ({
        content: await generateExplain(p),
      }));

    case "perform": {
      // No `interests`: unread by the prompt, so they only forked rows per learner.
      const { interests: _unread, ...item } = itemParams();
      return cacheable(
        "perform",
        { ...item, ...(rerun ? { rerun } : {}) },
        async (p) => ({ content: await generatePerform(p) }),
      );
    }

    case "retain": {
      const nodes = retainNodes(body.nodes, CAPS.listItems, CAPS.lesson);
      if (nodes.length === 0) throw badRequest("nodes must list learned nodes");
      const budgetMin =
        typeof body.budgetMin === "number" && body.budgetMin >= 3
          ? Math.min(30, Math.round(body.budgetMin))
          : 8;
      // Keyed without `budgetMin` (or `interests`): neither reaches the prompt,
      // and keying on them paid twice for the same cards.
      return cacheable("retain", { topic, nodes, language }, async (p) => ({
        content: await generateRetain({ ...p, budgetMin }),
      }));
    }

    case "judge": {
      const answer = s(body.answer).slice(0, CAPS.freeText);
      const sketch = body.mode === "perform" ? sketchUrl(body.sketch) : undefined;
      if (!answer.trim() && !sketch) throw badRequest("answer is required");
      // Never cached: the payload is a verdict on one learner's own words.
      // Streamed all the same — the verdict object arrives in under a second
      // and unblocks the screen while the critique is still being written.
      // `shape` is a single slot: the second frame replaces the first, so the
      // assembled payload is exactly what `run` would have returned.
      const uncached = (
        run: () => Promise<Record<string, unknown>>,
        stream: () => AsyncGenerator<StreamFrame>,
      ): Job => ({
        kind: "judge",
        key: null,
        run,
        stream,
        shape: { judgement: "one" },
      });

      // "choice" maps a free-text answer onto a closed option list — it runs
      // on surfaces with no node (placement), so nodeLabel stays optional.
      if (body.mode === "choice") {
        const options = labels(body.options, 8);
        if (options.length < 2) throw badRequest("options must list 2+ candidates");
        const p = {
          topic,
          nodeLabel: nodeLabel || undefined,
          question: s(body.question).slice(0, CAPS.freeText),
          options,
          answer,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgeChoice(p) }),
          () => judgeChoiceStream(p),
        );
      }
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      if (body.mode === "recall") {
        if (!nodeLabel) throw badRequest("nodeLabel is required");
        const rubric = rubricRows(body);
        const p = {
          topic,
          nodeLabel,
          brief: s(body.brief).slice(0, CAPS.freeText),
          rubric,
          cued: body.cued === true,
          written: answer,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgeRecall(p) }),
          () => judgeRecallStream(p),
        );
      }
      if (body.mode === "perform") {
        if (!nodeLabel) throw badRequest("nodeLabel is required");
        const rubric = rubricRows(body);
        const p = {
          topic,
          nodeLabel,
          task: s(body.task).slice(0, CAPS.freeText),
          rubric,
          work: answer,
          sketch,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgePerform(p) }),
          () => judgePerformStream(p),
        );
      }
      throw badRequest(`unknown judge mode "${String(body.mode)}"`);
    }

    case "exam":
      return examJob(body, { topic, interests, language });
    default:
      throw badRequest(`unknown kind "${String(body.kind)}"`);
  }
}

// Re-exported from `./jobInput` so every call site importing them here still works.
export { BadRequest, CAPS, badRequest } from "./jobInput";
export type { GenerateBody, GenerateKind } from "./jobInput";
