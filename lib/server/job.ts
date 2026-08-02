// One request → one job: the normalized inputs, the cache key they hash to,
// and the thunk that generates the content when the cache misses.
//
// Both /api/generate and /api/content resolve requests through here, which is
// what guarantees the batch warm addresses the exact same rows a real
// generation would write. Normalization (the input caps, the list trimming)
// happens before the key is derived, so a request and its capped twin share a
// cache entry instead of generating twice.

import {
  generateConnect,
  generateConsume,
  generateConsumeStream,
  generateCrucible,
  generateCurriculum,
  generateCurriculumStream,
  generateFeynman,
  generateRetain,
  generateSocratic,
  judgeChoice,
  judgeCrucible,
  judgeFeynman,
  judgeSocratic,
  type Language,
} from "@/lib/server/generate";
import { contentKey, type CacheableKind } from "@/lib/server/contentCache";
import type { StreamFrame, StreamShapes } from "@/lib/server/stream";
import { DIAGNOSTIC_COUNT, type GoalKind } from "@/lib/curriculum";

export type GenerateKind = CacheableKind | "judge";

export interface GenerateBody {
  kind: GenerateKind;
  /** The learner's chosen UI language — content comes back in it too.
   *  Defaults to "en" when absent (older clients, or judge calls that predate
   *  this field). Part of the cache key, so en/pt-BR generations never
   *  collide (see contentCache.ts VERSION). */
  language?: Language;
  topic?: string;
  goal?: GoalKind;
  interests?: string;
  outline?: string;
  nodeId?: string;
  nodeLabel?: string;
  prereqLabels?: string[];
  masteredLabels?: string[];
  pool?: Array<{ id: string; label: string }>;
  nodes?: Array<{ id: string; label: string; state: string }>;
  budgetMin?: number;
  /** Background warm: the client is filling its cache, nobody is waiting. */
  prefetch?: boolean;
  // judge fields
  mode?: "socratic" | "feynman" | "crucible" | "choice";
  question?: string;
  options?: string[];
  reference?: string;
  answer?: string;
  subPoint?: string;
  problem?: string;
  hint?: string;
}

// Input caps (#18) — a 100KB "topic" must never reach a prompt.
export const CAPS = {
  topic: 200,
  interests: 200,
  nodeLabel: 120,
  outline: 20_000,
  freeText: 4_000, // learner answers/attempts/explanations
  listItems: 30,
} as const;

export class BadRequest extends Error {}
export function badRequest(message: string): BadRequest {
  return new BadRequest(message);
}

const s = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const labels = (v: unknown, max: number = CAPS.listItems): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .slice(0, max)
        .map((x) => x.slice(0, CAPS.nodeLabel))
    : [];

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
  /** Model calls this job may make. Drives the monthly spend ceiling; the
   *  per-learner daily quota counts jobs, not calls. Defaults to 1. */
  cost?: number;
}

/**
 * Validate + normalize a request and describe the work it implies.
 * Throws BadRequest for anything malformed; the caller maps that to a 400.
 */
export function resolveJob(body: GenerateBody): Job {
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
  ): Job => ({ kind, key: contentKey(kind, params), run: () => run(params) });

  switch (body.kind) {
    case "curriculum": {
      const goal: GoalKind = ["exam", "project", "mastery"].includes(s(body.goal))
        ? (body.goal as GoalKind)
        : "mastery";
      const params = {
        topic,
        goal,
        interests,
        outline: s(body.outline).slice(0, CAPS.outline),
        language,
      };
      return {
        kind: "curriculum",
        key: contentKey("curriculum", params),
        run: async () => ({ ...(await generateCurriculum(params)) }),
        stream: () => generateCurriculumStream(params),
        // Two legal payloads: a map with its placement questions, or — for a
        // topic too broad to be one coherent map — scope offers instead.
        shape: [
          { graph: "one", diagnostic: { min: DIAGNOSTIC_COUNT, max: DIAGNOSTIC_COUNT } },
          { scopes: "one" },
        ],
      };
    }

    case "consume": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      const params = {
        topic,
        nodeLabel,
        prereqLabels: labels(body.prereqLabels),
        interests,
        language,
      };
      return {
        kind: "consume",
        key: contentKey("consume", params),
        run: async () => ({ chunks: await generateConsume(params) }),
        stream: () => generateConsumeStream(params),
        // Mirrors `validateConsume`'s 4-6 bound, not the 5 the prompt asks for.
        shape: { chunks: { min: 4, max: 6 } },
        // The reading pass, plus one rewrite call per section it produces.
        cost: 6,
      };
    }

    case "socratic": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      return cacheable(
        "socratic",
        { topic, nodeLabel, interests, language },
        async (p) => ({ steps: await generateSocratic(p) }),
      );
    }

    case "feynman": {
      if (!nodeId || !nodeLabel)
        throw badRequest("nodeId and nodeLabel are required");
      return cacheable(
        "feynman",
        { topic, nodeId, nodeLabel, interests, language },
        async (p) => ({ beats: await generateFeynman(p) }),
      );
    }

    case "connect": {
      if (!nodeId || !nodeLabel)
        throw badRequest("nodeId and nodeLabel are required");
      const pool = Array.isArray(body.pool)
        ? body.pool
            .filter(
              (p): p is { id: string; label: string } =>
                typeof p === "object" &&
                p !== null &&
                typeof p.id === "string" &&
                typeof p.label === "string",
            )
            .slice(0, CAPS.listItems)
        : [];
      if (pool.length === 0) throw badRequest("pool must list prior nodes");
      return cacheable(
        "connect",
        { topic, nodeId, nodeLabel, pool, interests, language },
        async (p) => ({ content: await generateConnect(p) }),
      );
    }

    case "crucible": {
      if (!nodeId || !nodeLabel)
        throw badRequest("nodeId and nodeLabel are required");
      return cacheable(
        "crucible",
        {
          topic,
          nodeId,
          nodeLabel,
          masteredLabels: labels(body.masteredLabels),
          interests,
          language,
        },
        async (p) => ({ content: await generateCrucible(p) }),
      );
    }

    case "retain": {
      const nodes = Array.isArray(body.nodes)
        ? body.nodes
            .filter(
              (n): n is { id: string; label: string; state: string } =>
                typeof n === "object" &&
                n !== null &&
                typeof n.id === "string" &&
                typeof n.label === "string" &&
                typeof n.state === "string",
            )
            .slice(0, CAPS.listItems)
        : [];
      if (nodes.length === 0) throw badRequest("nodes must list learned nodes");
      const budgetMin =
        typeof body.budgetMin === "number" && body.budgetMin >= 3
          ? Math.min(30, Math.round(body.budgetMin))
          : 8;
      return cacheable(
        "retain",
        { topic, budgetMin, nodes, interests, language },
        async (p) => ({ content: await generateRetain(p) }),
      );
    }

    case "judge": {
      const answer = s(body.answer).slice(0, CAPS.freeText);
      if (!answer.trim()) throw badRequest("answer is required");
      // Never cached: the payload is a verdict on one learner's own words.
      const uncached = (
        run: () => Promise<Record<string, unknown>>,
      ): Job => ({ kind: "judge", key: null, run });

      // "choice" maps a free-text answer onto a closed option list — it runs
      // on surfaces with no node (placement), so nodeLabel stays optional.
      if (body.mode === "choice") {
        const options = labels(body.options, 8);
        if (options.length < 2)
          throw badRequest("options must list 2+ candidates");
        return uncached(async () => ({
          judgement: await judgeChoice({
            topic,
            nodeLabel: nodeLabel || undefined,
            question: s(body.question).slice(0, CAPS.freeText),
            options,
            answer,
            language,
          }),
        }));
      }
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      if (body.mode === "socratic")
        return uncached(async () => ({
          judgement: await judgeSocratic({
            topic,
            nodeLabel,
            question: s(body.question).slice(0, CAPS.freeText),
            reference: s(body.reference).slice(0, CAPS.freeText),
            answer,
            language,
          }),
        }));
      if (body.mode === "feynman")
        return uncached(async () => ({
          judgement: await judgeFeynman({
            topic,
            nodeLabel,
            subPoint: s(body.subPoint).slice(0, CAPS.nodeLabel * 2),
            reference: s(body.reference).slice(0, CAPS.freeText),
            explanation: answer,
            language,
          }),
        }));
      if (body.mode === "crucible")
        return uncached(async () => ({
          judgement: await judgeCrucible({
            topic,
            nodeLabel,
            problem: s(body.problem).slice(0, CAPS.freeText),
            hint: s(body.hint).slice(0, CAPS.freeText),
            attempt: answer,
            language,
          }),
        }));
      throw badRequest(`unknown judge mode "${String(body.mode)}"`);
    }

    default:
      throw badRequest(`unknown kind "${String(body.kind)}"`);
  }
}
