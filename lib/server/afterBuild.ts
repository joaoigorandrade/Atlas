// What happens behind a finished response: recording the content a topic now
// owns, and warming the map the learner is about to walk into.
//
// Both run in `after()`, so neither is on the path of the response — a learner
// who has their content must not be made to wait on the bookkeeping that
// remembers it, and a fresh map's frontier is written while they are still
// answering placement questions.

import { after } from "next/server";
import {
  conceptBoundary,
  displayStates,
  initialStates,
  type ConceptGraph,
  type ConceptNode,
} from "@/lib/curriculum";
import { logError, logEvent } from "@/lib/log";
import { readContent, writeContent } from "@/lib/server/contentCache";
import { ownsTopic, putContent } from "@/lib/server/store";
import { resolveJob, type GenerateBody, type Job } from "@/lib/server/job";
import type { createClient } from "@/lib/supabase/server";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/** Record the job's model calls in `generation_log`, stamped with the topic
 *  that caused them. Non-fatal but loudly logged. */
export async function logGenerationCalls(
  supabase: SupabaseLike,
  job: Job,
  opts: { jobId: string; requestId?: string; topicId?: string },
): Promise<void> {
  const calls = Math.max(1, job.cost ?? 1);
  const { error } = await supabase.from("generation_log").insert(
    Array.from({ length: calls }, () => ({
      kind: job.kind.slice(0, 40),
      job_id: opts.jobId,
      // Spend, attributable to the topic that caused it. Nulled rather than
      // deleted when that topic goes — the log outlives the learning data.
      topic_id: opts.topicId ?? null,
    })),
  );
  if (error) logError("generation_log_insert_failed", error, { req: opts.requestId });
}

/** Kinds whose payload belongs to a node of a topic.
 *
 *  `curriculum` is absent on purpose: the map is not content hanging off a
 *  node, it *is* the nodes, and it lands in the `nodes` and `edges` tables.
 *  The uncacheable kinds (`judge`, `diagnosticQuestion`, `passage`) are absent
 *  because each one answers one learner's own words and is never replayed. */
const RECORDED = new Set([
  "summary",
  "consume",
  "model",
  "socratic",
  "feynman",
  "connect",
  "crucible",
  "retain",
]);

/**
 * Record that this topic now has this content.
 *
 * The single change that retires the `caches` column: the moment a payload
 * exists — freshly generated, or served from the shared cache to a learner who
 * has never seen it — it is written against their topic here, on the server.
 * No client uploads content any more, and a second device opens warm for free.
 *
 * A `cacheKey` is stored in preference to the payload: the bytes already live
 * once in `content_cache` for everyone, so the topic only needs a pointer.
 *
 * Best-effort and never awaited by the response path. A learner who has their
 * content must not be made to wait on the bookkeeping that remembers it, and a
 * failure here costs a re-generation later, not the content in front of them.
 */
export function recordContent(
  supabase: SupabaseLike,
  body: GenerateBody,
  job: Job,
  userId: string,
  payload: Record<string, unknown>,
): void {
  const topicId = body.topicId;
  if (!topicId || !RECORDED.has(job.kind)) return;
  // `retain` is drafted from the set of nodes with no card yet, so it is
  // topic-wide and files under the empty node id — the same address the
  // normalization backfill gave it.
  const nodeId = job.kind === "retain" ? "" : (body.nodeId ?? "");
  if (job.kind !== "retain" && !nodeId) return;
  after(async () => {
    try {
      // RLS checks `user_id`, which this write supplies — so the topic itself
      // has to be checked, or a forged topicId would file a learner's content
      // under someone else's map.
      if (!(await ownsTopic(supabase as never, topicId))) return;
      await putContent(
        supabase as never,
        userId,
        topicId,
        { nodeId, kind: job.kind, variant: body.variant ?? "" },
        job.key ? { cacheKey: job.key } : { payload },
      );
    } catch (err) {
      logError("record_content_failed", err, { kind: job.kind, node: nodeId });
    }
  });
}

/** Cap on frontier nodes warmed behind a finished build; 0 turns the warm off.
 *
 *  A *fresh* map's frontier is exactly its root set — the concepts with no
 *  prerequisites — because every state starts `unknown`. That is two to four
 *  nodes on a real map, so this cap is a backstop against a pathological map
 *  rather than the thing that decides the depth. It used to be 3, which cut
 *  real root sets short and left the learner generating the fourth root
 *  themselves. */
const CURRICULUM_WARM_NODES = Number(process.env.CURRICULUM_WARM_NODES || 12);

/**
 * The request a frontier warm generates from.
 *
 * Exported for one reason: `tests/frontierWarm.test.ts` hashes it against the
 * request a learner's own click sends and fails if the two ever stop matching.
 * They stopped matching once already — this omitted the boundary, so every
 * warm wrote to a row no click would ask for and the whole frontier was
 * generated twice, once behind the build and once at the tap. Nothing about
 * that was visible: both requests succeeded, both returned content, and the
 * bill was the only place it showed.
 *
 * Every field here is a cache-key input, and every one is derived the way the
 * clients derive it (`consumeParams` on the web, `context(for:)` on iOS).
 */
export function frontierWarmBody(
  body: GenerateBody,
  graph: ConceptGraph,
  node: ConceptNode,
  kind: "consume" | "socratic",
): GenerateBody {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  /** A node's solid prerequisites — `consume` alone takes them. */
  const prereqLabels = graph.edges
    .filter(([, to, dashed]) => to === node.id && !dashed)
    .map(([from]) => byId.get(from)?.label)
    .filter((label): label is string => !!label);
  return {
    kind,
    topic: body.topic,
    interests: body.interests,
    language: body.language,
    nodeId: node.id,
    nodeLabel: node.label,
    // The map around the concept. Part of the cache key, so it is part of
    // this — `laterLabels` is non-empty on any map with two concepts on it.
    ...conceptBoundary(graph, node.id),
    ...(kind === "consume" ? { prereqLabels } : null),
  };
}

/**
 * Generate the first thing the learner will click, before they click it.
 *
 * A fresh map's frontier is the one part of the spiral we can predict with
 * certainty, and the learner is about to spend a good half-minute answering
 * three placement questions. `after()` runs this once the response has been
 * flushed, so the build isn't slowed by it, and the results land in the shared
 * `content_cache` — which means the *next* learner on this topic gets them
 * too, not just this one.
 *
 * This also covers a gap the client-side warm structurally cannot: `warm.ts`
 * runs two requests at a time from the browser and only starts once the map is
 * on screen.
 *
 * Everything here is best-effort. A failure is logged and dropped — the click
 * it was meant to cover simply generates the way it does today.
 */
export function startCurriculumWarm(
  supabase: SupabaseLike,
  graph: ConceptGraph,
  body: GenerateBody,
  userId: string,
): void {
  if (CURRICULUM_WARM_NODES <= 0) return;
  const topicId = body.topicId;
  // The same derivation the client uses, not a second heuristic that could
  // drift from it: on a fresh map every state is `unknown`, so `frontier` is
  // exactly the nodes whose prerequisites are already met.
  const display = displayStates(initialStates(graph), graph);
  const frontier = graph.nodes
    .filter((n) => display[n.id] === "frontier")
    .slice(0, CURRICULUM_WARM_NODES);
  if (frontier.length === 0) return;

  after(async () => {
    // The warm is real spend — six calls at the default depth — and nothing
    // stops it any more: `CURRICULUM_WARM_NODES` is the only dial on it.
    for (const node of frontier) {
      // A learner who deleted the topic while this was running must stop being
      // billed for it. The row is gone the moment the DELETE lands, so asking
      // once per node is both the check and the cancellation.
      if (topicId && !(await ownsTopic(supabase as never, topicId))) {
        logEvent("curriculum_warm_cancelled", { user: userId, topic: topicId });
        return;
      }
      for (const kind of ["consume", "socratic"] as const) {
        try {
          // Through resolveJob, so these hash to the row the learner's own
          // request will later address.
          const warm = resolveJob(frontierWarmBody(body, graph, node, kind));
          if (!warm.key) continue;
          const record = () =>
            topicId
              ? putContent(
                  supabase as never,
                  userId,
                  topicId,
                  { nodeId: node.id, kind },
                  { cacheKey: warm.key! },
                )
              : Promise.resolve();
          // Already generated — by an earlier warm, or by another learner on
          // the same topic. Still record it: the payload exists, so this topic
          // should own a pointer to it rather than re-deriving one on the
          // learner's click.
          if (await readContent(warm.key)) {
            await record();
            continue;
          }
          const jobId = crypto.randomUUID();
          await logGenerationCalls(supabase, warm, { jobId, topicId });
          await writeContent(warm.key, warm.kind, await warm.run());
          await record();
          logEvent("curriculum_warm", { user: userId, kind, node: node.id });
        } catch (err) {
          logError("curriculum_warm_failed", err, { kind, node: node.id });
        }
      }
    }
  });
}
