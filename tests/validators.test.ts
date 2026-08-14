import { describe, expect, it } from "vitest";
import {
  validateChoice,
  validateConsume,
  validateConsumeModel,
  validateCrucible,
  validateDiagnosticQuestion,
  validateFeynman,
  validateFeynmanJudgement,
  mapNodeBounds,
  validateGraphPart,
  validateMapConcept,
  retainCardBounds,
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

  // The band the prompt asks for is 6-16 and the floor sits under it: a topic
  // that is one technique is a small map, not a padded one.
  it("accepts a map as small as the topic genuinely is", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }));
    const edges = Array.from({ length: 5 }, (_, i) => [`n${i}`, `n${i + 1}`]);
    expect(validateGraphPart({ nodes, edges }).nodes).toHaveLength(6);
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

function feynmanPayload(mustConvey: [string, string, string]) {
  return {
    beats: [0, 1, 2].map((i) => ({
      subPoint: `point ${i}`,
      mustConvey: [mustConvey[i]],
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
  it("accepts a concrete, checkable rubric", () => {
    const beats = validateFeynman("n1")(
      feynmanPayload([
        "that a matrix times a vector recombines the columns",
        "that the transformation keeps the grid evenly spaced",
        "that the origin never moves",
      ]),
    );
    expect(beats.length).toBe(3);
    expect(beats[0].mustConvey).toHaveLength(1);
  });

  it("accepts a two-row rubric — a short concept is explained in two", () => {
    const { beats } = feynmanPayload([
      "that a matrix times a vector recombines the columns",
      "that the origin never moves",
      "unused",
    ]);
    expect(validateFeynman("n1")({ beats: beats.slice(0, 2) })).toHaveLength(2);
  });

  it("rejects rubric rows that echo the prompt template (#10)", () => {
    expect(() =>
      validateFeynman("n1")(
        feynmanPayload([
          "a complete, precise answer",
          "what the learner says",
          "a real misconception",
        ]),
      ),
    ).toThrow(/echoes the prompt template/);
  });
});

// ---- socratic: template echoes -------------------------------------------------

describe("validateSocratic", () => {
  // Two core probes plus the one spare is the shortest written pass. The floor
  // is on the written array, not the plan: a pass that skipped its spare has
  // nothing to sell a struggling learner.
  it("accepts two core probes and the one held-back spare", () => {
    const probe = (spare: boolean) => ({
      spare,
      move: "Clarify",
      prompt: "what does it do?",
      replies: [
        { label: "it recombines the columns", quality: "correct", response: "yes" },
        { label: "it rotates the grid", quality: "wrong", response: "no — that is one case" },
        { label: "something about columns", quality: "near", response: "keep going" },
      ],
      hint: "count the columns",
      tell: "it takes a combination of the columns",
    });
    const out = validateSocratic({ steps: [probe(false), probe(false), probe(true)] });
    expect(out).toHaveLength(3);
    expect(out.filter((step) => !step.spare)).toHaveLength(2);
  });

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

  it("returns the difficulty ladder in the requested language", () => {
    const payload = cruciblePayload(["Vectors"], "used row-major order, so the result was transposed");
    expect(validateCrucible("n1", "Node", ["Vectors"], "pt-BR")(payload).rungs[0].label).toBe(
      "Lembrar uma definição",
    );
    expect(validateCrucible("n1", "Node", ["Vectors"])(payload).rungs[0].label).toBe(
      "Recall a definition",
    );
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
  it("carries no question before the prose — the reading opens on material", () => {
    const out = validateConsume(consumePayload());
    expect(out.every((c) => !("pred" in c))).toBe(true);
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

  // Length is the concept's call, not a quota: two sections of two paragraphs
  // each is a complete pass for a concept that carries two things.
  it("accepts a two-section pass with two-paragraph bodies", () => {
    const out = validateConsume({
      chunks: [0, 1].map((i) =>
        consumeChunk(i, { body: ["paragraph one", "paragraph two"] }),
      ),
    });
    expect(out).toHaveLength(2);
    expect(out[0].body).toHaveLength(2);
  });

  it("rejects a thin body — Consume is where the material lives", () => {
    expect(() =>
      validateConsume(consumePayload([{ body: ["one paragraph"] }])),
    ).toThrow(/body must have 2-5 items/);
  });

  it("requires the worked example to be worked", () => {
    expect(() =>
      validateConsume(
        consumePayload([{ example: { title: "worked", steps: [] } }]),
      ),
    ).toThrow(/example\.steps/);
  });

  // The shape forbids naming a work the model isn't sure exists. When `cite`
  // was also required, the only way to satisfy both was to invent one — so
  // abstaining has to validate, and the "Further reading" line just goes away.
  it("accepts a section that declines to name a further-reading work", () => {
    const out = validateConsume(consumePayload([{ cite: undefined }]));
    expect(out[0].cite).toBeUndefined();
    expect(out[1].cite).toBe("Strang, Linear Algebra §2.1");
  });
});

// ---- judge: feynman verdicts must cover the whole rubric ---------------------

describe("validateFeynmanJudgement", () => {
  const judgement = (over: Record<string, unknown> = {}) => ({
    verdicts: [
      { i: 0, verdict: "good" },
      { i: 1, verdict: "skipped" },
      { i: 2, verdict: "confused", quote: "they said this bit" },
    ],
    response: "I followed the first part, but I never learned why it holds.",
    jargon: ["eigenbasis"],
    ...over,
  });

  it("accepts one ruling per rubric row", () => {
    const out = validateFeynmanJudgement(3)(judgement());
    expect(out.verdicts.map((v) => v.i)).toEqual([0, 1, 2]);
  });

  // A row with no verdict spawns no gap, so a judge that reports only the rows
  // it found interesting marks the learner clean on material they never
  // explained. Failing routes it through the corrective retry instead.
  it("rejects a rubric row left unjudged — an unjudged row spawns no gap", () => {
    expect(() =>
      validateFeynmanJudgement(3)(
        judgement({
          verdicts: [
            { i: 0, verdict: "good" },
            { i: 2, verdict: "confused" },
          ],
        }),
      ),
    ).toThrow(/missing 1/);
  });

  it("keeps the first ruling when the judge second-guesses an index", () => {
    const out = validateFeynmanJudgement(2)(
      judgement({
        verdicts: [
          { i: 0, verdict: "good" },
          { i: 0, verdict: "confused" },
          { i: 1, verdict: "skipped" },
        ],
      }),
    );
    expect(out.verdicts).toHaveLength(2);
    expect(out.verdicts[0].verdict).toBe("good");
  });
});

// ---- model view: one lens over one section -----------------------------------

describe("validateConsumeModel", () => {
  const beats = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      label: `Beat ${i + 1}`,
      text: "the beat itself",
    }));

  it("accepts a walkthrough within bounds", () => {
    const out = validateConsumeModel({ beats: beats(4) });
    expect(out).toHaveLength(4);
    expect(out[0].label).toBe("Beat 1");
  });

  it("rejects a walkthrough too short to be one", () => {
    expect(() => validateConsumeModel({ beats: beats(2) })).toThrow(/beats/);
  });

  it("rejects a beat with no text — a label alone reveals nothing", () => {
    expect(() =>
      validateConsumeModel({ beats: [...beats(2), { label: "Beat 3", text: "  " }] }),
    ).toThrow(/beats\[2\].text/);
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

  it("reshapes a v2 pass and drops every question it carried", () => {
    const out = migrateConsume({ n1: legacy }).n1;
    expect(out[0].body).toEqual(["one short paragraph"]);
    expect(out[0].example.steps).toEqual(["worked out"]);
    expect(out[0].takeaway).toBe("plainly");
    // The old pre-reading hook and its verdict copy are gone.
    expect(out.every((c) => !("pred" in c))).toBe(true);
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

  // The draft is sized to the rotation — a three-node rotation is three cards,
  // not six cuts at the same three facts.
  it("accepts a draft as small as the rotation", () => {
    const out = validateRetain(8, new Set(["n1"]))({ cards: [card, card, card] });
    expect(out.cards).toHaveLength(3);
  });

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

  it("lets a cloze card's answer stand in for a missing back", () => {
    const cloze = {
      type: "recall",
      source: "Consume",
      node: "n1",
      cloze: ["a ", " b"],
      answer: "the blank",
      reExplain: "re-explain",
    };
    const out = validateRetain(8, new Set(["n1"]))({
      cards: [cloze, cloze, cloze, cloze],
    });
    expect(out.cards[0].back).toBe("the blank");
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

describe("retainCardBounds", () => {
  it("asks for about one card per node in rotation", () => {
    expect(retainCardBounds(5)).toEqual({ min: 4, max: 6 });
  });

  it("never asks below the floor or above the ceiling", () => {
    expect(retainCardBounds(1)).toEqual({ min: 3, max: 4 });
    expect(retainCardBounds(30)).toEqual({ min: 7, max: 8 });
  });
});

describe("mapNodeBounds", () => {
  it("keeps the full-map band when no Pareto share is set", () => {
    expect(mapNodeBounds()).toMatchObject({ ask: [6, 16], min: 5, max: 20 });
  });

  it("shrinks the map as the Pareto share shrinks", () => {
    const [low, mid, high] = [20, 50, 80].map((p) => mapNodeBounds(p));
    expect(low.ask[1]).toBeLessThan(mid.ask[0]);
    expect(mid.ask[1]).toBeLessThan(high.ask[0]);
    // A top-20% map must be able to validate below the full map's floor.
    expect(low.min).toBeLessThan(mapNodeBounds().min);
  });
});
