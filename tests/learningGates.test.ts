// The rules that keep a phase from being passed by clicking, by waiting in the
// same sitting, or around an open gap — and the calibration readings that feed
// the curve. Each is silent when broken: the node just goes green too early.

import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_FELT,
  CONNECT_MIN_WORDS,
  RETAINED_MIN_DAYS,
  SPACING_MS,
  connectDraftReady,
  connectReducer,
  connectCards,
  connectStart,
  type ConnectSession,
  crucibleReal,
  crucibleScaffolded,
  crucibleStart,
  discriminateReducer,
  discriminateStart,
  drillReducer,
  drillStart,
  earnsRetained,
  gapParentOf,
  heldUntil,
  holdFrom,
  holdsRecall,
  hoursLeft,
  mergeCalib,
  neighboursOf,
  openGapIds,
  predictCalibration,
  predictStart,
  retainReducer,
  retainStart,
  runReading,
  stateFromPlan,
  type ConceptGraph,
  type ConceptNode,
  type DiscriminateContent,
  type DrillContent,
  type ElaborationContent,
  type PredictContent,
  type RetainContent,
} from "@/lib/curriculum";

const node = (id: string, gap = false): ConceptNode => ({
  id,
  label: id,
  state: gap ? "gap" : "unknown",
  g: 0,
  week: 0,
  x: 0,
  y: 0,
  ...(gap ? { gap: true } : null),
});

describe("open gaps hold a finished ladder off green", () => {
  const plan = ["consume", "crucible", "retain"] as const;
  const done = ["consume", "crucible"] as const;

  it("is mastered with no gap, learning with one, shaky when a reason holds", () => {
    expect(stateFromPlan(plan, done)).toBe("mastered");
    expect(stateFromPlan(plan, done, { gaps: 1 })).toBe("learning");
    expect(stateFromPlan(plan, done, { gaps: 1, shaky: "crucible-fail" })).toBe("shaky");
  });

  it("does not change a ladder that is not finished", () => {
    expect(stateFromPlan(plan, ["consume"], { gaps: 2 })).toBe("learning");
    expect(stateFromPlan(plan, [], { gaps: 2 })).toBe("unknown");
  });

  it("finds gaps by their flag, dashed edge or not", () => {
    const graph: ConceptGraph = {
      nodes: [node("p"), node("q"), node("g1", true), node("g2", true)],
      // g2's edge came back from the store without its dash.
      edges: [
        ["p", "q"],
        ["p", "g1", true],
        ["p", "g2", false],
      ],
    };
    expect(openGapIds(graph, "p")).toEqual(["g1", "g2"]);
    expect(gapParentOf(graph, "g2")).toBe("p");
    const around = neighboursOf(graph, graph.nodes[0]);
    expect(around.gapIds).toEqual(["g1", "g2"]);
    // A gap is not something the node unlocks.
    expect(around.dependentIds).toEqual(["q"]);
    // And a gap's parent is not its prerequisite.
    expect(neighboursOf(graph, graph.nodes[3])).toMatchObject({
      parentIds: ["p"],
      prereqIds: [],
    });
  });
});

describe("spacing", () => {
  it("holds a slot until a night has passed", () => {
    const now = 1_000_000;
    const hold = holdFrom(now);
    expect(heldUntil(hold, now)).toBe(now + SPACING_MS);
    expect(heldUntil(hold, now + SPACING_MS + 1)).toBeNull();
    expect(heldUntil(undefined, now)).toBeNull();
    expect(heldUntil({ opensAt: "soon" }, now)).toBeNull();
    expect(hoursLeft(now + SPACING_MS, now)).toBe(20);
  });

  it("pushes Recall out after anything studied, but not after Recall itself", () => {
    const plan = ["consume", "connect", "recall", "retain"] as const;
    expect(holdsRecall(plan, ["consume"], "consume")).toBe(true);
    expect(holdsRecall(plan, ["consume", "recall"], "connect")).toBe(false);
    expect(holdsRecall(plan, ["consume"], "recall")).toBe(false);
    expect(holdsRecall(["consume", "crucible", "retain"], [], "consume")).toBe(false);
  });

  it("earns Retained ✓ only across a real interval", () => {
    const day = 86_400_000;
    const now = Date.parse("2026-10-20T12:00:00Z");
    const ago = (d: number) => new Date(now - d * day).toISOString();
    const reviewed = (d: number) => ({ last_review: ago(d), due: ago(0), reps: 2 });
    expect(earnsRetained("good", reviewed(RETAINED_MIN_DAYS), now)).toBe(true);
    expect(earnsRetained("easy", reviewed(30), now)).toBe(true);
    expect(earnsRetained("good", reviewed(1), now)).toBe(false);
    expect(earnsRetained("hard", reviewed(30), now)).toBe(false);
    // Never reviewed: its due date is when it was drafted.
    expect(earnsRetained("good", { due: ago(10), reps: 0 }, now)).toBe(true);
    expect(earnsRetained("good", { due: ago(0), reps: 0 }, now)).toBe(false);
  });
});

describe("the Crucible's guided pass", () => {
  it("is the re-attempt, and its reading is how much transferred", () => {
    expect(crucibleScaffolded(crucibleStart("n"))).toBe(false);
    expect(crucibleScaffolded({ ...crucibleStart("n"), rung: 1 })).toBe(true);
    const rows = (...v: Array<"good" | "red">) =>
      v.map((verdict) => ({ verdict, text: "" }));
    expect(crucibleReal("pass", rows("good", "good", "red"))).toBe(67);
    expect(crucibleReal("partial", rows("red", "red"))).toBe(0);
    expect(crucibleReal("pass", [])).toBe(100);
  });
});

describe("Connect confirms only the learner's own words", () => {
  const content: ElaborationContent = {
    centerId: "c",
    centerLabel: "C",
    encoding: "conceptual",
    detectNote: "",
    center: { x: 0, y: 0 },
    cands: [{ id: "p", label: "P", x: 0, y: 0, rel: "C generalises P to any basis." }],
  };

  it("needs a real draft, and not the suggestion pasted back", () => {
    expect(connectDraftReady("", content.cands[0].rel)).toBe(false);
    expect(connectDraftReady("they are ".repeat(2).trim(), "")).toBe(false);
    expect(CONNECT_MIN_WORDS).toBe(6);
    expect(
      connectDraftReady("  c GENERALISES p to any basis ", content.cands[0].rel),
    ).toBe(false);
    expect(connectDraftReady("P is the special case C starts from.", "")).toBe(true);
  });

  it("ignores a confirm on an empty box", () => {
    const empty = connectReducer(
      connectStart("c"),
      { type: "confirm", id: "p" },
      content,
    );
    expect(empty.linked).toEqual({});
    const drafted = connectReducer(
      connectStart("c"),
      { type: "draft", id: "p", value: "P is the special case C starts from." },
      content,
    );
    expect(connectReducer(drafted, { type: "confirm", id: "p" }, content).linked).toEqual(
      {
        p: true,
      },
    );
  });

  it("does not confirm a link the judge rules false, and never cards the map's sentence", () => {
    const drafted = connectReducer(
      connectStart("c"),
      { type: "draft", id: "p", value: "P is the opposite of C in every case." },
      content,
    );
    const ruled = connectReducer(
      drafted,
      {
        type: "confirm",
        id: "p",
        ruling: { verdict: "false", line: "They are not opposites." },
      },
      content,
    );
    expect(ruled.linked.p).toBe(false);
    expect(ruled.rulings?.p.verdict).toBe("false");
    expect(connectCards(ruled, content)).toEqual([]);
    // A saved session from before rulings reads as none ruled, and a confirmed
    // link with no words of its own drafts no card on the suggestion.
    const legacy = { ...connectStart("c"), linked: { p: true } } as ConnectSession;
    expect(connectCards(legacy, content)).toEqual([]);
  });
});

describe("calibration readings", () => {
  it("is a running mean over every reading, not the last one doubled", () => {
    let samples = mergeCalib([], "n", 90, 0);
    samples = mergeCalib(samples, "n", 90, 0);
    samples = mergeCalib(samples, "n", 90, 90);
    expect(samples).toEqual([{ id: "n", felt: 90, real: 30, n: 3 }]);
    // A sample written before the count existed counts as one reading.
    expect(mergeCalib([{ id: "n", felt: 40, real: 40 }], "n", 80, 80)[0]).toEqual({
      id: "n",
      felt: 60,
      real: 60,
      n: 2,
    });
  });

  it("files a run's tap against the share it got right, once there is one", () => {
    expect(runReading(undefined, 3, 4)).toBeNull();
    expect(runReading(2, 0, 0)).toBeNull();
    expect(runReading(2, 3, 4)).toEqual({ felt: CONFIDENCE_FELT[2], real: 75 });
  });

  it("reads Predict over the forecasts that were rated and committed", () => {
    const content: PredictContent = {
      nodeId: "n",
      nodeLabel: "N",
      setups: ["a", "b", "c"].map((id) => ({
        id,
        situation: "",
        outcomes: ["x", "y"],
        answerIndex: 0,
        because: "",
      })),
    };
    const session = {
      ...predictStart("n"),
      sureness: { a: 2, b: 0, c: 1 },
      forecasts: { a: 0, b: 1 },
    };
    expect(predictCalibration(session, content)).toEqual({ felt: 63, real: 50 });
    expect(predictCalibration(predictStart("n"), content)).toBeNull();
  });

  it("takes a run's tap once, before its first item", () => {
    const cases: DiscriminateContent = {
      nodeId: "n",
      nodeLabel: "N",
      ask: "?",
      cases: [
        {
          id: "a",
          candidate: "",
          readings: ["x"],
          answerIndex: 0,
          decidedBy: "",
          isInstance: true,
        },
      ],
    };
    const sure = discriminateReducer(
      discriminateStart("n"),
      { type: "sure", level: 1 },
      cases,
    );
    expect(sure.sure).toBe(1);
    expect(discriminateReducer(sure, { type: "sure", level: 2 }, cases).sure).toBe(1);

    const reps: DrillContent = {
      nodeId: "n",
      nodeLabel: "N",
      reps: [{ id: "r", prompt: "", answers: ["x"], answerIndex: 0, rule: "" }],
    };
    // The drill's clock starts on the tap, not when the screen opened.
    const drill = drillReducer(
      drillStart("n", 0),
      { type: "sure", level: 0, now: 5000 },
      reps,
    );
    expect(drill).toMatchObject({ sure: 0, openedAt: 5000 });
  });

  it("carries a review card's tap through the flip, and clears it for the next", () => {
    const content: RetainContent = {
      budgetMin: 5,
      cards: ["a", "b"].map((id) => ({
        id,
        type: "recall" as const,
        source: "",
        node: "n",
        back: "",
      })),
    };
    const flipped = retainReducer(retainStart(), { type: "flip", sure: 2 }, content);
    expect(flipped.sure).toBe(2);
    const next = retainReducer(flipped, { type: "grade", grade: "good" }, content);
    expect(next.sure).toBeUndefined();
  });
});

describe("W1.6: early exits and a disconfirmer that can be met", () => {
  it("Trace ends early on a clean opening, and only on one", async () => {
    const { traceEarly, tracePassed, traceStart } = await import("@/lib/curriculum");
    const content = {
      nodeId: "n",
      nodeLabel: "N",
      scenario: "",
      stages: ["a", "b", "c", "d", "e"].map((id) => ({
        id,
        reached: "",
        nexts: ["x", "y"],
        answerIndex: 0,
        handsOn: "",
      })),
    };
    const walked = (...v: number[]) => ({
      ...traceStart("n"),
      walked: Object.fromEntries(v.map((x, i) => [content.stages[i].id, x])),
    });
    expect(traceEarly(walked(0, 0, 0), content)).toBe(true);
    expect(tracePassed(walked(0, 0, 0), content)).toBe(true);
    expect(traceEarly(walked(0, 1, 0), content)).toBe(false);
  });

  it("Provenance ends early only when an `asserts` claim was not taken as proof", async () => {
    const { provenanceEarly, provenanceStart } = await import("@/lib/curriculum");
    const claim = (id: string, ruling: "asserts" | "proves" | "neither") => ({
      id,
      claim: "",
      ruling,
      because: "",
    });
    const content = {
      nodeId: "n",
      nodeLabel: "N",
      source: { title: "", attribution: "", date: "", excerpt: "" },
      silence: "",
      claims: [
        claim("a", "proves"),
        claim("b", "asserts"),
        claim("c", "neither"),
        claim("d", "proves"),
      ],
    };
    const ruled = (r: Record<string, "asserts" | "proves" | "neither">) => ({
      ...provenanceStart("n"),
      rulings: r,
    });
    expect(
      provenanceEarly(ruled({ a: "proves", b: "asserts", c: "neither" }), content),
    ).toBe(true);
    expect(
      provenanceEarly(ruled({ a: "proves", b: "proves", c: "neither" }), content),
    ).toBe(false);
    const noAsserts = {
      ...content,
      claims: [
        claim("a", "proves"),
        claim("b", "proves"),
        claim("c", "neither"),
        claim("d", "asserts"),
      ],
    };
    expect(
      provenanceEarly(ruled({ a: "proves", b: "proves", c: "neither" }), noAsserts),
    ).toBe(false);
  });

  it("Steelman's gate reads the judge's ruling on the disconfirmer, not its length", async () => {
    const { steelmanPassed, steelmanStart } = await import("@/lib/curriculum");
    const content = {
      nodeId: "n",
      nodeLabel: "N",
      question: "",
      positions: [
        { id: "p", label: "", heldBy: "", mustCover: [] },
        { id: "q", label: "", heldBy: "", mustCover: [] },
      ],
    } as never;
    const base = {
      ...steelmanStart("n"),
      verdicts: { p: "strong", q: "strong" } as const,
      disconfirmer: "If new evidence ever emerged that proved me wrong about all of it.",
    };
    expect(steelmanPassed({ ...base, disconfirmerRuling: "vacuous" }, content)).toBe(
      false,
    );
    expect(steelmanPassed({ ...base, disconfirmerRuling: "real" }, content)).toBe(true);
    // A session judged before the ruling existed keeps the old length test.
    expect(steelmanPassed(base, content)).toBe(true);
  });
});

describe("W3.2: earned skips", () => {
  it("a clean first try credits the easier gate before it, and only then", async () => {
    const { ledgerAfter, PHASE_PLAN } = await import("@/lib/curriculum");
    expect(
      ledgerAfter(PHASE_PLAN.concept, ["consume"], "feynman", false, true),
    ).toContain("socratic");
    expect(ledgerAfter(PHASE_PLAN.concept, ["consume"], "feynman", false)).not.toContain(
      "socratic",
    );
    expect(
      ledgerAfter(PHASE_PLAN.procedure, ["consume"], "perform", false, true),
    ).toContain("trace");
    // A credit never reaches past the phase that earned it.
    expect(
      ledgerAfter(PHASE_PLAN.principle, ["consume"], "feynman", false, true),
    ).not.toContain("crucible");
  });
});
