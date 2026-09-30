// W2.8: the reviewer's tool for a verified map. Not a test — a script run
// through vitest so it can reuse the server's own key derivation:
//
//   RUN_VERIFY_MAP=1 TOPIC_ID=<uuid> node --env-file=.env.local \
//     node_modules/vitest/vitest.mjs run tests/verifyMap.run.test.ts
//
// dumps the topic's map and its first-column nodes' payloads to
// `scratch/verified/<topic>.md` for a person to read. Only with MARK=1 does it
// set `verified` on those shared `content_cache` rows (which the TTL prune then
// never drops) and on the topic. Who reviews is the product's call (open
// decision 6) — this never marks anything on its own.

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { resolveJob } from "@/lib/server/job";
import { withTopicAxes } from "@/lib/server/store/topicAxes";

const run = !!process.env.RUN_VERIFY_MAP && !!process.env.TOPIC_ID;

describe.skipIf(!run)("verify a map (W2.8)", () => {
  it(
    "dumps it for review, and marks it only when asked",
    { timeout: 120_000 },
    async () => {
      const db = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
      );
      const id = process.env.TOPIC_ID!;
      const { data: topic } = await db
        .from("topics")
        .select("id, subject, goal, pareto_pct, language, target")
        .eq("id", id)
        .single();
      if (!topic) throw new Error(`no topic ${id}`);
      const body = await withTopicAxes(db, {
        kind: "curriculum",
        topic: topic.subject,
        goal: topic.goal,
        paretoPct: topic.pareto_pct,
        language: topic.language ?? "en",
        topicId: id,
      } as never);
      const mapKey = resolveJob(body).key!;
      const { data: map } = await db
        .from("content_cache")
        .select("payload")
        .eq("key", mapKey)
        .maybeSingle();
      const { data: nodes } = await db
        .from("nodes")
        .select("id, label, g")
        .eq("topic_id", id);
      const first = new Set((nodes ?? []).filter((n) => n.g === 1).map((n) => n.id));
      const { data: rows } = await db
        .from("node_content")
        .select("node_id, kind, cache_key, payload")
        .eq("topic_id", id);
      const picked = (rows ?? []).filter((r) => first.has(r.node_id));
      const md = [
        `# ${topic.subject} — review`,
        "",
        `Map row: \`${mapKey}\` ${map ? "" : "(NOT IN CACHE — rebuild first)"}`,
        "",
        "## The map",
        "```json",
        JSON.stringify(map?.payload ?? null, null, 2),
        "```",
        ...picked.flatMap((r) => [
          "",
          `## ${r.node_id} · ${r.kind}`,
          "```json",
          JSON.stringify(r.payload, null, 2),
          "```",
        ]),
      ].join("\n");
      mkdirSync("scratch/verified", { recursive: true });
      writeFileSync(`scratch/verified/${id}.md`, md);
      console.log(`wrote scratch/verified/${id}.md — ${picked.length} payloads`);
      if (process.env.MARK !== "1") return;
      const keys = [mapKey, ...picked.map((r) => r.cache_key).filter(Boolean)];
      await db.from("content_cache").update({ verified: true }).in("key", keys);
      await db.from("topics").update({ verified: true }).eq("id", id);
      console.log(`marked ${keys.length} rows verified`);
    },
  );
});
