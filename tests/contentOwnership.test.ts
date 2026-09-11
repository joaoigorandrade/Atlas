// A cache hit is content the learner now has — so the topic has to own it.
//
// `/api/generate`'s fast path has always recorded a hit against the topic. The
// batch warm (`/api/content`) is where most hits actually happen — one request
// fills the whole neighbourhood on map open — and it recorded nothing. The
// content existed only in that browser's memory, so the next load found no
// `node_content` row and regenerated it the moment the cache key had moved on:
// Connect's pool and Crucible's mastered set both move as the learner works.

import { beforeEach, describe, expect, it, vi } from "vitest";

const recorded = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const shared = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
  }),
}));

vi.mock("@/lib/server/afterBuild", () => ({
  recordContent: (
    _db: unknown,
    body: Record<string, unknown>,
    job: { kind: string },
    userId: string,
    payload: unknown,
  ) => {
    recorded.calls.push({ topicId: body.topicId, kind: job.kind, userId, payload });
  },
}));

vi.mock("@/lib/server/contentCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/contentCache")>()),
  readManyContent: async () => shared.current,
}));

const consume = {
  kind: "consume",
  topic: "Kalman Filters",
  nodeId: "lat",
  nodeLabel: "Latent state",
  prereqLabels: [],
  interests: "",
  language: "en",
  topicId: "t1",
};

const post = async (items: unknown[]) => {
  const { POST } = await import("@/app/api/content/route");
  const res = await POST(
    new Request("http://localhost/api/content", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  );
  return res.json() as Promise<{ hits: Record<number, unknown> }>;
};

describe("the batch warm", () => {
  beforeEach(async () => {
    recorded.calls = [];
    const { resolveJob } = await import("@/lib/server/job");
    shared.current = { [resolveJob(consume as never).key!]: { chunks: [{ id: "c1" }] } };
  });

  it("records a hit against the topic that asked for it", async () => {
    const { hits } = await post([consume]);
    expect(hits[0]).toEqual({ chunks: [{ id: "c1" }] });
    expect(recorded.calls).toEqual([
      {
        topicId: "t1",
        kind: "consume",
        userId: "u1",
        payload: { chunks: [{ id: "c1" }] },
      },
    ]);
  });

  it("records nothing for a miss", async () => {
    shared.current = {};
    const { hits } = await post([consume]);
    expect(hits).toEqual({});
    expect(recorded.calls).toEqual([]);
  });
});

// ----------------------------------------------- the client stamps the batch --

describe("fetchCachedContent", () => {
  it("stamps every item with the open topic", async () => {
    // Without this the route has nowhere to file what it found: `topicId` is
    // ambient (`lib/generationTopic.ts`) and was only ever applied by `post`.
    const { setGenerationTopic } = await import("@/lib/generationTopic");
    setGenerationTopic("t-open");
    let sent: { items: Array<Record<string, unknown>> } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent = JSON.parse(init.body);
        return { ok: true, json: async () => ({ hits: {} }) };
      }),
    );
    const { fetchCachedContent } = await import("@/lib/api");
    await fetchCachedContent([{ kind: "consume" }]);
    expect(sent!.items[0]).toEqual({ kind: "consume", topicId: "t-open" });
    setGenerationTopic(null);
    vi.unstubAllGlobals();
  });
});
