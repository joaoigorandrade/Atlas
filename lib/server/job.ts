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
  generateConsumeModel,
  generateConsumeModelStream,
  generateConsumeStream,
  generateCrucible,
  generateDiagnosticQuestion,
  generateFeynman,
  generateFeynmanStream,
  generateMap,
  generateMapStream,
  generateRetain,
  generateSocratic,
  generateSocraticStream,
  judgeChoice,
  judgeChoiceStream,
  judgeCrucible,
  judgeCrucibleStream,
  judgeFeynman,
  judgeFeynmanStream,
  judgeSocratic,
  judgeSocraticStream,
  MAP_NODE_BOUNDS,
  type Language,
} from "@/lib/server/generate";
import { contentKey, type CacheableKind } from "@/lib/server/contentCache";
import type { StreamFrame, StreamShapes } from "@/lib/server/stream";
import {
  ALT_KEYS,
  DIAGNOSTIC_DIFFICULTIES,
  FEYNMAN_BEATS,
  MODEL_BEAT_BOUNDS,
  type AltKey,
  type DiagnosticDifficulty,
  type GoalKind,
} from "@/lib/curriculum";

export type GenerateKind = CacheableKind | "judge" | "diagnosticQuestion";

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
  // model fields — the section a lens was opened over, as it is on screen
  lens?: string;
  kicker?: string;
  sectionBody?: string[];
  takeaway?: string;
  masteredLabels?: string[];
  pool?: Array<{ id: string; label: string }>;
  nodes?: Array<{ id: string; label: string; state: string }>;
  budgetMin?: number;
  // diagnosticQuestion fields
  difficulty?: string;
  index?: number;
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
  /** Model calls this job may make — how many `generation_log` rows it writes,
   *  so spend telemetry counts calls rather than surfaces. Defaults to 1. */
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
      // `interests` is deliberately absent. The map prompt never used it —
      // interests flavor analogies inside a concept, not which concepts the
      // topic is made of — so keying on it split byte-identical maps across
      // rows and cost the shared cache the one generation that can never be
      // warmed. Two learners on the same topic now share a map.
      const params = {
        topic,
        goal,
        outline: s(body.outline).slice(0, CAPS.outline),
        language,
      };
      return {
        kind: "curriculum",
        key: contentKey("curriculum", params),
        run: async () => ({ ...(await generateMap(params)) }),
        stream: () => generateMapStream(params),
        // Mirrors `validateGraphPart`'s 10-24 bound, not the 12-18 the prompt
        // asks for. The scopes variant is the too-broad answer (#30) — a
        // complete, cacheable payload with no map in it at all.
        shape: [
          { nodes: { ...MAP_NODE_BOUNDS } },
          { scopes: { min: 2, max: 3 } },
        ],
      };
    }

    case "diagnosticQuestion": {
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
      if (pool.length === 0) throw badRequest("pool must list candidate nodes");
      const difficulty: DiagnosticDifficulty = DIAGNOSTIC_DIFFICULTIES.includes(
        body.difficulty as DiagnosticDifficulty,
      )
        ? (body.difficulty as DiagnosticDifficulty)
        : "medium";
      const index =
        typeof body.index === "number" && Number.isInteger(body.index)
          ? body.index
          : 0;
      const params = {
        topic,
        goal: ["exam", "project", "mastery"].includes(s(body.goal))
          ? (body.goal as GoalKind)
          : "mastery",
        interests,
        language,
        nodeCandidates: pool,
        difficulty,
        index,
      };
      // Never cached: which question comes next depends on how the learner
      // answered the last one, so no two placements share this call's inputs.
      return {
        kind: "diagnosticQuestion",
        key: null,
        run: async () => ({ ...(await generateDiagnosticQuestion(params)) }),
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
      const sectionBody = (
        Array.isArray(body.sectionBody) ? body.sectionBody : []
      )
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

    case "socratic": {
      if (!nodeLabel) throw badRequest("nodeLabel is required");
      const params = { topic, nodeLabel, interests, language };
      return {
        kind: "socratic",
        key: contentKey("socratic", params),
        run: async () => ({ steps: await generateSocratic(params) }),
        stream: () => generateSocraticStream(params),
        // Mirrors `validateSocratic`'s 3-5 bound, not the 4 the prompt asks for.
        shape: { steps: { min: 3, max: 5 } },
      };
    }

    case "feynman": {
      if (!nodeId || !nodeLabel)
        throw badRequest("nodeId and nodeLabel are required");
      const params = { topic, nodeId, nodeLabel, interests, language };
      return {
        kind: "feynman",
        key: contentKey("feynman", params),
        run: async () => ({ beats: await generateFeynman(params) }),
        stream: () => generateFeynmanStream(params),
        // Mirrors `validateFeynman`'s 3-4 bound, not the 4 the prompt asks for.
        shape: { beats: { min: 3, max: FEYNMAN_BEATS } },
      };
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
        if (options.length < 2)
          throw badRequest("options must list 2+ candidates");
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
      if (body.mode === "socratic") {
        const p = {
          topic,
          nodeLabel,
          question: s(body.question).slice(0, CAPS.freeText),
          reference: s(body.reference).slice(0, CAPS.freeText),
          answer,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgeSocratic(p) }),
          () => judgeSocraticStream(p),
        );
      }
      if (body.mode === "feynman") {
        const p = {
          topic,
          nodeLabel,
          subPoint: s(body.subPoint).slice(0, CAPS.nodeLabel * 2),
          reference: s(body.reference).slice(0, CAPS.freeText),
          explanation: answer,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgeFeynman(p) }),
          () => judgeFeynmanStream(p),
        );
      }
      if (body.mode === "crucible") {
        const p = {
          topic,
          nodeLabel,
          problem: s(body.problem).slice(0, CAPS.freeText),
          hint: s(body.hint).slice(0, CAPS.freeText),
          attempt: answer,
          language,
        };
        return uncached(
          async () => ({ judgement: await judgeCrucible(p) }),
          () => judgeCrucibleStream(p),
        );
      }
      throw badRequest(`unknown judge mode "${String(body.mode)}"`);
    }

    default:
      throw badRequest(`unknown kind "${String(body.kind)}"`);
  }
}
