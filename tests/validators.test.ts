import { describe, expect, it } from "vitest";
import {
  validateChoice,
  validateConsume,
  validateCrucible,
  validateCurriculum,
  validateDiagnosticItem,
  validateFeynman,
  validateGraphPart,
  validateScopeOffer,
  validateSocratic,
} from "@/lib/server/generate";
import { migrateConsume, type LegacyConsumeChunk } from "@/lib/persistence";

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

// The streamed build validates the map and each placement question separately.
// Feeding those per-part validators the pieces of a single-shot payload must
// reproduce the single-shot result exactly — that equality is what lets the
// streamed and non-streamed paths share a `content_cache` row without bumping
// CONTENT_CACHE_VERSION, and a cache hit is returned to the client with no
// re-validation at all.
describe("curriculum part validators", () => {
  const payload = curriculumPayload(chainEdges);

  it("reproduce the single-shot result part by part", () => {
    const whole = validateCurriculum(payload);
    const graph = validateGraphPart(payload);
    const ids = new Set(graph.nodes.map((n) => n.id));
    const diagnostic = payload.diagnostic.map((d, i) =>
      validateDiagnosticItem(d, i, ids),
    );
    expect(graph.nodes).toEqual(whole.nodes);
    expect(graph.edges).toEqual(whole.edges);
    expect(diagnostic).toEqual(whole.diagnostic);
  });

  it("keeps the cycle check on the graph part, where the map is decided", () => {
    expect(() =>
      validateGraphPart(curriculumPayload([...chainEdges, ["n9", "n0"]])),
    ).toThrow(/cycle/);
  });

  it("rejects a question probing a concept the map never established", () => {
    const ids = new Set(["n0", "n1"]);
    expect(() =>
      validateDiagnosticItem(payload.diagnostic[2], 2, ids),
    ).toThrow(/is not a node id/);
  });

  it("reads a too-broad payload as scopes, and a normal one as not", () => {
    expect(
      validateScopeOffer({
        tooBroad: true,
        scopes: [
          { label: "Classical Mechanics", note: "forces and motion" },
          { label: "Thermodynamics", note: "heat and entropy" },
        ],
      }),
    ).toHaveLength(2);
    expect(validateScopeOffer(payload)).toBeNull();
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

// ---- choice: open-ended answers mapped onto the closed option list -----------

describe("validateChoice", () => {
  it("accepts an in-range index", () => {
    expect(validateChoice(3)({ index: 2, response: "you named the mechanism" })).toEqual({
      index: 2,
      response: "you named the mechanism",
    });
  });

  it("rejects an index past the option list", () => {
    expect(() => validateChoice(3)({ index: 3, response: "x" })).toThrow(/index/);
  });

  it("rejects a non-integer index (a string index would silently score wrong)", () => {
    expect(() => validateChoice(3)({ index: "1", response: "x" })).toThrow(/index/);
  });
});

// ---- consume: reading-first material, one hook per session --------------------

function consumeChunk(i: number, over: Record<string, unknown> = {}) {
  return {
    kicker: `${i + 1} · A section`,
    terms: [{ t: "term", d: "its definition" }],
    body: ["paragraph one", "paragraph two", "paragraph three"],
    example: { title: "worked", steps: ["step one", "step two"] },
    takeaway: "the line to carry",
    cite: "Strang, Linear Algebra §2.1",
    diagram: "the caption",
    figure: {
      nodes: [
        { id: "a", label: "in" },
        { id: "b", label: "out" },
      ],
      edges: [{ from: "a", to: "b" }],
    },
    ask: "what would break if it were false?",
    alt: {
      simpler: "plainly",
      example: "a second example",
      analogy: "like a lever",
      deeper: "the rigorous version",
    },
    pred: {
      q: "what happens if…?",
      opts: [
        { label: "a", correct: false },
        { label: "b", correct: true },
        { label: "c", correct: false },
      ],
      right: "yes — and here is why",
      wrong: "no — the usual mistake is…",
    },
    ...over,
  };
}

const consumePayload = (over: Record<string, unknown>[] = []) => ({
  chunks: Array.from({ length: 5 }, (_, i) => consumeChunk(i, over[i] ?? {})),
});

describe("validateConsume", () => {
  it("keeps the hook on the opening section and drops it everywhere else", () => {
    const out = validateConsume(consumePayload());
    expect(out[0].pred?.q).toBe("what happens if…?");
    expect(out.slice(1).every((c) => c.pred === undefined)).toBe(true);
  });

  it("requires a hook on the opening section", () => {
    expect(() =>
      validateConsume(consumePayload([{ pred: undefined }])),
    ).toThrow(/chunks\[0\].pred/);
  });

  it("rejects a thin body — Consume is where the material lives", () => {
    expect(() =>
      validateConsume(consumePayload([{ body: ["one paragraph"] }])),
    ).toThrow(/body must have 3-5 items/);
  });

  it("requires the worked example to be worked", () => {
    expect(() =>
      validateConsume(
        consumePayload([{ example: { title: "worked", steps: [] } }]),
      ),
    ).toThrow(/example\.steps/);
  });
});

// ---- persistence: quiz-shaped cached passes still render ---------------------

describe("migrateConsume", () => {
  const legacy = [0, 1].map((i) => ({
    id: `c${i + 1}`,
    kicker: `${i + 1} · Old`,
    terms: [],
    body: "one short paragraph",
    cite: "Strang §2.1",
    diagram: "caption",
    ask: "why?",
    alt: {
      simpler: "plainly",
      example: "worked out",
      analogy: "like a lever",
      deeper: "rigorously",
    },
    right: "correct",
    wrong: "not quite",
    pred: {
      q: "what happens?",
      opts: [
        { label: "a", correct: true },
        { label: "b", correct: false },
        { label: "c", correct: false },
      ],
    },
  })) as unknown as LegacyConsumeChunk[];

  it("reshapes a v2 pass and un-gates every section past the first", () => {
    const out = migrateConsume({ n1: legacy }).n1;
    expect(out[0].body).toEqual(["one short paragraph"]);
    expect(out[0].example.steps).toEqual(["worked out"]);
    expect(out[0].takeaway).toBe("plainly");
    // The chunk-level verdict copy moves onto the surviving prediction.
    expect(out[0].pred?.right).toBe("correct");
    expect(out[1].pred).toBeUndefined();
  });
});
