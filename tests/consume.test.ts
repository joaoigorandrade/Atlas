import { describe, expect, it } from "vitest";
import {
  ALT_CONTROLS,
  CONSUME_HOOK_FELT,
  CONSUME_HOOK_REAL,
  MODALITY_PREFERENCE_MIN,
  altControls,
  calibVerdict,
  emptyConsumeProgress,
  phaseIndex,
  preferredModality,
  readingPhaseIndex,
  readingProgress,
  type ConsumeProgress,
  type ModalityTally,
} from "@/lib/curriculum";
import { altParagraphs, segmentsForChunk } from "@/lib/speech";
import { validatePassage } from "@/lib/server/generate";
import type { ConsumeChunk } from "@/lib/curriculum";

const progress = (over: Partial<ConsumeProgress> = {}): ConsumeProgress => ({
  ...emptyConsumeProgress(),
  ...over,
});

const chunk = (over: Partial<ConsumeChunk> = {}): ConsumeChunk => ({
  id: "c1",
  kicker: "1 · What it is",
  terms: [],
  body: ["A matrix acts on space.", "It stretches and rotates."],
  example: { title: "Scaling by two", steps: ["Take e₁.", "Double it."] },
  takeaway: "A transformation is what it does to the basis.",
  cite: "Strang, Linear Algebra",
  ask: "Why does the basis determine everything?",
  ...over,
});

// ---- reading progress ------------------------------------------------------

describe("readingProgress", () => {
  it("counts the revealed section, not the ones behind it", () => {
    expect(readingProgress(progress({ idx: 2, total: 5 }))).toEqual({
      read: 3,
      total: 5,
    });
  });

  it("grows the total rather than reporting more read than there are", () => {
    // The learner is deeper than the recorded total — the pass kept streaming
    // after that total was written. "7 of 5" is never an answer.
    expect(readingProgress(progress({ idx: 7, total: 5 }))).toEqual({
      read: 8,
      total: 8,
    });
  });

  it("records nothing read past a total it does know", () => {
    const { read, total } = readingProgress(progress({ idx: 0, total: 5 }));
    expect(read).toBeLessThanOrEqual(total);
    expect(read).toBe(1);
  });

  it("reports a finished pass as fully read", () => {
    expect(readingProgress(progress({ idx: 4, total: 5, finished: true }))).toEqual({
      read: 5,
      total: 5,
    });
  });
});

// ---- the phase spiral, corrected by what was actually read -----------------

describe("readingPhaseIndex", () => {
  it("keeps Consume current while the reading is unfinished", () => {
    // The state alone says Feynman — which would tick off both Consume and
    // Socratic on the strength of two sections read.
    expect(phaseIndex("learning", false)).toBe(2);
    expect(readingPhaseIndex("learning", false, progress({ idx: 1, total: 5 }))).toBe(0);
  });

  it("moves to Socratic once the pass is read but not handed off", () => {
    expect(
      readingPhaseIndex("learning", false, progress({ idx: 4, total: 5, finished: true })),
    ).toBe(1);
  });

  it("defers to the state once Socratic actually opened", () => {
    expect(
      readingPhaseIndex(
        "learning",
        false,
        progress({ idx: 4, total: 5, finished: true, handedOff: true }),
      ),
    ).toBe(2);
  });

  it("leaves every other state exactly where phaseIndex puts it", () => {
    const p = progress({ idx: 0, total: 5 });
    for (const state of ["unknown", "frontier", "shaky", "mastered", "gap"] as const)
      expect(readingPhaseIndex(state, false, p)).toBe(phaseIndex(state, false));
  });

  it("falls back to the state when the node has no reading record", () => {
    expect(readingPhaseIndex("learning", false, undefined)).toBe(2);
  });
});

// ---- adaptive modality -----------------------------------------------------

describe("preferredModality", () => {
  it("stays null until a habit is actually established", () => {
    expect(preferredModality({})).toBeNull();
    expect(preferredModality({ simpler: MODALITY_PREFERENCE_MIN - 1 })).toBeNull();
  });

  it("names the modality the learner keeps reaching for", () => {
    expect(preferredModality({ simpler: 1, analogy: MODALITY_PREFERENCE_MIN })).toBe(
      "analogy",
    );
  });

  it("breaks ties in control order rather than key order", () => {
    const tally: ModalityTally = {
      deeper: MODALITY_PREFERENCE_MIN,
      example: MODALITY_PREFERENCE_MIN,
    };
    // "example" comes before "deeper" in ALT_CONTROLS, so it wins — and the
    // answer must not depend on which key was inserted first.
    expect(preferredModality(tally)).toBe("example");
    expect(preferredModality({ example: 3, deeper: 3 })).toBe("example");
  });
});

describe("altControls", () => {
  it("translates the rewrite controls", () => {
    expect(altControls("en")).toBe(ALT_CONTROLS);
    const pt = altControls("pt-BR");
    expect(pt.map(([key]) => key)).toEqual(ALT_CONTROLS.map(([key]) => key));
    expect(pt.map(([, label]) => label)).not.toEqual(
      ALT_CONTROLS.map(([, label]) => label),
    );
  });
});

// ---- the hook's calibration reading ---------------------------------------

describe("the Consume hook as a calibration sample", () => {
  it("reads an own-words guess as more confidence than a tapped option", () => {
    expect(CONSUME_HOOK_FELT.open).toBeGreaterThan(CONSUME_HOOK_FELT.choices);
  });

  it("stops short of certainty in both directions", () => {
    // One guess made *before* reading is weak evidence either way.
    expect(CONSUME_HOOK_REAL.right).toBeLessThan(100);
    expect(CONSUME_HOOK_REAL.wrong).toBeGreaterThan(0);
  });

  it("catches a confident wrong guess as overconfidence", () => {
    expect(calibVerdict(CONSUME_HOOK_FELT.open, CONSUME_HOOK_REAL.wrong)).toBe("over");
  });

  it("doesn't punish a hedged learner who turns out to be right", () => {
    expect(calibVerdict(CONSUME_HOOK_FELT.choices, CONSUME_HOOK_REAL.right)).toBe(
      "under",
    );
  });
});

// ---- read-aloud follows what's on screen -----------------------------------

describe("segmentsForChunk", () => {
  it("reads the prose, then the worked example, then the takeaway", () => {
    expect(segmentsForChunk(chunk())).toEqual([
      "A matrix acts on space.",
      "It stretches and rotates.",
      "Scaling by two",
      "Take e₁.",
      "Double it.",
      "A transformation is what it does to the basis.",
    ]);
  });

  it("reads the rewrite that has replaced the prose, not the prose", () => {
    const segments = segmentsForChunk(chunk(), "Plainly put.\n\nIt moves things.");
    expect(segments.slice(0, 2)).toEqual(["Plainly put.", "It moves things."]);
    expect(segments).not.toContain("A matrix acts on space.");
    // The example and takeaway are still on screen, so they still read.
    expect(segments).toContain("A transformation is what it does to the basis.");
  });

  it("keeps the paragraph split the view renders, so the highlight tracks", () => {
    const text = "One.\n\nTwo.\n\nThree.";
    const paragraphs = altParagraphs(text);
    expect(paragraphs).toEqual(["One.", "Two.", "Three."]);
    // The first N spoken segments are exactly the N rendered paragraphs.
    expect(segmentsForChunk(chunk(), text).slice(0, paragraphs.length)).toEqual(
      paragraphs,
    );
  });
});

// ---- the passage answer ("ask about this") ---------------------------------

describe("validatePassage", () => {
  it("accepts a short answer", () => {
    expect(validatePassage({ answer: ["Because the basis spans it."] })).toEqual([
      "Because the basis spans it.",
    ]);
  });

  it("rejects an empty answer", () => {
    expect(() => validatePassage({ answer: [] })).toThrow();
  });

  it("rejects an answer that runs past the bound", () => {
    expect(() => validatePassage({ answer: ["a", "b", "c", "d", "e"] })).toThrow();
  });

  it("rejects a non-string paragraph", () => {
    expect(() => validatePassage({ answer: [{ p: "wrong shape" }] })).toThrow();
  });
});
