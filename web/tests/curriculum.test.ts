import { describe, expect, it } from "vitest";
import {
  displayStates,
  freshAdherence,
  markTodayMet,
  minutesLeft,
  ledgerAfter,
  proofGate,
  phaseIndex,
  planGates,
  primaryPhase,
  PHASE_ORDER,
  topicDomainOf,
  removeNode,
  rolloverAdherence,
  performPassed,
  performReducer,
  performStart,
  spawnGap,
  stateFromPlan,
  type ConceptGraph,
  LADDER,
  lastGate,
  phasePlan,
} from "@/lib/curriculum";

const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 1, week: 0, x: 0, y: 0 },
    { id: "b", label: "B", state: "unknown", g: 2, week: 0, x: 1, y: 0 },
  ],
  edges: [["a", "b"]],
};

describe("map state", () => {
  it("derives frontier from met prerequisites", () => {
    const display = displayStates({ a: "mastered", b: "unknown" }, graph);
    expect(display.b).toBe("frontier");
  });

  it("a half-finished prerequisite does not unlock what builds on it", () => {
    // `learning` is written on the first check in the reading: starting a
    // concept must not light up its descendants.
    expect(displayStates({ a: "learning", b: "unknown" }, graph).b).toBe("unknown");
    expect(displayStates({ a: "shaky", b: "unknown" }, graph).b).toBe("frontier");
  });

  it("spawnGap is idempotent; removeNode cleans edges", () => {
    const spec = { id: "g1", label: "G", reason: "r", dx: 10, dy: 10 };
    const g1 = spawnGap(graph, "a", spec);
    const g2 = spawnGap(g1, "a", spec);
    expect(g2.nodes.length).toBe(3);
    const g3 = removeNode(g2, "g1");
    expect(g3.nodes.length).toBe(2);
    expect(g3.edges.every(([f, t]) => f !== "g1" && t !== "g1")).toBe(true);
  });

  it("phaseIndex gates Retained on real review history (#13)", () => {
    const plan = LADDER;
    const gates = planGates(plan);
    expect(phaseIndex(plan, gates, "mastered", false)).toBe(plan.length - 1);
    expect(phaseIndex(plan, gates, "mastered", true)).toBe(plan.length);
    expect(phaseIndex(plan, gates.slice(0, -1), "learning", false)).toBe(
      plan.indexOf("perform"),
    );
  });
});

// ---- the phase catalogue ----------------------------------------------------
// These three are load-bearing and silent when broken: a plan that violates
// any of them still renders, it just renders something wrong.

describe("the one ladder", () => {
  it("is the whole catalogue: read, explain, do, keep", () => {
    expect(LADDER).toEqual(["consume", "explain", "perform", "retain"]);
    expect(PHASE_ORDER).toEqual(LADDER);
    expect(lastGate(LADDER)).toBe("perform");
    expect(proofGate(LADDER)).toBe("perform");
  });

  it("every node runs it, whatever it stored", () => {
    expect(phasePlan({ phasePlan: ["consume", "retain"] })).toBe(LADDER);
    expect(phasePlan({})).toBe(LADDER);
  });
});

describe("primaryPhase — what the CTA opens is what the CTA says", () => {
  const plan = LADDER;

  it("names the next unfinished rung", () => {
    expect(primaryPhase(plan, [], "frontier")).toBe("consume");
    expect(primaryPhase(plan, ["consume"], "learning")).toBe("explain");
    expect(primaryPhase(plan, ["consume", "explain"], "learning")).toBe("perform");
  });

  it("has nothing to open once the plan is finished", () => {
    expect(primaryPhase(plan, planGates(plan), "mastered")).toBeUndefined();
  });
});

// ---- the map's domain, read back off its nodes -------------------------------

describe("topicDomainOf", () => {
  it("takes the domain the map was written in", () => {
    expect(topicDomainOf([{ domain: "interpretive" }, { domain: "interpretive" }])).toBe(
      "interpretive",
    );
  });

  it("ignores `general`, which is the absence of an answer", () => {
    // A map where the model labelled most nodes and defaulted the rest has the
    // labelled domain — not a tie it loses to its own defaults.
    expect(
      topicDomainOf([{ domain: "general" }, { domain: "general" }, { domain: "formal" }]),
    ).toBe("formal");
  });

  it("takes the majority when one map holds two", () => {
    // A machine-learning map is mostly `formal` with a few `executable` nodes,
    // and the placement probe wants the shape of the majority.
    expect(
      topicDomainOf([
        { domain: "formal" },
        { domain: "executable" },
        { domain: "formal" },
      ]),
    ).toBe("formal");
  });

  it("falls back to general with nothing to read", () => {
    expect(topicDomainOf([])).toBe("general");
    expect(topicDomainOf([{}, {}])).toBe("general");
  });
});

// ---- what the Crucible is allowed to promise ---------------------------------

// ---- the six phases of the catalogue's growth to twelve -----------------------
// Each owns its own gate, and the gates differ on purpose: what counts as
// passing a retrieval is not what counts as passing a run, and neither is what
// counts as having walked a chain. These pin the differences, because a gate
// that quietly became a shared two-thirds threshold would be the six phases
// collapsing back into two with extra files.

describe("perform", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The procedure",
    task: "this case",
    scaffold: "start here",
    steps: [
      { id: "s1", step: "one", mustShow: ["x"], loadBearing: true },
      { id: "s2", step: "two", mustShow: ["y"], loadBearing: true },
      { id: "s3", step: "check", mustShow: ["z"], loadBearing: false },
    ],
  };
  const reported = (v: Record<string, "good" | "skipped" | "confused">) => ({
    ...performStart("n"),
    reported: true,
    ran: v,
  });

  it("fails on any wrong step, however much else was right", () => {
    expect(
      performPassed(reported({ s1: "good", s2: "confused", s3: "good" }), content),
    ).toBe(false);
  });

  it("passes a right run that left out one or two steps", () => {
    expect(performPassed(reported({ s1: "good", s2: "skipped" }), content)).toBe(true);
    expect(performPassed(reported({ s1: "good" }), content)).toBe(true);
  });

  it("fails a run with nothing carried out", () => {
    expect(performPassed(reported({}), content)).toBe(false);
  });

  it("fixing keeps the work, clears the report, and remembers what broke", () => {
    const failed = {
      ...reported({ s1: "good", s2: "confused" }),
      work: "my run",
      response: "r",
    };
    const fixing = performReducer(failed, { type: "fix", steps: ["two"] });
    expect(fixing.work).toBe("my run");
    expect(fixing.reported).toBe(false);
    expect(fixing.ran).toEqual({});
    expect(fixing.fixing).toEqual(["two"]);
  });

  it("fixing keeps the quotes so the view can land on the broken line", () => {
    const failed = { ...reported({ s2: "confused" }), quotes: { s2: "x = 4" } };
    expect(performReducer(failed, { type: "fix", steps: ["two"] }).quotes).toEqual({
      s2: "x = 4",
    });
  });

  it("opens the report on the streamed verdicts and settles on the final one", () => {
    const ran = { s1: "good" as const };
    let s = performReducer({ ...performStart("n"), work: "w" }, { type: "pending" });
    s = performReducer(s, {
      type: "report",
      response: "",
      pending: true,
      ran,
      quotes: {},
    });
    expect(s.reported && s.pending).toBe(true);
    s = performReducer(s, { type: "stream", text: "half" });
    expect(s.response).toBe("half");
    s = performReducer(s, { type: "report", response: "whole", ran, quotes: {} });
    expect(s).toMatchObject({ reported: true, pending: false, response: "whole" });
  });

  it("re-running clears the work and keeps the case", () => {
    const again = performReducer(reported({ s1: "good" }), { type: "rerun" });
    expect(again).toEqual(performStart("n"));
  });
});

// ---- adherence (#22) ----------------------------------------------------------

describe("adherence rollover", () => {
  const day = (iso: string, hhmm = "12:00") => new Date(`${iso}T${hhmm}:00`);

  it("markTodayMet is idempotent and banks a freeze every 7 days", () => {
    let s = freshAdherence(day("2026-07-01"));
    s = { ...s, streak: 6, freezes: 1 };
    s = markTodayMet(s);
    expect(s.streak).toBe(7);
    expect(s.freezes).toBe(2);
    expect(markTodayMet(s)).toBe(s);
  });

  it("met day → streak holds across the rollover", () => {
    let s = freshAdherence(day("2026-07-01"));
    s = markTodayMet(s);
    const next = rolloverAdherence(s, day("2026-07-02"));
    expect(next.streak).toBe(1);
    expect(next.metToday).toBe(false);
    expect(next.history.at(-1)?.status).toBe("today");
    expect(next.history.at(-2)?.status).toBe("hit");
  });

  it("unmet day with a freeze banked → freeze absorbs it", () => {
    let s = freshAdherence(day("2026-07-01"));
    s = { ...s, streak: 4, freezes: 1 };
    const next = rolloverAdherence(s, day("2026-07-02"));
    expect(next.streak).toBe(4);
    expect(next.freezes).toBe(0);
    expect(next.history.at(-2)?.status).toBe("freeze");
  });

  it("unmet day with no freeze → streak resets", () => {
    let s = freshAdherence(day("2026-07-01"));
    s = { ...s, streak: 4, freezes: 0 };
    const next = rolloverAdherence(s, day("2026-07-02"));
    expect(next.streak).toBe(0);
    expect(next.history.at(-2)?.status).toBe("miss");
  });

  it("multiple skipped days each consume a freeze before resetting", () => {
    let s = freshAdherence(day("2026-07-01"));
    s = { ...s, streak: 9, freezes: 1 };
    const next = rolloverAdherence(s, day("2026-07-04"));
    // 3 unmet days, 1 freeze: absorbed, then reset.
    expect(next.streak).toBe(0);
    expect(next.freezes).toBe(0);
  });

  it("same-day rollover is a no-op (23:59 vs 00:01 boundary)", () => {
    const s = markTodayMet(freshAdherence(day("2026-07-01", "23:59")));
    expect(rolloverAdherence(s, day("2026-07-01", "23:59"))).toBe(s);
    const next = rolloverAdherence(s, day("2026-07-02", "00:01"));
    expect(next.metToday).toBe(false);
    expect(next.streak).toBe(1);
  });
});

describe("minutesLeft", () => {
  const node = {
    id: "n",
    label: "N",
    state: "unknown",
    g: 1,
    week: 0,
    x: 0,
    y: 0,
  } as const;
  const gates = planGates(LADDER);

  it("counts only the phases still owed", () => {
    expect(minutesLeft(node, [...gates])).toBe(0);
    expect(minutesLeft(node, ["consume"])).toBeLessThan(minutesLeft(node));
  });

  it("a harder concept costs more", () => {
    expect(minutesLeft({ ...node, difficulty: "hard" })).toBeGreaterThan(
      minutesLeft(node),
    );
    expect(minutesLeft({ ...node, difficulty: "easy" })).toBeLessThan(minutesLeft(node));
  });
});

describe('ledgerAfter — "I already know this" has to be proven', () => {
  const plan = LADDER;

  it("appends the phase that closed, once", () => {
    expect(ledgerAfter(plan, ["consume"], "explain", false)).toEqual([
      "consume",
      "explain",
    ]);
    expect(ledgerAfter(plan, ["consume"], "consume", false)).toEqual(["consume"]);
  });

  it("a challenged pass of Perform credits every gate, never Retain", () => {
    const done = ledgerAfter(plan, [], "perform", true);
    expect(new Set(done)).toEqual(new Set(planGates(plan)));
    expect(done).not.toContain("retain");
    expect(stateFromPlan(plan, done)).toBe("mastered");
  });

  it("credits nothing extra without the challenge, or on any other gate", () => {
    expect(ledgerAfter(plan, [], "perform", false)).toEqual(["perform"]);
    expect(ledgerAfter(plan, [], "explain", true)).toEqual(["explain"]);
  });
});
