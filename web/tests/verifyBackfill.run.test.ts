// W2.1 backfill: blind-solve every closed item already in the shared cache.
// Not a test — a script run through vitest so it reuses the verifier:
//
//   RUN_VERIFY_BACKFILL=1 node --env-file=.env.local \
//     node_modules/vitest/vitest.mjs run tests/verifyBackfill.run.test.ts
//
// reports what it would change; APPLY=1 changes it. A disputed item is
// dropped from the row (and from every topic's copy in `node_content`) while
// the kind's floor holds — the shape is unchanged, so no VERSION bump. A row
// that would fall below its floor is deleted, with its topic copies, so the
// next open writes a verified one. A Consume section's disputed check is
// removed from its section.

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { VERIFY, blindSolve, checkItem, disputedIds } from "@/lib/server/generate/verify";
import type { ConsumeChunk } from "@/lib/curriculum";

const run = !!process.env.RUN_VERIFY_BACKFILL;
const apply = process.env.APPLY === "1";
type Kind = keyof typeof VERIFY;

describe.skipIf(!run)("verify backfill (W2.1)", () => {
  it("blind-solves the cache", { timeout: 3_600_000 }, async () => {
    const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    const kinds = [...Object.keys(VERIFY), "consume"];
    const { data: rows } = await db
      .from("content_cache")
      .select("key, kind, payload")
      .in("kind", kinds);
    const report: string[] = [];
    const write = async (key: string, payload: unknown) => {
      if (!apply) return;
      await db.from("content_cache").update({ payload }).eq("key", key);
      await db.from("node_content").update({ payload }).eq("cache_key", key);
    };
    const drop = async (key: string) => {
      if (!apply) return;
      await db.from("node_content").delete().eq("cache_key", key);
      await db.from("content_cache").delete().eq("key", key);
    };
    for (const row of rows ?? []) {
      const payload = row.payload as Record<string, unknown>;
      try {
        if (row.kind === "consume") {
          const chunks = (payload.chunks ?? []) as ConsumeChunk[];
          const items = chunks.map(checkItem).filter((x) => x !== null);
          if (!items.length) continue;
          const bad = disputedIds(
            items,
            await blindSolve({ topic: "", nodeLabel: "", items }),
          );
          if (!bad.length) continue;
          report.push(`consume ${row.key.slice(0, 10)}: ${bad.length} check(s) dropped`);
          await write(row.key, {
            ...payload,
            chunks: chunks.map((c) => {
              if (!bad.includes(c.id)) return c;
              const { check: _gone, ...rest } = c;
              return rest;
            }),
          });
          continue;
        }
        const kind = row.kind as Kind;
        const a = VERIFY[kind] as unknown as (typeof VERIFY)["drill"];
        const content = payload.content as never;
        const { context, items } = a.items(content);
        const bad = disputedIds(
          items,
          await blindSolve({ topic: "", nodeLabel: "", context, items }),
        );
        if (!bad.length) continue;
        const kept = a.drop(content, bad);
        if (a.items(kept).items.length >= a.min(kept) && kind !== "trace") {
          report.push(`${kind} ${row.key.slice(0, 10)}: ${bad.length} item(s) dropped`);
          await write(row.key, { ...payload, content: kept });
        } else {
          report.push(
            `${kind} ${row.key.slice(0, 10)}: row deleted (${bad.length} disputed)`,
          );
          await drop(row.key);
        }
      } catch (err) {
        report.push(
          `${row.kind} ${row.key.slice(0, 10)}: skipped (${String(err).slice(0, 80)})`,
        );
      }
    }
    mkdirSync("scratch", { recursive: true });
    writeFileSync(
      "scratch/verify-backfill.txt",
      `${apply ? "APPLIED" : "DRY RUN"} over ${rows?.length ?? 0} rows\n${report.join("\n") || "nothing disputed"}\n`,
    );
  });
});
