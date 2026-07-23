import { describe, expect, it } from "vitest";
import {
  validateCrucible,
  validateCurriculum,
  validateFeynman,
  validateSocratic,
} from "@/lib/server/generate";

// ---- curriculum: DAG + scoping ------------------------------------------------

function curriculumPayload(edges: string[][]) {
  const nodes = Array.from({ length: 10 }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
  }));
  const diagnostic = [0, 1, 2].map((i) => ({
    nodeId: `n${i}`,
    q: `q${i}`,
    note: "note",
    opts: [
      { label: "sure", effect: "mastered" },
      { label: "kinda", effect: "shaky" },
      { label: "nope", effect: "none" },
    ],
  }));
  return { nodes, edges, diagnostic };
}

const chainEdges = Array.from({ length: 9 }, (_, i) => [`n${i}`, `n${i + 1}`]);

describe("validateCurriculum", () => {
  it("accepts a valid DAG", () => {
    const out = validateCurriculum(curriculumPayload(chainEdges));
    expect(out.nodes.length).toBe(10);
    expect(out.scopes).toBeUndefined();
  });

  it("rejects a prerequisite cycle (#16)", () => {
    const edges = [...chainEdges, ["n9", "n0"]];
    expect(() => validateCurriculum(curriculumPayload(edges))).toThrow(/cycle/);
  });

  it("returns scoped sub-map offers for too-broad topics (#30)", () => {
    const out = validateCurriculum({
      tooBroad: true,
      scopes: [
        { label: "Classical Mechanics", note: "forces and motion" },
        { label: "Thermodynamics", note: "heat and entropy" },
      ],
    });
    expect(out.scopes?.length).toBe(2);
  });
});

// ---- feynman: template echoes (#10) -------------------------------------------

function feynmanPayload(labels: [string, string, string]) {
  return {
    beats: [0, 1, 2].map((i) => ({
      subPoint: `point ${i}`,
      transcript: "transcript",
      interjection: "why?",
      replies: [
        { label: labels[0], verdict: "good", response: "ok" },
        { label: labels[1], verdict: "skipped", response: "hm" },
        { label: labels[2], verdict: "confused", response: "huh" },
      ],
      fix: {
        probe: "probe",
        replies: [
          { label: "right", correct: true, response: "yes" },
          { label: "wrong", correct: false, response: "no" },
        ],
      },
      gapLabel: "gap label",
      gapReason: "gap reason",
    })),
  };
}

describe("validateFeynman", () => {
  it("accepts concrete written-out reply labels", () => {
    const beats = validateFeynman("n1")(
      feynmanPayload([
        "A matrix times a vector recombines the columns",
        "It just works, trust the formula",
        "Matrix multiplication rotates every vector",
      ]),
    );
    expect(beats.length).toBe(3);
  });

  it("rejects the captured template-echo payload (#10)", () => {
    expect(() =>
      validateFeynman("n1")(
        feynmanPayload([
          "a complete, precise answer",
          "a hand-wave ('you'll feel it', 'just trust it')",
          "a confidently WRONG answer (a real misconception)",
        ]),
      ),
    ).toThrow(/echoes the prompt template/);
  });
});

// ---- socratic: template echoes -------------------------------------------------

describe("validateSocratic", () => {
  it("rejects reply labels that echo the prompt template", () => {
    const step = {
      move: "Clarify",
      prompt: "p",
      replies: [
        { label: "what the learner says", quality: "correct", response: "r" },
        { label: "b", quality: "wrong", response: "r" },
        { label: "c", quality: "near", response: "r" },
      ],
      hint: "h",
      tell: "t",
    };
    expect(() =>
      validateSocratic({ steps: [step, step, step] }),
    ).toThrow(/echoes the prompt template/);
  });
});

// ---- crucible: draws + self-identical errors (#15, #10) ------------------------

function cruciblePayload(draws: string[], redText: string) {
  return {
    draws,
    problems: [
      { tag: "novel", q: "q", hint: "h", placeholder: "p", sample: "s" },
      { tag: "guided", q: "q", hint: "h", placeholder: "p", sample: "s" },
    ],
    transfer: [
      { verdict: "good", text: "carried over fine" },
      { verdict: "good", text: "also fine" },
      { verdict: "red", text: redText },
    ],
    gapLabel: "the missing piece",
    gapReason: "because",
    reExplain: "re-explain",
  };
}

describe("validateCrucible", () => {
  it("filters draws to real mastered node labels (#15)", () => {
    const out = validateCrucible("n1", "Node", ["Vectors"])(
      cruciblePayload(["Chess", "Vectors"], "used row-major order, so the result was transposed"),
    );
    expect(out.draws).toEqual(["Vectors"]);
  });

  it("fails validation when no draw names a real node (#15)", () => {
    expect(() =>
      validateCrucible("n1", "Node", ["Vectors"])(
        cruciblePayload(["Chess"], "real error text described here"),
      ),
    ).toThrow(/draws must name concepts/);
  });

  it("rejects the captured self-identical error text (#10)", () => {
    expect(() =>
      validateCrucible("n1", "Node", ["Vectors"])(
        cruciblePayload(["Vectors"], "resulting in [4, 2] instead of [4, 2]"),
      ),
    ).toThrow(/identical/);
  });
});
