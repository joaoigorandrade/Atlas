// W1.2 / W1.4: which time through a node's Crucible or Perform this is comes
// from the attempts log, stamped by the server — no client carries a counter.
import { beforeEach, describe, expect, it } from "vitest";
import { fixtureSupabase } from "@/lib/server/fixtures";
import { resetTables, seedTable } from "@/lib/server/fixtureTables";
import { withNodeCell } from "@/lib/server/store/nodes";

const db = fixtureSupabase() as never;
const body = (kind: string) =>
  ({ kind, topic: "T", topicId: "t", nodeId: "n", nodeLabel: "N", rerun: 7 }) as never;

beforeEach(() => {
  resetTables();
  seedTable("nodes", [
    { topic_id: "t", id: "n", importance: "core", difficulty: "medium" },
  ]);
});

describe("rerun is stamped from the attempts log", () => {
  it("drops a client's copy and omits it before any attempt", async () => {
    const out = (await withNodeCell(db, body("crucible"))) as { rerun?: number };
    expect(out.rerun).toBeUndefined();
  });
  it("counts Crucible passes only, and every Perform run", async () => {
    seedTable("phase_attempts", [
      { topic_id: "t", node_id: "n", phase: "crucible", passed: false },
      { topic_id: "t", node_id: "n", phase: "crucible", passed: true },
      { topic_id: "t", node_id: "n", phase: "perform", passed: false },
      { topic_id: "t", node_id: "n", phase: "perform", passed: true },
    ]);
    expect(((await withNodeCell(db, body("crucible"))) as { rerun?: number }).rerun).toBe(
      1,
    );
    expect(((await withNodeCell(db, body("perform"))) as { rerun?: number }).rerun).toBe(
      2,
    );
    expect(
      ((await withNodeCell(db, body("drill"))) as { rerun?: number }).rerun,
    ).toBeUndefined();
  });
});
