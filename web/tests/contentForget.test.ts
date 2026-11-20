// Deleting a map forgets the shared rows it generated.
//
// Without this, rebuilding the same subject addressed the same `content_cache`
// rows and replayed the cases and rubrics the learner had already seen
// answered. The one row that must survive is one another topic holds only as a
// pointer — deleting it would empty that topic's screen.

import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USER_ID, fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables, seedTable, seededTables } from "@/lib/server/fixtureTables";
import { forgetContent } from "@/lib/server/contentCache";
import { createTopic, deleteTopic, putContent, topicCacheKeys } from "@/lib/server/store";

const db = () => fixtureSupabase() as unknown as SupabaseClient;
const cached = () => (seededTables.get("content_cache") ?? []).map((r) => r.key).sort();

beforeEach(resetTables);

describe("deleting a map", () => {
  it("forgets the shared rows it pointed at, read before the cascade", async () => {
    const topic = await createTopic(db(), FIXTURE_USER_ID, { subject: "Optics" });
    const other = await createTopic(db(), FIXTURE_USER_ID, { subject: "Acoustics" });
    seedTable("content_cache", [
      { key: "k-consume", kind: "consume", payload: {} },
      { key: "k-drill", kind: "drill", payload: {} },
      { key: "k-other", kind: "consume", payload: {} },
    ]);
    const at = (nodeId: string, kind: string) => ({ nodeId, kind });
    await putContent(db(), FIXTURE_USER_ID, topic.id, at("a", "consume"), {
      cacheKey: "k-consume",
      payload: { chunks: [] },
    });
    await putContent(db(), FIXTURE_USER_ID, topic.id, at("a", "drill"), {
      cacheKey: "k-drill",
      payload: { content: {} },
    });
    await putContent(db(), FIXTURE_USER_ID, other.id, at("x", "consume"), {
      cacheKey: "k-other",
      payload: { chunks: [] },
    });

    const keys = await topicCacheKeys(db(), topic.id);
    expect(keys.sort()).toEqual(["k-consume", "k-drill"]);
    await deleteTopic(db(), topic.id);
    expect(await forgetContent(keys, topic.id, db())).toBe(2);
    expect(cached()).toEqual(["k-other"]);
  });

  it("keeps a row another map holds only as a pointer", async () => {
    const topic = await createTopic(db(), FIXTURE_USER_ID, { subject: "Optics" });
    const other = await createTopic(db(), FIXTURE_USER_ID, { subject: "Lenses" });
    seedTable("content_cache", [
      { key: "shared", kind: "consume", payload: {} },
      { key: "copied", kind: "drill", payload: {} },
    ]);
    const at = (kind: string) => ({ nodeId: "a", kind });
    for (const [key, kind] of [
      ["shared", "consume"],
      ["copied", "drill"],
    ])
      await putContent(db(), FIXTURE_USER_ID, topic.id, at(kind), {
        cacheKey: key,
        payload: {},
      });
    // The other map points at both, but kept its own bytes for only one.
    await putContent(db(), FIXTURE_USER_ID, other.id, at("consume"), {
      cacheKey: "shared",
    });
    await putContent(db(), FIXTURE_USER_ID, other.id, at("drill"), {
      cacheKey: "copied",
      payload: {},
    });

    const keys = await topicCacheKeys(db(), topic.id);
    await deleteTopic(db(), topic.id);
    expect(await forgetContent(keys, topic.id, db())).toBe(1);
    expect(cached()).toEqual(["shared"]);
  });

  it("does nothing without a cache to reach", async () => {
    expect(await forgetContent(["k"], "t", null)).toBe(0);
    expect(await forgetContent([], "t", db())).toBe(0);
  });
});
