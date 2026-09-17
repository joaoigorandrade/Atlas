import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamFrame } from "@/lib/server/stream";

const { generateJson, stream, logWarning } = vi.hoisted(() => ({
  generateJson: vi.fn(),
  stream: vi.fn(),
  logWarning: vi.fn(),
}));
vi.mock("@/lib/server/openrouter", () => ({
  generateJson,
  streamJsonObjectsProgressive: stream,
}));
vi.mock("@/lib/log", () => ({ logWarning }));

import { judgeStream } from "@/lib/server/generate/judgeStream";

type Judgement = { quality: string; response: string };
const full = { quality: "correct", response: "The reasoning is right." };
const messages = [{ role: "user" as const, content: "Judge this answer." }];
const spec = {
  label: "test-judge",
  firstShape: '{"quality": "..."}',
  first(raw: unknown): Partial<Judgement> {
    const value = raw as Partial<Judgement>;
    if (!value.quality) throw new Error("missing quality");
    return { quality: value.quality };
  },
  full(raw: unknown): Judgement {
    const value = raw as Judgement;
    if (!value.quality || !value.response) throw new Error("incomplete judgement");
    return value;
  },
};
const collect = async () => {
  const frames: StreamFrame[] = [];
  for await (const frame of judgeStream(messages, spec)) frames.push(frame);
  return frames;
};

describe("judgeStream", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    generateJson.mockResolvedValue(full);
  });

  it("accepts a complete first object without making a fallback call", async () => {
    stream.mockImplementation(async function* (_messages, validate) {
      yield { value: validate(full) };
    });
    expect(await collect()).toEqual([{ p: "judgement", v: full }]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("emits the verdict before the complete judgement", async () => {
    stream.mockImplementation(async function* (_messages, validate) {
      yield { value: validate({ quality: "correct" }) };
      yield { value: validate(full) };
    });
    expect(await collect()).toEqual([
      { p: "judgement", v: { quality: "correct" } },
      { p: "judgement", v: full },
    ]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("drafts response text only and marks the frame as partial", async () => {
    stream.mockImplementation(async function* (_messages, validate, options) {
      expect(options.partial({ quality: "wrong" })).toBeNull();
      expect(options.partial({ response: " " })).toBeNull();
      yield {
        value: options.partial({ quality: "wrong", response: "The reasoning" }),
        partial: true,
      };
      yield { value: validate(full) };
    });
    expect(await collect()).toEqual([
      { p: "judgement", v: { response: "The reasoning" }, partial: true },
      { p: "judgement", v: full },
    ]);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("retrieves a full judgement when only the prefix arrives", async () => {
    stream.mockImplementation(async function* (_messages, validate) {
      yield { value: validate({ quality: "correct" }) };
    });
    expect(await collect()).toHaveLength(2);
    expect(generateJson).toHaveBeenCalledExactlyOnceWith(messages, spec.full, {
      label: "test-judge",
      role: "judge",
    });
  });

  it("logs a handled stream failure and uses the retried fallback", async () => {
    const error = new Error("stream unavailable");
    stream.mockImplementation(() => {
      throw error;
    });
    expect(await collect()).toEqual([{ p: "judgement", v: full }]);
    expect(logWarning).toHaveBeenCalledWith("judge_stream_fallback", error, {
      label: "test-judge",
      sent: 0,
    });
    expect(generateJson).toHaveBeenCalledOnce();
  });

  it("propagates fallback failure instead of inventing a judgement", async () => {
    stream.mockImplementation(() => {
      throw new Error("stream unavailable");
    });
    generateJson.mockRejectedValue(new Error("fallback unavailable"));
    await expect(collect()).rejects.toThrow("fallback unavailable");
  });
});
