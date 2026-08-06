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

/** The same chain, written the way the *streamed* map prompt asks for it: one
 *  top-level object per concept, in prerequisite order, each naming the ids
 *  already written above it. Deliberately the same graph as `graphObj`, so the
 *  streamed payload and the single-shot payload can be compared directly. */
const conceptObjs = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`,
  label: `Concept ${i}`,
  prereqs: i === 0 ? [] : [`n${i - 1}`],
}));

const scopeObj = {
  tooBroad: true,
  scopes: [
    { label: "Ownership And Borrowing", note: "the memory model on its own" },
    { label: "Async Rust", note: "futures, executors, pinning" },
  ],
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

/** Set to make the map answer "too broad" (#30) on both paths. */
let tooBroad = false;

/** Set to write each object across several deltas, the way a real model does —
 *  which is what gives the token-by-token layer anything to redraw. */
let splitDeltas = false;

const isJudge = (prompt: string) => prompt.includes("You judge a learner's answer");
const isPassage = (prompt: string) => prompt.includes("They highlighted a passage");

/** The "ask about this" answer, one top-level object per paragraph. */
const passageObjs = [
  { p: "The sentence you highlighted is doing one job." },
  { p: "Here is the mechanism behind it, concretely." },
];

/** Which sequence of top-level objects a given prompt is asking for. */
function objectsFor(prompt: string): unknown[] {
  if (prompt.includes("Socratic questioning session")) return [0, 1, 2, 3].map(socraticStep);
  if (prompt.includes("Feynman teach-back")) return [0, 1, 2, 3].map(feynmanBeat);
  // Only the streamed map prompt asks for concepts in prerequisite order; the
  // single-shot one asks for one wrapping {nodes, edges} object.
  if (prompt.includes("prerequisite order:")) return tooBroad ? [scopeObj] : conceptObjs;
  if (isJudge(prompt))
    return [{ quality: "near" }, { quality: "near", response: "the streamed critique" }];
  if (isPassage(prompt)) return passageObjs;
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
    // the only path `generateDiagnosticQuestion` ever takes, since it doesn't
    // stream. `generateMap` reaches it as `generateMapStream`'s fallback.
    if (!parsed.stream) {
      const wrapped = isJudge(prompt)
        ? { quality: "near", response: "the retried critique" }
        : isPassage(prompt)
        ? { answer: ["the retried answer"] }
        : prompt.includes("Socratic")
        ? { steps: objects }
        : prompt.includes("Feynman")
          ? { beats: objects }
          : prompt.includes("prerequisite concept map")
            ? (tooBroad ? scopeObj : graphObj)
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
    const delta = (content: string) =>
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      );
    for (const obj of written) {
      const text = JSON.stringify(obj);
      if (!splitDeltas) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        delta(text);
        continue;
      }
      // Thirds of one object, far enough apart that each redraw clears the
      // partial-frame throttle.
      const step = Math.ceil(text.length / 3);
      for (let i = 0; i < text.length; i += step) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        delta(text.slice(i, i + step));
      }
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
async function drain(
  gen: AsyncGenerator<{ p: string; i?: number; v: unknown; partial?: true }>,
) {
  const started = Date.now();
  const frames: Array<{
    p: string;
    i?: number;
    v: unknown;
    partial?: true;
    at: number;
  }> = [];
  for await (const f of gen) frames.push({ ...f, at: Date.now() - started });
  return frames;
}

describe("curriculum map + adaptive placement, split prompts", () => {
  it("generates the map on its own — no bundled diagnostic", async () => {
    const { generateMap } = await import("@/lib/server/generate");
    const result = await generateMap({ topic: "Rust", goal: "mastery" });

    if ("scopes" in result) throw new Error("expected a map, not scope offers");
    // Layout is computed server-side, never trusted from the model.
    expect(result.nodes).toHaveLength(12);
    expect(result.nodes[0].state).toBe("unknown");
    expect(typeof result.nodes[0].x).toBe("number");
    // Edges travel on the nodes, so a partial list is still a real graph.
    expect(result.nodes[0].prereqs).toEqual([]);
    expect(result.nodes[1].prereqs).toEqual(["n0"]);
    expect("diagnostic" in result).toBe(false);
  });

  it("asks one objective placement question at the requested difficulty", async () => {
    const { generateMap, generateDiagnosticQuestion } = await import("@/lib/server/generate");
    const map = await generateMap({ topic: "Rust", goal: "mastery" });
    if ("scopes" in map) throw new Error("expected a map, not scope offers");

    const question = await generateDiagnosticQuestion({
      topic: "Rust",
      goal: "mastery",
      interests: "",
      nodeCandidates: map.nodes.map((n) => ({ id: n.id, label: n.label })),
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

  it("streams the map a concept at a time, then settles the layout", async () => {
    const { generateMapStream } = await import("@/lib/server/generate");
    const frames = await drain(generateMapStream({ topic: "Rust", goal: "mastery" }));

    const nodes = frames.filter((f) => f.p === "nodes");
    // 12 as written, then 12 again in the settling pass that re-centres each
    // column now its height is known — same slots, so assembly folds them.
    expect(nodes).toHaveLength(24);
    expect(nodes.slice(0, 12).map((f) => f.i)).toEqual([...Array(12).keys()]);
    expect(nodes.slice(12).map((f) => f.i)).toEqual([...Array(12).keys()]);

    // The whole claim: the first concept is on screen long before the last is
    // written, rather than the map landing in one piece at the end.
    expect(nodes[0].at).toBeLessThan(nodes[11].at / 2);

    // Layout is the server's, and a node arrives already placed.
    const first = nodes[0].v as { id: string; x: number; g: number; prereqs: string[] };
    expect(first.id).toBe("n0");
    expect(first.g).toBe(1);
    expect(typeof first.x).toBe("number");
    expect(first.prereqs).toEqual([]);
  });

  it("assembles into exactly what the single-shot pass would have returned", async () => {
    // The round-trip that makes streaming safe to cache: /api/generate writes
    // the assembled payload under the job's normal key, so a streamed map and
    // a generated-in-one-piece map must be indistinguishable to `content_cache`.
    const { generateMap, generateMapStream } = await import("@/lib/server/generate");
    const { framesToPayload } = await import("@/lib/server/stream");
    const { resolveJob } = await import("@/lib/server/job");

    const shape = resolveJob({ kind: "curriculum", topic: "Rust", goal: "mastery" }).shape!;
    const frames = await drain(generateMapStream({ topic: "Rust", goal: "mastery" }));
    const assembled = framesToPayload(
      frames.map(({ p, i, v }) => (i === undefined ? { p, v } : { p, i, v })),
      shape,
    );

    expect(assembled).toEqual(await generateMap({ topic: "Rust", goal: "mastery" }));
  });

  it("streams scope offers for a too-broad topic, and nothing else (#30)", async () => {
    const { generateMapStream } = await import("@/lib/server/generate");
    tooBroad = true;
    try {
      const frames = await drain(generateMapStream({ topic: "Science", goal: "mastery" }));
      expect(frames.map((f) => f.p)).toEqual(["scopes", "scopes"]);
      expect((frames[0].v as { label: string }).label).toBe("Ownership And Borrowing");
    } finally {
      tooBroad = false;
    }
  });

  it("falls back to the single-shot map when its stream is unusable", async () => {
    const { generateMapStream } = await import("@/lib/server/generate");
    breakStream = true;
    try {
      const frames = await drain(generateMapStream({ topic: "Rust", goal: "mastery" }));
      // The learner still gets a complete map — it just arrives at once, from
      // the retried path, instead of concept by concept.
      expect(frames).toHaveLength(12);
      expect(frames.map((f) => f.i)).toEqual([...Array(12).keys()]);
    } finally {
      breakStream = false;
    }
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

// ---- "ask about this": the learner's own question about a passage ----------

describe("passage answers", () => {
  const params = {
    topic: "Rust",
    nodeLabel: "Ownership",
    kicker: "3 · Where it breaks",
    section: "A value has exactly one owner. When the owner goes out of scope, the value is dropped.",
    selection: "the value is dropped",
    question: "Dropped where — does it go on a free list?",
  };

  it("streams the answer a paragraph at a time", async () => {
    const { generatePassageStream } = await import("@/lib/server/generate");
    const frames = await drain(generatePassageStream(params));

    expect(frames.map((f) => f.p)).toEqual(["answer", "answer"]);
    expect(frames.map((f) => f.i)).toEqual([0, 1]);
    expect(frames[0].v).toBe(passageObjs[0].p);
    // The whole claim of streaming this: the first paragraph is readable well
    // before the last one has been written.
    expect(frames[0].at).toBeLessThan(frames[1].at - DELAY_MS / 2);
  });

  it("paints each paragraph as it is written, without corrupting the payload", async () => {
    const { generatePassageStream } = await import("@/lib/server/generate");
    const { framesToPayload } = await import("@/lib/server/stream");
    splitDeltas = true;
    try {
      const frames = await drain(generatePassageStream(params));
      const drafts = frames.filter((f) => f.partial);
      const complete = frames.filter((f) => !f.partial);

      // Redraws of paragraph 0 arrive before paragraph 0 is finished, and each
      // one is a prefix of it — the learner reads it as it is typed.
      expect(drafts.length).toBeGreaterThan(0);
      const first = drafts.filter((f) => f.i === 0);
      expect(first[0].at).toBeLessThan(complete[0].at);
      for (const d of first) expect(passageObjs[0].p.startsWith(d.v as string)).toBe(true);

      // …and the assembled payload is still only the complete paragraphs.
      expect(
        framesToPayload(
          frames.map(({ p, i, v, partial }) => ({ p, i: i!, v, partial })),
          { answer: { min: 1, max: 4 } },
        ),
      ).toEqual({ answer: passageObjs.map((o) => o.p) });
    } finally {
      splitDeltas = false;
    }
  });

  it("assembles into exactly what the single-shot path returns", async () => {
    const { generatePassageStream } = await import("@/lib/server/generate");
    const { framesToPayload } = await import("@/lib/server/stream");
    const frames = await drain(generatePassageStream(params));

    expect(
      framesToPayload(
        frames.map(({ p, i, v }) => ({ p, i: i!, v })),
        { answer: { min: 1, max: 4 } },
      ),
    ).toEqual({ answer: passageObjs.map((o) => o.p) });
  });

  it("falls back to the retried single-shot path when the stream is junk", async () => {
    const { generatePassageStream } = await import("@/lib/server/generate");
    breakStream = true;
    try {
      const frames = await drain(generatePassageStream(params));
      expect(frames.map((f) => f.v)).toEqual(["the retried answer"]);
    } finally {
      breakStream = false;
    }
  });

  it("recovers from an empty completion instead of answering nothing", async () => {
    const { generatePassageStream } = await import("@/lib/server/generate");
    emptyStream = true;
    try {
      // A stream that finishes having written nothing is indistinguishable
      // from "nothing usable happened yet", so it takes the same fallback a
      // malformed one does — the learner gets an answer either way.
      const frames = await drain(generatePassageStream(params));
      expect(frames).toHaveLength(1);
      expect(frames[0].v).toBe("the retried answer");
    } finally {
      emptyStream = false;
    }
  });
});
