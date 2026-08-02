import { describe, expect, it } from "vitest";
import { contentKey } from "@/lib/server/contentCache";
import { resolveJob } from "@/lib/server/job";

// The cache key is the whole mechanism: a warm and the click that follows it
// must hash to the same row, and two genuinely different requests must not.

describe("contentKey", () => {
  it("ignores property order", () => {
    const a = contentKey("consume", {
      topic: "Fourier analysis",
      nodeLabel: "Convolution",
      interests: "audio",
    });
    const b = contentKey("consume", {
      interests: "audio",
      nodeLabel: "Convolution",
      topic: "Fourier analysis",
    });
    expect(a).toBe(b);
  });

  it("ignores undefined-valued keys, so an omitted field matches an empty one", () => {
    const a = contentKey("curriculum", { topic: "Rust", outline: undefined });
    const b = contentKey("curriculum", { topic: "Rust" });
    expect(a).toBe(b);
  });

  it("separates kinds sharing identical params", () => {
    const params = { topic: "Rust", nodeLabel: "Borrowing", interests: "" };
    expect(contentKey("consume", params)).not.toBe(
      contentKey("socratic", params),
    );
  });

  it("separates learners whose interests differ — content is personalized", () => {
    const base = { topic: "Rust", nodeLabel: "Borrowing" };
    expect(contentKey("consume", { ...base, interests: "game dev" })).not.toBe(
      contentKey("consume", { ...base, interests: "web servers" }),
    );
  });

  it("keys nested lists by content, not identity", () => {
    const a = contentKey("connect", {
      topic: "Rust",
      pool: [{ id: "n1", label: "Ownership" }],
    });
    const b = contentKey("connect", {
      topic: "Rust",
      pool: [{ label: "Ownership", id: "n1" }],
    });
    expect(a).toBe(b);
  });

  it("distinguishes a different pool — the content references it", () => {
    const a = contentKey("connect", { pool: [{ id: "n1", label: "Ownership" }] });
    const b = contentKey("connect", { pool: [{ id: "n2", label: "Lifetimes" }] });
    expect(a).not.toBe(b);
  });
});

// The server-side warm behind a finished build generates the frontier's
// Consume and Socratic passes before the learner clicks anything. It only pays
// off if it writes the row the learner's own request will later read — a key
// derived a second way is a silent cache miss and a doubled charge, which is
// exactly the failure AGENTS.md warns about.
describe("the curriculum warm addresses the learner's own rows", () => {
  // What the browser sends on a real click (AtlasApp's consumeParams /
  // socraticParams), untrimmed topic and all.
  const clientConsume = {
    kind: "consume" as const,
    topic: "  Rust  ",
    nodeLabel: "Ownership",
    prereqLabels: ["Stack And Heap", "Bindings"],
    interests: "game dev",
    language: "en" as const,
  };

  // What route.ts's startCurriculumWarm sends, built from the graph rather
  // than from client state — note it also carries nodeId, which the client's
  // consume request does not.
  const warmConsume = {
    ...clientConsume,
    topic: "Rust",
    nodeId: "ownership",
  };

  it("matches for consume, including the prerequisite label list", () => {
    expect(resolveJob(warmConsume).key).toBe(resolveJob(clientConsume).key);
  });

  it("matches for socratic, where the warm passes an unused nodeId", () => {
    const client = {
      kind: "socratic" as const,
      topic: "Rust",
      nodeLabel: "Ownership",
      interests: "game dev",
      language: "en" as const,
    };
    expect(resolveJob({ ...client, nodeId: "ownership" }).key).toBe(
      resolveJob(client).key,
    );
  });

  it("still separates nodes — a warm for one node is not a hit for another", () => {
    expect(resolveJob(warmConsume).key).not.toBe(
      resolveJob({ ...warmConsume, nodeLabel: "Lifetimes" }).key,
    );
  });

  it("separates prerequisite lists — they ground the prompt", () => {
    expect(resolveJob(warmConsume).key).not.toBe(
      resolveJob({ ...warmConsume, prereqLabels: ["Bindings"] }).key,
    );
  });
});
