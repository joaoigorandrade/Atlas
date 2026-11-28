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
  nodes: Array.from({ length: 12 }, (_, i) => ({
    id: `n${i}`,
    label: `Concept ${i}`,
  })),
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
  move: [
    "Clarify",
    "Challenge the assumption",
    "Probe the reasoning",
    "Probe the implications",
  ][i],
  prompt: `Probe ${i + 1}`,
  // Concrete answers, not descriptions of answers: `rejectEcho` fails any
  // label that quotes the prompt template back, and it is right to.
  replies: [
    {
      label: "One binding owns the value at a time",
      quality: "correct",
      response: "yes",
    },
    {
      label: "Every binding gets its own copy",
      quality: "wrong",
      response: "caught",
    },
    {
      label: "Something about scope ending",
      quality: "near",
      response: "hint",
    },
  ],
  hint: "a nudge",
  tell: "the direct instruction",
});

const feynmanBeat = (i: number) => ({
  subPoint: `sub point ${i + 1}`,
  mustConvey: [
    "that the value drops when its owner leaves scope",
    "that the old binding stops being usable after a move",
  ],
  fix: {
    probe: "fix probe",
    replies: [
      { label: "right", correct: true, response: "yes" },
      { label: "wrong", correct: false, response: "no" },
    ],
  },
  gapLabel: `gap ${i + 1}`,
  gapReason: "the ownership-copy trap",
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
/** The model writing its last section twice over (seen in prod). */
let repeatSection = false;
let splitDeltas = false;

const isJudge = (prompt: string) => prompt.includes("You judge a learner's answer");
const isPassage = (prompt: string) => prompt.includes("They highlighted a passage");
const isConsume = (prompt: string) => prompt.includes("Write the Consume pass");

/** The "ask about this" answer, one top-level object per paragraph. */
const passageObjs = [
  { p: "The sentence you highlighted is doing one job." },
  { p: "Here is the mechanism behind it, concretely." },
];

/** Two reading sections, written the way the streamed Consume prompt asks: one
 *  top-level object each, every field a whole section must have. */
const consumeObjs = [0, 1].map((i) => ({
  kicker: `${i + 1} · What it is`,
  terms: [{ t: "owner", d: "the binding responsible for the value" }],
  body: [
    `Paragraph one of section ${i + 1}, long enough to be split across deltas.`,
    `Paragraph two of section ${i + 1}, which is where the mechanism lands.`,
  ],
  example: {
    title: "what this demonstrates",
    steps: ["step one with the work shown", "step two"],
  },
  takeaway: `The one line to carry out of section ${i + 1}.`,
  ask: "and what would happen if the owner outlived the value?",
  check: {
    q: `Which of these did section ${i + 1} actually say?`,
    opts: [
      { label: "the first plausible misreading", correct: false },
      { label: "what the section actually said", correct: true },
      { label: "the second plausible misreading", correct: false },
    ],
    right: "yes — that is the sentence.",
    wrong: "not quite — it was in the second paragraph.",
  },
}));

/** Which sequence of top-level objects a given prompt is asking for. */
function objectsFor(prompt: string): unknown[] {
  if (prompt.includes("Socratic questioning session"))
    return [0, 1, 2, 3].map(socraticStep);
  if (prompt.includes("Feynman teach-back")) return [0, 1, 2, 3].map(feynmanBeat);
  // Only the streamed map prompt asks for concepts in prerequisite order; the
  // single-shot one asks for one wrapping {nodes, edges} object.
  if (prompt.includes("prerequisite order:")) return tooBroad ? [scopeObj] : conceptObjs;
  if (isJudge(prompt))
    return [{ quality: "near" }, { quality: "near", response: "the streamed critique" }];
  if (isPassage(prompt)) return passageObjs;
  if (isConsume(prompt))
    return repeatSection ? [...consumeObjs, consumeObjs[1]] : consumeObjs;
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
          : isConsume(prompt)
            ? { chunks: objects }
            : prompt.includes("Socratic")
              ? { steps: objects }
              : prompt.includes("Feynman")
                ? { beats: objects }
                : prompt.includes("prerequisite concept map")
                  ? tooBroad
                    ? scopeObj
                    : graphObj
                  : prompt.includes("Write ONE placement question")
                    ? diagnosticQuestionObj
                    : objects[0];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(wrapped) } }],
        }),
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
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
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

// ---- "ask about this": the learner's own question about a passage ----------

describe("the reading pass", () => {
  const params = {
    topic: "Rust",
    nodeLabel: "Ownership",
    prereqLabels: [],
    interests: "",
  };

  it("paints a section as it is written, and caches only whole ones", async () => {
    const { generateConsumeStream } = await import("@/lib/server/generate");
    const { framesToPayload } = await import("@/lib/server/stream");
    splitDeltas = true;
    try {
      const frames = await drain(generateConsumeStream(params));
      const drafts = frames.filter((f) => f.partial);
      const complete = frames.filter((f) => !f.partial);

      // The first section is the longest wait in the app: redraws of it arrive
      // before it is finished, which is what the screen paints instead of a
      // placeholder.
      const first = drafts.filter((f) => f.i === 0);
      expect(first.length).toBeGreaterThan(0);
      expect(first[0].at).toBeLessThan(complete[0].at);

      // A draft is prose and nothing that gates — no takeaway (which is what
      // the client reads to tell a draft from a section), no example, no check.
      for (const d of first) {
        const v = d.v as { kicker: string; body: string[]; takeaway: string };
        expect(v.takeaway).toBe("");
        expect(v).not.toHaveProperty("check");
        expect(consumeObjs[0].kicker.startsWith(v.kicker)).toBe(true);
        for (const [i, p] of v.body.entries())
          expect(consumeObjs[0].body[i].startsWith(p)).toBe(true);
      }

      // …and none of it reaches the payload the route caches and both clients
      // are served: a half-written section filed as a whole one is a reading
      // that can never be finished.
      const payload = framesToPayload(
        frames.map(({ p, i, v, partial }) => ({ p, i: i!, v, partial })),
        { chunks: { min: 2, max: 5 } },
      ) as { chunks: Array<{ takeaway: string }> } | null;
      expect(payload?.chunks).toHaveLength(2);
      expect(payload?.chunks.map((c) => c.takeaway)).toEqual(
        consumeObjs.map((c) => c.takeaway),
      );
    } finally {
      splitDeltas = false;
    }
  });
});

describe("a repeated section", () => {
  it("is dropped, not shown or cached twice", async () => {
    const { generateConsumeStream } = await import("@/lib/server/generate");
    const { framesToPayload } = await import("@/lib/server/stream");
    repeatSection = true;
    try {
      const frames = await drain(
        generateConsumeStream({
          topic: "Rust",
          nodeLabel: "Ownership",
          prereqLabels: [],
          interests: "",
        }),
      );
      expect(frames.some((f) => (f.i ?? 0) > 1)).toBe(false);
      const payload = framesToPayload(
        frames.map(({ p, i, v, partial }) => ({ p, i: i!, v, partial })),
        { chunks: { min: 2, max: 5 } },
      ) as { chunks: Array<{ kicker: string }> } | null;
      expect(payload?.chunks.map((c) => c.kicker)).toEqual(
        consumeObjs.map((c) => c.kicker),
      );
    } finally {
      repeatSection = false;
    }
  });
});

describe("passage answers", () => {
  const params = {
    topic: "Rust",
    nodeLabel: "Ownership",
    kicker: "3 · Where it breaks",
    section:
      "A value has exactly one owner. When the owner goes out of scope, the value is dropped.",
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
      for (const d of first)
        expect(passageObjs[0].p.startsWith(d.v as string)).toBe(true);

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
