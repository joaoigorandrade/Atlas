// Content a topic owns outlives the shared cache (`docs/CONTENT-STORAGE.md`).
//
// `node_content` holds a pointer into `content_cache`, and two things delete
// what it points at: the TTL prune and a `CONTENT_CACHE_VERSION` bump, which
// abandons every shared row on purpose. Both used to empty the topic silently
// — the route dropped the dangling pointer, the client called that a miss, and
// the learner paid to generate a reading they already owned.
//
// The other half is onboarding's undo: creating a topic is an upsert on
// `(user_id, subject)`, so a second run on the same subject hands back the
// learner's existing topic. Deleting *that* cascades their map, cards and
// every payload away.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ------------------------------------------------- the read, pointer or copy --

const rows = vi.hoisted(() => ({ current: [] as unknown[] }));
const shared = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/lib/server/v1", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/v1")>()),
  caller: async () => ({ db: {}, userId: "u1", requestId: "req" }),
  isResponse: () => false,
}));

vi.mock("@/lib/server/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/store")>()),
  ownsTopic: async () => true,
  readContentRows: async () => rows.current,
}));

vi.mock("@/lib/server/contentCache", () => ({
  readManyContent: async () => shared.current,
}));

const read = async (): Promise<{
  items: Array<{ nodeId: string; payload: unknown }>;
}> => {
  const { GET } = await import("@/app/api/v1/topics/[id]/content/route");
  const res = await GET(new Request("http://localhost/api/v1/topics/t1/content"), {
    params: Promise.resolve({ id: "t1" }),
  });
  return res.json();
};

const row = (over: Record<string, unknown> = {}) => ({
  nodeId: "lat",
  kind: "consume",
  variant: "",
  cacheKey: "k1",
  payload: null,
  ...over,
});

const section = { id: "c1", kicker: "1 · O que é", body: ["…"], takeaway: "t" };

describe("a topic's content survives the shared cache", () => {
  beforeEach(() => {
    rows.current = [];
    shared.current = {};
  });

  it("serves the shared row when the pointer still resolves", async () => {
    rows.current = [row()];
    shared.current = { k1: { chunks: [section] } };
    const { items } = await read();
    // Unwrapped to the render shape, exactly as a live stream delivers it.
    expect(items).toEqual([
      { nodeId: "lat", kind: "consume", variant: "", payload: [section] },
    ]);
  });

  it("falls back to the row's own copy when the shared row is gone", async () => {
    // A CONTENT_CACHE_VERSION bump, or a TTL prune that reached a row a topic
    // still points at. The pointer is live and resolves to nothing.
    rows.current = [row({ payload: { chunks: [section] } })];
    shared.current = {};
    const { items } = await read();
    expect(items[0].payload).toEqual([section]);
  });

  it("is still a miss when neither side has anything", async () => {
    // Dropping it here is what makes the client generate rather than render
    // an empty pass.
    rows.current = [row()];
    const { items } = await read();
    expect(items).toEqual([]);
  });
});

// ------------------------------------------------------- onboarding's undo --

const created = vi.hoisted(() => ({ topic: { id: "t1", created: true } }));
const deleted = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("@/lib/persistence", () => ({
  createTopic: async () => created.topic,
  deleteTopic: async (id: string) => {
    deleted.ids.push(id);
  },
}));

const form = {
  topic: "Kalman Filters",
  goal: "mastery" as const,
  interests: "",
  paretoPct: 20,
  examDate: "",
  target: 15,
};

describe("abandoning a build", () => {
  beforeEach(() => {
    deleted.ids = [];
  });

  it("deletes the topic it created", async () => {
    created.topic = { id: "t-new", created: true };
    const { openTopic } = await import("@/components/atlas/topicLifecycle");
    const { abandon } = await openTopic(form, "en", () => {});
    abandon();
    expect(deleted.ids).toEqual(["t-new"]);
  });

  it("leaves the learner's existing map of the same subject alone", async () => {
    // The upsert handed back a topic that already had a map, mastery states
    // and a card deck. A build that then failed used to cascade all of it away.
    created.topic = { id: "t-theirs", created: false };
    const { openTopic } = await import("@/components/atlas/topicLifecycle");
    const { abandon } = await openTopic(form, "en", () => {});
    abandon();
    expect(deleted.ids).toEqual([]);
  });
});
