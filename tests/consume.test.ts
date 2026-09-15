import { describe, expect, it } from "vitest";
import {
  ALT_CONTROLS,
  MODALITY_PREFERENCE_MIN,
  altControls,
  emptyConsumeProgress,
  phaseIndex,
  preferredModality,
  planGates,
  stateFromPlan,
  LEGACY_PHASE_PLAN,
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

// ---- the phase spiral, derived from what the learner has finished ---------

describe("phaseIndex over a node's own plan", () => {
  const PLAN = LEGACY_PHASE_PLAN;

  it("points at Consume while the reading is unfinished", () => {
    // Consume only enters `phasesDone` when the pass is read through, so a
    // part-read node's first unfinished phase already is Consume. This is
    // what `readingPhaseIndex` used to have to argue back to from state.
    expect(phaseIndex(PLAN, [], "learning")).toBe(0);
  });

  it("moves on once the reading pass is recorded as done", () => {
    expect(phaseIndex(PLAN, ["consume"], "learning")).toBe(1);
  });

  it("stays on the last rung until real review history exists (#13)", () => {
    const done = planGates(PLAN);
    expect(phaseIndex(PLAN, done, "mastered", false)).toBe(PLAN.length - 1);
    expect(phaseIndex(PLAN, done, "mastered", true)).toBe(PLAN.length);
  });

  it("reports locked for a node that cannot be entered", () => {
    expect(phaseIndex(PLAN, [], "unknown")).toBe(-1);
    expect(phaseIndex(PLAN, [], "gap")).toBe(-1);
  });
});

describe("stateFromPlan", () => {
  it("keeps a part-read node out of frontier without finishing a phase", () => {
    expect(stateFromPlan(LEGACY_PHASE_PLAN, [])).toBe("unknown");
    expect(stateFromPlan(LEGACY_PHASE_PLAN, [], { started: true })).toBe("learning");
  });

  it("goes green when the last gate closes, not when Retain does", () => {
    const gates = planGates(LEGACY_PHASE_PLAN);
    expect(stateFromPlan(LEGACY_PHASE_PLAN, gates)).toBe("mastered");
    expect(stateFromPlan(LEGACY_PHASE_PLAN, gates.slice(0, -1))).toBe("learning");
  });

  it("holds a finished plan at shaky while a reason stands", () => {
    const gates = planGates(LEGACY_PHASE_PLAN);
    expect(stateFromPlan(LEGACY_PHASE_PLAN, gates, { shaky: "crucible-fail" })).toBe(
      "shaky",
    );
  });

  it("reaches mastered through a plan with no Crucible in it", () => {
    // The whole point of the inversion: green was reachable only by passing
    // Crucible, because exactly one line in `useSpiral` wrote it.
    const plan = ["consume", "socratic", "retain"] as const;
    expect(stateFromPlan(plan, ["consume", "socratic"])).toBe("mastered");
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
