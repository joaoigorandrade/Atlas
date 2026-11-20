import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_PREFS,
  appendTranscript,
  parseVoicePrefs,
  readProgress,
  segmentsForChunk,
  speechLang,
  wordAt,
} from "@/lib/speech";
import type { SpeechMark } from "@/lib/api";
import type { ConsumeChunk } from "@/lib/curriculum";

const chunk = (over: Partial<ConsumeChunk> = {}): ConsumeChunk => ({
  id: "c1",
  kicker: "1 · What it is",
  terms: [],
  body: ["A matrix acts on space.", "It stretches and rotates."],
  example: { title: "Scaling by two", steps: ["Take e₁.", "Double it."] },
  takeaway: "A transformation is what it does to the basis.",
  cite: "Strang, Linear Algebra §2.1",
  diagram: "basis vectors before and after",
  ask: "Why does the basis determine everything?",
  ...over,
});

describe("speechLang", () => {
  it("maps each language onto a BCP-47 tag the engine accepts", () => {
    expect(speechLang("en")).toBe("en-US");
    expect(speechLang("pt-BR")).toBe("pt-BR");
  });
});

describe("segmentsForChunk", () => {
  it("reads prose, then the worked example, then the takeaway", () => {
    expect(segmentsForChunk(chunk())).toEqual([
      "A matrix acts on space.",
      "It stretches and rotates.",
      "Scaling by two",
      "Take e₁.",
      "Double it.",
      "A transformation is what it does to the basis.",
    ]);
  });

  it("leaves out the citation and the diagram — neither reads aloud sensibly", () => {
    const segments = segmentsForChunk(chunk());
    expect(segments).not.toContain("Strang, Linear Algebra §2.1");
    expect(segments).not.toContain("basis vectors before and after");
  });

  it("drops empty paragraphs so the reading never stalls on silence", () => {
    const segments = segmentsForChunk(
      chunk({ body: ["Real prose.", "   ", ""], takeaway: "  " }),
    );
    expect(segments).toEqual(["Real prose.", "Scaling by two", "Take e₁.", "Double it."]);
  });
});

describe("appendTranscript", () => {
  it("appends to what is already typed rather than replacing it", () => {
    expect(appendTranscript("I think", "the basis moves")).toBe(
      "I think the basis moves",
    );
  });

  it("starts the box off with the first spoken segment", () => {
    expect(appendTranscript("", "  the basis moves ")).toBe("the basis moves");
  });

  it("does not double the separator when the box already ends in space", () => {
    expect(appendTranscript("I think ", "so")).toBe("I think so");
    expect(appendTranscript("A line\n", "next")).toBe("A line\nnext");
  });

  it("ignores a blank final segment", () => {
    expect(appendTranscript("kept", "   ")).toBe("kept");
    expect(appendTranscript("", "")).toBe("");
  });
});

describe("parseVoicePrefs", () => {
  it("defaults both halves on when nothing is stored", () => {
    expect(parseVoicePrefs(null)).toEqual(DEFAULT_VOICE_PREFS);
    expect(DEFAULT_VOICE_PREFS).toEqual({ dictation: true, readAloud: true });
  });

  it("reads a stored preference back", () => {
    expect(parseVoicePrefs('{"dictation":false,"readAloud":true}')).toEqual({
      dictation: false,
      readAloud: true,
    });
  });

  it("falls back to the defaults on a corrupt or wrong-shaped value", () => {
    for (const raw of ["", "not json", "null", "42", '"on"', "[]"]) {
      expect(parseVoicePrefs(raw)).toEqual(DEFAULT_VOICE_PREFS);
    }
  });

  it("keeps the half it can read and defaults the half it can't", () => {
    expect(parseVoicePrefs('{"dictation":false}')).toEqual({
      dictation: false,
      readAloud: true,
    });
    expect(parseVoicePrefs('{"readAloud":"yes","dictation":false}')).toEqual({
      dictation: false,
      readAloud: true,
    });
  });
});

// ---- read-aloud engine ----------------------------------------------------
// The parts of the hosted-speech path that are pure. Everything the highlight
// depends on lives here on purpose: a timing bug shows up as a word marked at
// the wrong moment, which is exactly the kind of thing nobody notices in a
// screenshot.

const mark = (from: number, to: number, at: number, end: number): SpeechMark => ({
  from,
  to,
  at,
  end,
});

describe("wordAt", () => {
  // "A matrix acts" — with the comma-length gap between the second and third.
  const marks = [mark(0, 1, 0, 120), mark(2, 8, 120, 520), mark(9, 13, 700, 1000)];

  it("finds the word covering the moment", () => {
    expect(wordAt(marks, 300)?.from).toBe(2);
    expect(wordAt(marks, 900)?.from).toBe(9);
  });

  it("includes a word's start and excludes its end", () => {
    expect(wordAt(marks, 120)?.from).toBe(2);
    expect(wordAt(marks, 520)).toBeNull();
  });

  it("marks nothing in the pause between two words", () => {
    // The highlight goes out during a pause rather than clinging to the word
    // the voice has already finished.
    expect(wordAt(marks, 600)).toBeNull();
  });

  it("marks nothing before the first word or after the last", () => {
    expect(wordAt(marks, -50)).toBeNull();
    expect(wordAt(marks, 5000)).toBeNull();
    expect(wordAt([], 10)).toBeNull();
  });
});

describe("readProgress", () => {
  it("weights by characters, so an uneven section doesn't lurch", () => {
    const lengths = [100, 10, 100];
    expect(readProgress(lengths, 0, 0)).toBe(0);
    expect(readProgress(lengths, 0, 1)).toBeCloseTo(100 / 210);
    // The ten-character title is a blip, not a third of the ring.
    expect(readProgress(lengths, 1, 1)).toBeCloseTo(110 / 210);
    expect(readProgress(lengths, 2, 1)).toBe(1);
  });

  it("survives an unknown duration and an empty reading", () => {
    expect(readProgress([50, 50], 1, 0)).toBeCloseTo(0.5);
    expect(readProgress([], 0, 0.5)).toBe(0);
    expect(readProgress([10], -1, 0.5)).toBe(0);
  });
});
