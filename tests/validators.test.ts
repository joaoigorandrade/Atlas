import { describe, expect, it } from "vitest";
import {
  validateChoice,
  validateConsume,
  validateCrucible,
  validateDiagnosticQuestion,
  validateFeynman,
  validateGraphPart,
  validateMapConcept,
  validateRetain,
  validateScopeOffer,
  validateSocratic,
} from "@/lib/server/generate";
import { graphFromMapNodes } from "@/lib/curriculum";
import { migrateConsume, type LegacyConsumeChunk } from "@/lib/persistence";

// ---- curriculum map: DAG + scoping --------------------------------------------

function graphPayload(edges: string[][]) {
  const nodes = Array.from({ length: 10 }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
  }));
  return { nodes, edges };
}

const chainEdges = Array.from({ length: 9 }, (_, i) => [`n${i}`, `n${i + 1}`]);

describe("validateGraphPart", () => {
  it("accepts a valid DAG", () => {
    const out = validateGraphPart(graphPayload(chainEdges));
    expect(out.nodes.length).toBe(10);
  });

  it("rejects a prerequisite cycle (#16)", () => {
    const edges = [...chainEdges, ["n9", "n0"]];
    expect(() => validateGraphPart(graphPayload(edges))).toThrow(/cycle/);
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
    expect(validateScopeOffer(graphPayload(chainEdges))).toBeNull();
  });
});

// ---- streamed map: one concept at a time, validated as it lands -------------

describe("validateMapConcept", () => {
  const concept = (over: Record<string, unknown> = {}) => ({
    id: "ownership",
    label: "Ownership",
    prereqs: [],
    ...over,
  });

  it("normalizes the id and keeps prereqs that already landed", () => {
    const seen = new Set(["stack-and-heap"]);
    const out = validateMapConcept(
      concept({ id: "Ownership!", prereqs: ["Stack And Heap"] }),
      1,
      seen,
    );
    expect(out.id).toBe("ownership-");
    expect(out.prereqs).toEqual(["stack-and-heap"]);
  });

  it("rejects a duplicate id — two nodes cannot share one slot on the map", () => {
    expect(() => validateMapConcept(concept(), 1, new Set(["ownership"]))).toThrow(
      /duplicate/,
    );
  });

  it("drops forward and self references rather than believing them", () => {
    // This is what makes a prerequisite cycle structurally impossible without a
    // whole-graph check: a prereq can only name a concept already written.
    const out = validateMapConcept(
      concept({ prereqs: ["lifetimes", "ownership", "stack-and-heap"] }),
      3,
      new Set(["stack-and-heap"]),
    );
    expect(out.prereqs).toEqual(["stack-and-heap"]);
  });

  it("treats a missing prereqs field as a foundation, not a failure", () => {
    const out = validateMapConcept({ id: "n0", label: "Bindings" }, 0, new Set());
    expect(out.prereqs).toEqual([]);
  });
});

describe("graphFromMapNodes", () => {
  const node = (id: string, prereqs: string[]) => ({
    id,
    label: id,
    prereqs,
    state: "unknown" as const,
    g: 1,
    week: 0,
    x: 0,
    y: 0,
  });

  it("derives one edge per prereq, prerequisite → dependent", () => {
    const { nodes, edges } = graphFromMapNodes([
      node("a", []),
      node("b", ["a"]),
      node("c", ["a", "b"]),
    ]);
    expect(edges).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
    // `prereqs` is stripped, so what reaches app state (and the persisted run
    // snapshot) stays a plain ConceptNode.
    expect(nodes.every((n) => !("prereqs" in n))).toBe(true);
  });

  it("is meaningful over a partial list — which is what lets the map paint mid-stream", () => {
    // Halfway through the stream, "c" hasn't been written yet.
    const { nodes, edges } = graphFromMapNodes([node("a", []), node("b", ["a", "c"])]);
    expect(nodes).toHaveLength(2);
    expect(edges).toEqual([["a", "b"]]);
  });
});

// ---- diagnostic question: one objective 4-option probe, graded server-side ----

function diagnosticPayload(over: Record<string, unknown> = {}) {
  return {
    nodeId: "n3",
    q: "What binds to what?",
    note: "note",
    opts: ["A", "B", "C", "D"],
    correctIndex: 1,
    ...over,
  };
}

describe("validateDiagnosticQuestion", () => {
  const ids = new Set(["n0", "n1", "n2", "n3"]);

  it("accepts a well-formed question", () => {
    const out = validateDiagnosticQuestion(diagnosticPayload(), ids);
    expect(out.nodeId).toBe("n3");
    expect(out.opts).toHaveLength(4);
    expect(out.correctIndex).toBe(1);
  });

  it("rejects a question probing a concept the map never established", () => {
    expect(() =>
      validateDiagnosticQuestion(diagnosticPayload({ nodeId: "n9" }), ids),
    ).toThrow(/is not one of the offered candidates/);
  });

  it("rejects anything but exactly 4 options", () => {
    expect(() =>
      validateDiagnosticQuestion(diagnosticPayload({ opts: ["A", "B", "C"] }), ids),
    ).toThrow(/opts/);
  });

  it("rejects a correctIndex outside 0-3", () => {
    expect(() =>
      validateDiagnosticQuestion(diagnosticPayload({ correctIndex: 4 }), ids),
    ).toThrow(/correctIndex/);
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
    check: {
      q: "what did that section say?",
      opts: [
        { label: "a", correct: false },
        { label: "b", correct: true },
        { label: "c", correct: false },
      ],
      right: "yes — that is the point",
      wrong: "no — it was in paragraph two",
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

  it("requires a comprehension check on every section — it gates Continue", () => {
    const out = validateConsume(consumePayload());
    expect(out.every((c) => c.check?.opts.filter((o) => o.correct).length === 1)).toBe(
      true,
    );
    expect(() =>
      validateConsume(consumePayload([{}, {}, { check: undefined }])),
    ).toThrow(/chunks\[2\].check/);
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

// ---- retain: the generator is a card factory, not the queue ------------------

describe("validateRetain", () => {
  const card = {
    type: "why",
    source: "Consume",
    node: "n1",
    front: "why does it hold?",
    back: "because of the invariant",
    reExplain: "re-explain",
  };
  const payload = { cards: [card, card, card, card] };

  it("accepts cards with no scheduling fields at all", () => {
    const out = validateRetain(8, new Set(["n1"]))(payload);
    expect(out.cards).toHaveLength(4);
    expect(out.cards[0].fsrs).toBeUndefined();
    expect(out.forecast).toBeUndefined();
  });

  it("still rejects a card pinned to a node the learner hasn't learned", () => {
    expect(() => validateRetain(8, new Set(["n2"]))(payload)).toThrow(
      /is not a learned node id/,
    );
  });

  it("ignores scheduling fields a stale prompt might still send", () => {
    // The scheduler owns intervals; anything the model volunteers is dropped
    // rather than trusted, since `newStoredCard` supplies its own.
    const out = validateRetain(8, new Set(["n1"]))({
      forecast: [{ label: "Due now", count: "9 cards", sub: "~8 min", tone: "due" }],
      cards: Array.from({ length: 4 }, () => ({
        ...card,
        fsrs: { again: "<10 min", hard: "1 d", good: "4 d", easy: "9 d" },
      })),
    });
    expect(out.cards[0].fsrs).toBeUndefined();
    expect(out.forecast).toBeUndefined();
  });
});
