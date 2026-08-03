import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// End-to-end over the server half of progressive delivery: prompt → SSE →
// brace-counting parser → per-item validator → frames → assembled payload.
//
// A stub OpenRouter stands in for the real one (via the OPENROUTER_BASE_URL
// override the client already supports), emitting one top-level JSON object at
// a time with a delay between them. That delay is the point: it lets us assert
// that the first item reaches the caller long before the last one is written,
// which is the entire claim these streams make.

const DELAY_MS = 40;

const graphObj = {
  nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, label: `Concept ${i}` })),
  edges: Array.from({ length: 11 }, (_, i) => [`n${i}`, `n${i + 1}`]),
};

const diagnosticQuestionObj = {
  nodeId: "n3",
  q: "What binds to what?",
  note: "what this changes",
  opts: ["A", "B", "C", "D"],
  correctIndex: 2,
  gapLabel: "Gap 3",
  gapReason: "you missed the binding rule",
};

const socraticStep = (i: number) => ({
  move: ["Clarify", "Challenge the assumption", "Probe the reasoning", "Probe the implications"][i],
  prompt: `Probe ${i + 1}`,
  // Concrete answers, not descriptions of answers: `rejectEcho` fails any
  // label that quotes the prompt template back, and it is right to.
  replies: [
    { label: "One binding owns the value at a time", quality: "correct", response: "yes" },
    { label: "Every binding gets its own copy", quality: "wrong", response: "caught" },
    { label: "Something about scope ending", quality: "near", response: "hint" },
  ],
  hint: "a nudge",
  tell: "the direct instruction",
});

const feynmanBeat = (i: number) => ({
  subPoint: `sub point ${i + 1}`,
  transcript: "I would say this",
  interjection: "but why?",
  replies: [
    { label: "The value drops when its owner leaves scope", verdict: "good", response: "ok" },
    { label: "The compiler handles it for you", verdict: "skipped", response: "still lost" },
    { label: "Both bindings stay valid afterwards", verdict: "confused", response: "contradiction" },
  ],
  fix: {
    probe: "fix probe",
    replies: [
      { label: "right", correct: true, response: "yes" },
      { label: "wrong", correct: false, response: "no" },
    ],
  },
  gapLabel: `gap ${i + 1}`,
  gapReason: "you taught X as Y",
});

/** Set to make the *streamed* branch emit junk, so the generator has to fall
 *  back to its single-shot, retried path. */
let breakStream = false;

/** Set to make the streamed branch finish cleanly having written nothing —
 *  what an "empty completion" from the provider looks like on the wire. */
let emptyStream = false;

/** Set to make a judge stream stop after its verdict object, leaving the
 *  critique to the single-shot fallback. */
let truncateJudge = false;

const isJudge = (prompt: string) => prompt.includes("You judge a learner's answer");

/** Which sequence of top-level objects a given prompt is asking for. */
function objectsFor(prompt: string): unknown[] {
  if (prompt.includes("Socratic questioning session")) return [0, 1, 2, 3].map(socraticStep);
  if (prompt.includes("Feynman teach-back")) return [0, 1, 2, 3].map(feynmanBeat);
  if (isJudge(prompt))
    return [{ quality: "near" }, { quality: "near", response: "the streamed critique" }];
  return [{}];
}

let server: Server;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const parsed = JSON.parse(body || "{}") as {
      stream?: boolean;
      messages?: Array<{ content: string }>;
    };
    const prompt = (parsed.messages ?? []).map((m) => m.content).join("\n");
    const objects = objectsFor(prompt);

    // The single-shot fallback path every streaming generator drops to — and
    // the only path `generateMap`/`generateDiagnosticQuestion` ever take,
    // since neither streams.
    if (!parsed.stream) {
      const wrapped = isJudge(prompt)
        ? { quality: "near", response: "the retried critique" }
        : prompt.includes("Socratic")
        ? { steps: objects }
        : prompt.includes("Feynman")
          ? { beats: objects }
          : prompt.includes("prerequisite concept map")
            ? graphObj
            : prompt.includes("Write ONE placement question")
              ? diagnosticQuestionObj
              : objects[0];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(wrapped) } }] }),
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const written = emptyStream
      ? []
      : breakStream
        ? [{ nonsense: true }]
        : truncateJudge && isJudge(prompt)
          ? objects.slice(0, 1)
          : objects;
    for (const obj of written) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(obj) } }] })}\n\n`,
      );
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.OPENROUTER_API_KEY = "stub";
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** Collect frames, recording how long after the start each one arrived. */
async function drain(gen: AsyncGenerator<{ p: string; i?: number; v: unknown }>) {
  const started = Date.now();
  const frames: Array<{ p: string; i?: number; v: unknown; at: number }> = [];
  for await (const f of gen) frames.push({ ...f, at: Date.now() - started });
  return frames;
}

describe("curriculum map + adaptive placement, split prompts", () => {
  it("generates the map on its own — no bundled diagnostic", async () => {
    const { generateMap } = await import("@/lib/server/generate");
    const result = await generateMap({ topic: "Rust", goal: "mastery", interests: "" });

    if ("scopes" in result) throw new Error("expected a graph, not scope offers");
    // Layout is computed server-side, never trusted from the model.
    expect(result.graph.nodes).toHaveLength(12);
    expect(result.graph.nodes[0].state).toBe("unknown");
    expect(typeof result.graph.nodes[0].x).toBe("number");
    expect("diagnostic" in result).toBe(false);
  });

  it("asks one objective placement question at the requested difficulty", async () => {
    const { generateMap, generateDiagnosticQuestion } = await import("@/lib/server/generate");
    const map = await generateMap({ topic: "Rust", goal: "mastery", interests: "" });
    if ("scopes" in map) throw new Error("expected a graph, not scope offers");

    const question = await generateDiagnosticQuestion({
      topic: "Rust",
      goal: "mastery",
      interests: "",
      nodeCandidates: map.graph.nodes.map((n) => ({ id: n.id, label: n.label })),
      difficulty: "medium",
      index: 0,
    });

    // "Question 1 of 5" is pinned to DIAGNOSTIC_COUNT, not to how many
    // questions this placement has asked so far.
    expect(question.tag).toBe("Question 1 of 5");
    expect(question.difficulty).toBe("medium");
    expect(question.nodeId).toBe("n3");
    expect(question.opts).toHaveLength(4);
    expect(question.correctIndex).toBe(2);
    expect(question.gap).toEqual({
      id: "gap-diag-n3",
      label: "Gap 3",
      reason: "you missed the binding rule",
      dx: -85,
      dy: 148,
    });
  });

  it("falls back to the single-shot path when the stream is unusable", async () => {
    const { generateSocraticStream } = await import("@/lib/server/generate");
    breakStream = true;
    try {
      const frames = await drain(
        generateSocraticStream({ topic: "Rust", nodeLabel: "Ownership", interests: "" }),
      );
      // The learner still gets a complete pass — it just arrives all at once,
      // from the retried path, instead of item by item.
      expect(frames).toHaveLength(4);
      expect(frames.map((f) => f.i)).toEqual([0, 1, 2, 3]);
    } finally {
      breakStream = false;
    }
  });

  it("falls back when the stream ends cleanly having written nothing", async () => {
    // The real failure the audit caught: an empty completion ends the stream
    // without throwing, so `yielded` stayed 0, no fallback fired, and the
    // route answered 502 while the documented safety net looked fine.
    const { generateSocraticStream } = await import("@/lib/server/generate");
    emptyStream = true;
    try {
      const frames = await drain(
        generateSocraticStream({ topic: "Rust", nodeLabel: "Ownership", interests: "" }),
      );
      expect(frames).toHaveLength(4);
    } finally {
      emptyStream = false;
    }
  });

  it("streams the judge's verdict ahead of its critique", async () => {
    const { judgeSocraticStream } = await import("@/lib/server/generate");
    const frames = await drain(
      judgeSocraticStream({
        topic: "Rust",
        nodeLabel: "Ownership",
        question: "why?",
        reference: "because",
        answer: "the owner drops it",
      }),
    );
    expect(frames).toHaveLength(2);
    expect(frames.every((f) => f.p === "judgement")).toBe(true);
    // Frame 1 unblocks the screen; frame 2 fills in the wording.
    expect(frames[0].v).toEqual({ quality: "near" });
    expect(frames[1].v).toEqual({ quality: "near", response: "the streamed critique" });
    expect(frames[0].at).toBeLessThan(frames[1].at);
  });

  it("still delivers a critique when the judge stream dies after the verdict", async () => {
    const { judgeSocraticStream } = await import("@/lib/server/generate");
    truncateJudge = true;
    try {
      const frames = await drain(
        judgeSocraticStream({
          topic: "Rust",
          nodeLabel: "Ownership",
          question: "why?",
          reference: "because",
          answer: "the owner drops it",
        }),
      );
      // The verdict streamed; the critique came off the retried single-shot
      // path, which is the corrective retry the judge is not allowed to lose.
      expect(frames).toHaveLength(2);
      expect(frames[1].v).toEqual({ quality: "near", response: "the retried critique" });
    } finally {
      truncateJudge = false;
    }
  });

  it("ships the first Socratic probe before the last is written", async () => {
    const { generateSocraticStream } = await import("@/lib/server/generate");
    const frames = await drain(
      generateSocraticStream({ topic: "Rust", nodeLabel: "Ownership", interests: "" }),
    );
    expect(frames).toHaveLength(4);
    expect(frames.every((f) => f.p === "steps")).toBe(true);
    expect(frames.map((f) => f.i)).toEqual([0, 1, 2, 3]);
    expect(frames[0].at).toBeLessThan(frames[3].at);
  });

  it("ships the first Feynman beat before the last, with its own gap offsets", async () => {
    const { generateFeynmanStream } = await import("@/lib/server/generate");
    const frames = await drain(
      generateFeynmanStream({
        topic: "Rust",
        nodeId: "ownership",
        nodeLabel: "Ownership",
        interests: "",
      }),
    );
    expect(frames).toHaveLength(4);
    expect(frames.map((f) => f.i)).toEqual([0, 1, 2, 3]);
    expect(frames[0].at).toBeLessThan(frames[3].at);

    // Ids and gap offsets are assigned server-side per index, so a beat
    // validated alone is identical to one validated inside an array.
    const beats = frames.map((f) => f.v as { id: string; gap: { dx: number; dy: number } });
    expect(beats.map((b) => b.id)).toEqual([
      "ft-ownership-1",
      "ft-ownership-2",
      "ft-ownership-3",
      "ft-ownership-4",
    ]);
    expect(new Set(beats.map((b) => `${b.gap.dx},${b.gap.dy}`)).size).toBe(4);
  });
});
