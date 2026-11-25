import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamFrame } from "@/lib/server/stream";

const { generateJson, streamJsonObjects, blindSolve } = vi.hoisted(() => ({
  generateJson: vi.fn(),
  streamJsonObjects: vi.fn(),
  blindSolve: vi.fn(),
}));

vi.mock("@/lib/server/openrouter", () => ({ generateJson, streamJsonObjects }));
vi.mock("@/lib/server/generate/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/generate/verify")>()),
  blindSolve,
}));

import { generateExamStream, type ExamParams } from "@/lib/server/generate/exam";

const params: ExamParams = {
  topic: "Statistics",
  goal: "mastery",
  interests: "",
  pool: [
    { id: "n0", label: "Mean" },
    { id: "n1", label: "Median" },
  ],
  count: 4,
  difficulty: "medium",
};

const item = (nodeId: string, q: string) => ({
  nodeId,
  q,
  opts: ["w", "x", "y", "z"],
  correctIndex: 1,
  explain: "why",
});

/** The stream mock runs the real per-object validator, like `slots` does. */
function streams(objects: unknown[], dieAfter?: number) {
  streamJsonObjects.mockImplementation(async function* (
    _messages: unknown,
    validate: (raw: unknown, i: number) => unknown,
  ) {
    let i = 0;
    for (const o of objects) {
      if (dieAfter !== undefined && i >= dieAfter) throw new Error("socket hang up");
      try {
        yield validate(o, i);
      } catch {
        // dropped, as `slots` drops a badly written object
      }
      i++;
    }
  });
}

/** generateJson mock: hand the real validator the model's "reply". */
function tops(reply: unknown) {
  generateJson.mockImplementation(
    async (_m: unknown, validate: (raw: unknown) => unknown) => validate(reply),
  );
}

async function collect(): Promise<StreamFrame[]> {
  const out: StreamFrame[] = [];
  for await (const f of generateExamStream(params, () => 0)) out.push(f);
  return out;
}

describe("generateExamStream", () => {
  beforeEach(() => {
    generateJson.mockReset();
    streamJsonObjects.mockReset();
    blindSolve.mockReset().mockResolvedValue({});
  });

  it("leaves off a question whose key a blind solve disputes, and writes it again", async () => {
    streams([item("n0", "A"), item("n1", "WRONG"), item("n0", "C"), item("n1", "D")]);
    // The solver is sure of option 0 on "WRONG"; the key says 1.
    blindSolve.mockImplementation(async ({ items }: { items: { stem: string }[] }) =>
      items[0].stem === "WRONG" ? { q: { pick: 0, confidence: 0.95 } } : {},
    );
    tops({ questions: [item("n1", "B2")] });
    const frames = await collect();
    expect(frames.map((f) => (f.v as { q: string }).q)).toEqual(["A", "C", "D", "B2"]);
  });

  it("streams one frame per question, numbered in order, with no top-up when whole", async () => {
    streams([item("n0", "A"), item("n1", "B"), item("n0", "C"), item("n1", "D")]);
    const frames = await collect();
    expect(frames.map((f) => ("i" in f ? f.i : -1))).toEqual([0, 1, 2, 3]);
    expect(frames.map((f) => (f.v as { id: string }).id)).toEqual([
      "ex-1",
      "ex-2",
      "ex-3",
      "ex-4",
    ]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("leaves off an over-share question and tops up exactly what is owed", async () => {
    // Three on n0 (share is 2) and one bad object: n1 is owed two.
    streams([
      item("n0", "A"),
      item("n0", "B"),
      item("n0", "C"),
      { nope: true },
      item("n1", "D"),
    ]);
    tops({ questions: [item("n1", "E")] });
    const frames = await collect();
    const qs = frames.map((f) => f.v as { id: string; nodeId: string; q: string });
    expect(qs.map((q) => q.q)).toEqual(["A", "B", "D", "E"]);
    expect(qs.map((q) => q.id)).toEqual(["ex-1", "ex-2", "ex-3", "ex-4"]);
    // The top-up was told what is already on the paper.
    expect(JSON.stringify(generateJson.mock.calls[0][0])).toContain(
      "already on the paper",
    );
  });

  it("keeps what landed when the stream dies part-way, and finishes the paper", async () => {
    streams([item("n0", "A"), item("n1", "B"), item("n0", "C")], 2);
    tops({ questions: [item("n0", "C2"), item("n1", "D2")] });
    const frames = await collect();
    expect(frames.map((f) => (f.v as { q: string }).q)).toEqual(["A", "B", "C2", "D2"]);
  });

  it("falls back to a whole single-shot paper when the stream yields nothing", async () => {
    streams([], 0);
    tops({
      questions: [item("n0", "A"), item("n1", "B"), item("n0", "C"), item("n1", "D")],
    });
    const frames = await collect();
    expect(frames).toHaveLength(4);
  });

  it("fails when even the top-up cannot complete the paper", async () => {
    streams([item("n0", "A")]);
    tops({ questions: [item("n0", "A")] }); // a repeat, and n1 still owed
    await expect(collect()).rejects.toThrow(/still needs/);
  });
});
