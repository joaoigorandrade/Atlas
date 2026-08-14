import { beforeEach, describe, expect, it } from "vitest";
import { normalizeMarks } from "@/lib/server/tts";
import { speechKey } from "@/lib/server/speechCache";

// The provider's speech marks are the one part of this integration the app
// can't see coming: the shape is nested, the casing differs between the
// vendor's TypeScript types and its REST examples, and a mark read wrong
// doesn't fail — it drags the read-along highlight off the voice.

describe("normalizeMarks", () => {
  const nested = {
    type: "speech",
    start: 0,
    end: 13,
    startTime: 0,
    endTime: 1000,
    value: "A matrix acts",
    chunks: [
      { type: "word", start: 0, end: 1, startTime: 0, endTime: 120, value: "A" },
      { type: "word", start: 2, end: 8, startTime: 120, endTime: 520, value: "matrix" },
      { type: "word", start: 9, end: 13, startTime: 700, endTime: 1000, value: "acts" },
    ],
  };

  it("flattens to the words and drops the container", () => {
    // The whole-input chunk spans every word; keeping it would highlight the
    // entire paragraph for the length of the clip.
    expect(normalizeMarks(nested)).toEqual([
      { from: 0, to: 1, at: 0, end: 120 },
      { from: 2, to: 8, at: 120, end: 520 },
      { from: 9, to: 13, at: 700, end: 1000 },
    ]);
  });

  it("reads snake_case as readily as camelCase", () => {
    const snake = {
      start: 0,
      end: 13,
      start_time: 0,
      end_time: 1000,
      chunks: [
        { start: 0, end: 1, start_time: 0, end_time: 120 },
        { start: 2, end: 8, start_time: 120, end_time: 520 },
        { start: 9, end: 13, start_time: 700, end_time: 1000 },
      ],
    };
    expect(normalizeMarks(snake)).toEqual(normalizeMarks(nested));
  });

  it("drops a mark missing timing rather than inventing one", () => {
    const partial = {
      chunks: [
        { start: 0, end: 1, startTime: 0, endTime: 120 },
        { start: 2, end: 8, value: "matrix" },
        { start: 9, end: 13, startTime: 700, endTime: 1000 },
      ],
    };
    expect(normalizeMarks(partial).map((m) => m.from)).toEqual([0, 9]);
  });

  it("drops marks whose ranges are impossible", () => {
    const bad = {
      chunks: [
        { start: 5, end: 5, startTime: 0, endTime: 100 },
        { start: 0, end: 4, startTime: 300, endTime: 100 },
      ],
    };
    expect(normalizeMarks(bad)).toEqual([]);
  });

  it("returns nothing for an engine that sent no marks", () => {
    expect(normalizeMarks(undefined)).toEqual([]);
    expect(normalizeMarks(null)).toEqual([]);
    expect(normalizeMarks("marks")).toEqual([]);
    expect(normalizeMarks([])).toEqual([]);
  });

  it("sorts by time, so the highlight's binary search holds", () => {
    const shuffled = {
      chunks: [
        { start: 9, end: 13, startTime: 700, endTime: 1000 },
        { start: 0, end: 1, startTime: 0, endTime: 120 },
      ],
    };
    expect(normalizeMarks(shuffled).map((m) => m.at)).toEqual([0, 700]);
  });
});

describe("speechKey", () => {
  const base = {
    text: "A matrix acts on space.",
    language: "en",
    voice: "henry",
    model: "simba-english",
  } as const;

  beforeEach(() => {
    delete process.env.SPEECH_CACHE_VERSION;
  });

  it("is stable for identical inputs", () => {
    expect(speechKey({ ...base })).toBe(speechKey({ ...base }));
  });

  it("separates every field that changes the audio", () => {
    const keys = new Set([
      speechKey(base),
      speechKey({ ...base, language: "pt-BR" }),
      speechKey({ ...base, voice: "lisa" }),
      speechKey({ ...base, model: "simba-multilingual" }),
      speechKey({ ...base, text: "A matrix acts on space" }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("cannot collide by running two adjacent fields together", () => {
    // The separator is what stops model "ab" + voice "c" from addressing the
    // same row as model "a" + voice "bc". Concatenated without one, those are
    // the same string — and the learner hears the wrong voice reading from a
    // row that looks like a legitimate hit.
    expect(speechKey({ ...base, model: "ab", voice: "c" })).not.toBe(
      speechKey({ ...base, model: "a", voice: "bc" }),
    );
  });
});
