import { describe, expect, it } from "vitest";
import {
  applyDiagnosticEffect,
  applyDiagnosticLedger,
  crucibleReducer,
  crucibleStart,
  daysUntil,
  diagnosticEffect,
  displayStates,
  feynmanGapCount,
  feynmanGaps,
  feynmanReducer,
  feynmanStart,
  freshAdherence,
  markTodayMet,
  paceStatus,
  minutesLeft,
  ledgerAfter,
  nodeAxes,
  PHASE_MINUTES,
  crucibleMasters,
  phaseIndex,
  planGates,
  primaryPhase,
  LEGACY_PHASE_PLAN,
  NODE_KINDS,
  PHASE_DEFS,
  PHASE_ORDER,
  PHASE_PLAN,
  DOMAINS,
  DOMAIN_PLAN,
  asDomain,
  resolvePlan,
  topicDomainOf,
  removeNode,
  rolloverAdherence,
  discriminateFalsePositives,
  discriminatePassed,
  discriminateReducer,
  discriminateStart,
  drillLabored,
  drillMedianMs,
  drillPassed,
  drillReducer,
  drillStart,
  performPassed,
  performReducer,
  performStart,
  predictOverconfident,
  predictReducer,
  predictStart,
  recallPassed,
  recallReducer,
  recallScore,
  recallStart,
  traceBreak,
  tracePassed,
  traceReducer,
  traceStart,
  shakyLine,
  socraticOutcome,
  socraticReducer,
  verdictReady,
  socraticPlan,
  socraticStart,
  type ReplyQuality,
  SOCRATIC_STEPS,
  recordMisconception,
  recurringMisconceptions,
  spawnGap,
  stateFromPlan,
  stepDifficulty,
  type ConceptGraph,
  type CrucibleContent,
  type FeynmanBeat,
  type SocraticSession,
  type ConceptEdge,
  type SocraticStep,
  type StateMap,
} from "@/lib/curriculum";

// ---- adaptive placement: difficulty ladder + luck-discounted grading --------

describe("stepDifficulty", () => {
  it("steps one level harder on correct, easier on a miss", () => {
    expect(stepDifficulty("medium", true)).toBe("hard");
    expect(stepDifficulty("medium", false)).toBe("easy");
  });

  it("clamps at both ends of the ladder", () => {
    expect(stepDifficulty("hard", true)).toBe("hard");
    expect(stepDifficulty("easy", false)).toBe("easy");
  });
});

describe("diagnosticEffect", () => {
  it("marks a correct answer mastered", () => {
    expect(diagnosticEffect("medium", true, null)).toBe("mastered");
  });

  it("marks a miss with no prior evidence shaky (a genuine gap)", () => {
    expect(diagnosticEffect("easy", false, null)).toBe("shaky");
  });

  it("discounts a miss strictly easier than evidence already proven (an ENEM-style luck slip)", () => {
    // Aced a hard question, then fumbled an easy one — noise, not a gap.
    expect(diagnosticEffect("easy", false, "hard")).toBe("mastered");
  });

  it("still calls a miss shaky when it's harder than anything proven so far", () => {
    // Only proven medium; missing hard is real, uncovered evidence.
    expect(diagnosticEffect("hard", false, "medium")).toBe("shaky");
  });

  it("does not discount a miss at the level it has only matched", () => {
    // One medium right, one medium wrong is a coin flip, not proof — and the
    // write it would trigger (prune the whole chain) can't be taken back.
    expect(diagnosticEffect("medium", false, "medium")).toBe("shaky");
  });
});

describe("applyDiagnosticEffect", () => {
  // a → b → c, plus an unrelated d.
  const edges: ConceptEdge[] = [
    ["a", "b"],
    ["b", "c"],
  ];
  const states: StateMap = {
    a: "unknown",
    b: "unknown",
    c: "unknown",
    d: "unknown",
  };

  it("prunes the whole prerequisite chain on a correct answer", () => {
    expect(applyDiagnosticEffect(states, "mastered", "c", edges)).toEqual({
      a: "mastered",
      b: "mastered",
      c: "mastered",
      d: "unknown",
    });
  });

  it("leaves the prerequisite chain alone on a genuine miss", () => {
    // The reason they missed "c" most likely lives in a or b — marking those
    // mastered would prune the answer out of the map.
    expect(applyDiagnosticEffect(states, "shaky", "c", edges)).toEqual({
      a: "unknown",
      b: "unknown",
      c: "shaky",
      d: "unknown",
    });
  });
});

// ---- fixtures ---------------------------------------------------------------

const steps: SocraticStep[] = [0, 1].map((i) => ({
  id: `s${i + 1}`,
  move: "Clarify",
  prompt: `probe ${i}`,
  replies: [
    { label: "right", quality: "correct", response: "yes" },
    { label: "wrongish", quality: "wrong", response: "caught" },
    { label: "close", quality: "near", response: "hint" },
  ],
  hint: "hint",
  tell: "the answer",
}));

/** One judged turn, the way both clients drive a step: the answer lands in the
 *  transcript and the verdict fills the bubble opened beside it. The scripted
 *  `reply` action is gone — neither client ever rendered the replies as
 *  buttons, so a typed answer is the only move a learner has. */
const answered = (
  s: SocraticSession,
  quality: ReplyQuality,
  list: SocraticStep[],
  covered?: number[],
) =>
  socraticReducer(
    socraticReducer(s, { type: "answer", text: "…" }, list),
    { type: "judged", answer: "…", quality, response: `r:${quality}`, covered },
    list,
  );

const beats: FeynmanBeat[] = [0, 1].map((i) => ({
  id: `b${i + 1}`,
  subPoint: `point ${i}`,
  mustConvey: [`the thing point ${i} has to get across`],
  fix: {
    probe: "fix probe",
    replies: [
      { label: "right", correct: true, response: "yes" },
      { label: "wrong", correct: false, response: "no" },
    ],
  },
  gap: {
    id: `gap-b${i + 1}`,
    label: `gap ${i}`,
    reason: "why",
    dx: 0,
    dy: 100,
  },
}));

const crucibleContent: CrucibleContent = {
  centerId: "n1",
  centerLabel: "Node",
  draws: ["Vectors"],
  rungs: [{ label: "r0" }, { label: "r1" }],
  gap: { id: "gap-cru-n1", label: "gap", reason: "why", dx: 100, dy: 50 },
  problems: [
    { tag: "novel", q: "q0", hint: "h0", placeholder: "p", sample: "s" },
    { tag: "guided", q: "q1", hint: "h1", placeholder: "p", sample: "s" },
  ],
  transfer: [
    { verdict: "good", text: "a" },
    { verdict: "red", text: "b" },
  ],
  reExplain: "re",
};

const graph: ConceptGraph = {
  nodes: [
    { id: "a", label: "A", state: "unknown", g: 1, week: 0, x: 0, y: 0 },
    { id: "b", label: "B", state: "unknown", g: 2, week: 0, x: 1, y: 0 },
  ],
  edges: [["a", "b"]],
};

// ---- socratic ---------------------------------------------------------------

describe("socraticReducer", () => {
  it("advances on a correct answer and reopens the next step at the floor", () => {
    const s = socraticStart("n", steps);
    const next = answered(s, "correct", steps);
    expect(next.step).toBe(1);
    // A pass opens at the top of the ladder, and every step reopens there:
    // scaffolding spent on one probe is not carried into the next as a debt.
    expect(next.help).toBe(0);
    expect(next.resolutions).toEqual(["unaided"]);
  });

  it("judged wrong answers raise help and never advance (#25)", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(
      s,
      {
        type: "judged",
        answer: "scalar mult rotates",
        quality: "wrong",
        response: "caught: it scales",
      },
      steps,
    );
    expect(next.step).toBe(0);
    // One rung down from Silent, not two: the pass no longer opens mid-ladder.
    expect(next.help).toBe(1);
    expect(next.log.at(-1)?.tone).toBe("catch");
  });

  it("judged correct answers advance", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(
      s,
      {
        type: "judged",
        answer: "it scales the vector",
        quality: "correct",
        response: "right",
      },
      steps,
    );
    expect(next.step).toBe(1);
  });

  it("'answer' posts the answer at once, and the verdict fills that same bubble", () => {
    const s = socraticStart("n", steps);
    const sent = socraticReducer(s, { type: "answer", text: "it scales it" }, steps);
    expect(sent.log.at(-2)).toMatchObject({
      role: "learner",
      text: "it scales it",
    });
    expect(sent.log.at(-1)).toMatchObject({ role: "ai", pending: true });
    const judged = socraticReducer(
      sent,
      {
        type: "judged",
        answer: "it scales it",
        quality: "correct",
        response: "right",
      },
      steps,
    );
    // One learner line, not two — and the pending bubble became the response.
    expect(judged.log.filter((t) => t.role === "learner")).toHaveLength(1);
    expect(judged.log.some((t) => t.pending)).toBe(false);
    expect(judged.step).toBe(1);
  });

  it("'tell' advances and counts", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(s, { type: "tell" }, steps);
    expect(next.step).toBe(1);
    expect(next.tells).toBe(1);
  });

  it("setHelp sets the floor, raises the live rung, and never lowers it", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "setHelp", level: 3 }, steps);
    expect(s.floor).toBe(3);
    expect(s.help).toBe(3);
    // Lowering the dial takes effect on the *next* probe — help already given
    // cannot be taken back, so the live rung holds.
    s = socraticReducer(s, { type: "setHelp", level: 0 }, steps);
    expect(s.floor).toBe(0);
    expect(s.help).toBe(3);
    // And it is a control, not a verdict: it still works on a finished pass.
    s = { ...s, done: true };
    expect(socraticReducer(s, { type: "setHelp", level: 2 }, steps).floor).toBe(2);
  });

  it("downgrades to a hint resolution once the step cost a rung (#C)", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "stuck" }, steps);
    // The rung *is* the record of assistance — there is no separate flag.
    expect(s.help).toBe(1);
    s = answered(s, "correct", steps);
    expect(s.resolutions).toEqual(["hint"]);
    expect(s.help).toBe(0);
  });

  it("records 'told' for 'tell' and for a judged 'lost' verdict", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "tell" }, steps);
    expect(s.resolutions).toEqual(["told"]);
    // A "lost" answer drops two rungs rather than teaching outright — from the
    // top that is Guide, which is a real chance rather than a verdict. It is
    // the *second* one that lands on the bottom rung and closes the step.
    s = answered(s, "lost", steps);
    expect(s.resolutions).toEqual(["told"]);
    expect(s.help).toBe(2);
    s = answered(s, "lost", steps);
    expect(s.resolutions).toEqual(["told", "told"]);
    expect(s.done).toBe(true);
  });
});

// ---- the ladder: every step ends, and progress is never a penalty ---------
//
// What these pin is the failure the phase shipped with: `near`/`wrong` did not
// advance and nothing capped the attempts, so the only exit from a hard step
// was "Just tell me" — which was also the metric the pass was judged on. A
// learner could answer fifty times and still be on probe 1.

describe("the Socratic ladder", () => {
  const four = [0, 1, 2, 3].map((i) => ({ ...steps[0], id: `s${i + 1}` }));

  it("always closes a step, however badly it goes", () => {
    let s = socraticStart("n", four, 4);
    // Fifty near misses used to leave the learner on probe 0 forever.
    for (let i = 0; i < 50; i++) s = answered(s, "near", four);
    expect(s.resolutions.length).toBeGreaterThan(0);
    expect(s.step).toBeGreaterThan(0);
  });

  it("teaches and closes on the bottom rung rather than asking again", () => {
    let s = socraticStart("n", four, 4);
    s = answered(s, "near", four); // → Hint
    expect(s.step).toBe(0);
    s = answered(s, "near", four); // → Guide
    expect(s.step).toBe(0);
    s = answered(s, "near", four); // → Show me: taught, closed
    expect(s.resolutions).toEqual(["told"]);
    expect(s.step).toBe(1);
    // The tutor said the whole thing — the step never ends on a dead dock.
    expect(s.log.at(-2)).toMatchObject({ text: four[0].tell, tone: "teach" });
  });

  it("banks a partial answer, holds the rung, and still earns unaided", () => {
    let s = socraticStart("n", four, 4);
    s = answered(s, "partial", four, [0]);
    expect(s.step).toBe(0);
    expect(s.help).toBe(0); // the rung held — nothing was named
    expect(s.covered).toEqual([0]);
    s = answered(s, "correct", four, [0, 1]);
    // Answering in two turns is not a defect: the pass still reads it as work
    // the learner did unaided.
    expect(s.resolutions).toEqual(["unaided"]);
    expect(socraticOutcome(s, true)).toBe("unaided");
  });

  it("clears the ledger when the next step opens", () => {
    let s = socraticStart("n", four, 4);
    s = answered(s, "partial", four, [1]);
    s = answered(s, "correct", four, [0, 1]);
    expect(s.covered).toEqual([]);
  });

  it("charges a partial that banks nothing, so a step cannot stall on it", () => {
    const barred = four.map((x) => ({ ...x, sufficient: ["a", "b"] }));
    let s = socraticStart("n", barred, 4);
    s = answered(s, "partial", barred, [0]);
    expect(s.help).toBe(0); // banked a piece — free
    s = answered(s, "partial", barred, [0]);
    expect(s.help).toBe(1); // added nothing — costs what `near` does
    // A judge that keeps saying "partial" still reaches the bottom and closes.
    for (let i = 0; i < 5; i++) s = answered(s, "partial", barred, [0]);
    expect(s.resolutions).toEqual(["told"]);
  });

  it("holds a streamed partial back until its ledger is known", () => {
    expect(verdictReady({ quality: "partial" }, ["a", "b"])).toBe(false);
    expect(verdictReady({ quality: "partial", covered: [] }, ["a", "b"])).toBe(true);
    expect(verdictReady({ quality: "partial" }, [])).toBe(true);
    expect(verdictReady({ quality: "near" }, ["a", "b"])).toBe(true);
    expect(verdictReady({}, ["a"])).toBe(false);
  });

  it("credits a recovered error as hint, not as told", () => {
    let s = socraticStart("n", four, 4);
    s = answered(s, "wrong", four);
    expect(s.help).toBe(1);
    s = answered(s, "correct", four);
    // Caught, corrected, recovered — that advances and closes the phase. It
    // just is not top marks.
    expect(s.resolutions).toEqual(["hint"]);
    expect(socraticOutcome(s, false)).not.toBe("flagged");
  });

  it("opens every step at the floor the learner set, and caps it there", () => {
    let s = socraticStart("n", four, 4);
    s = socraticReducer(s, { type: "setHelp", level: 2 }, four);
    s = answered(s, "correct", four);
    // Opening at Guide is an honest trade: the best a step can earn is "hint".
    expect(s.resolutions).toEqual(["hint"]);
    expect(s.help).toBe(2);
  });

  it("reaches the bottom from a manual 'stuck' too, and closes there", () => {
    let s = socraticStart("n", four, 4);
    s = socraticReducer(s, { type: "stuck" }, four); // → Hint
    s = socraticReducer(s, { type: "stuck" }, four); // → Guide
    expect(s.step).toBe(0);
    s = socraticReducer(s, { type: "stuck" }, four); // → taught, closed
    expect(s.resolutions).toEqual(["told"]);
    expect(s.step).toBe(1);
  });
});

// A pass saved before the ladder shipped has no `floor`, `covered` or `bar`.
// Persistence is a JSON boundary, so the types say otherwise and nothing fails
// until the view reads `session.bar.length` — which is exactly how this
// reached production: the Socratic screen crashed on a resumed pass.

describe("a Socratic pass saved before the ladder", () => {
  const legacy = () =>
    ({
      nodeId: "n",
      step: 0,
      help: 1,
      log: [{ role: "ai", text: "probe 0" }],
      tells: 0,
      resolutions: [],
      total: 2,
      awaitingNext: false,
      done: false,
    }) as unknown as SocraticSession;

  it("comes back with a floor, a ledger and this probe's bar", () => {
    const withBar = steps.map((x) => ({ ...x, sufficient: ["a", "b"] }));
    const s = socraticReducer(legacy(), { type: "hydrate" }, withBar);
    expect(s.floor).toBe(0);
    expect(s.covered).toEqual([]);
    expect(s.bar).toEqual(["a", "b"]);
  });

  it("is answerable rather than throwing, and keeps its transcript", () => {
    const s = answered(legacy(), "correct", steps);
    expect(s.log[0].text).toBe("probe 0");
  });

  it("reopens at the floor rather than reading the old dial as a rung", () => {
    // Saved at the old model's maximum. Read as a rung that would be the
    // bottom one, which is terminal — the next answer would close as `told`
    // on a probe nobody has been helped with.
    const maxed = { ...legacy(), help: 3 } as SocraticSession;
    const s = socraticReducer(maxed, { type: "hydrate" }, steps);
    expect(s.help).toBe(0);
    expect(answered(maxed, "correct", steps).resolutions).toEqual(["unaided"]);
  });
});

// ---- socratic outcome (#C) — "done" is not automatically "understood" ------

describe("socraticOutcome", () => {
  it("earns 'unaided' when every step went clean, and closes a gap pass", () => {
    let s = socraticStart("n", steps);
    for (let i = 0; i < steps.length; i++) s = answered(s, "correct", steps);
    expect(s.done).toBe(true);
    expect(socraticOutcome(s, false)).toBe("unaided");
    expect(socraticOutcome(s, true)).toBe("unaided");
  });

  it("softens to 'assisted' on a regular node with one hint; a gap still closes (reconstructed, not told)", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "stuck" }, steps);
    s = answered(s, "correct", steps); // step 0: hint
    s = answered(s, "correct", steps); // step 1: unaided
    expect(s.done).toBe(true);
    expect(socraticOutcome(s, false)).toBe("assisted");
    expect(socraticOutcome(s, true)).toBe("unaided");
  });

  it("flags a regular node once told twice — no Feynman hand-off, no closed gap", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "tell" }, steps);
    s = socraticReducer(s, { type: "tell" }, steps);
    expect(s.done).toBe(true);
    expect(s.resolutions).toEqual(["told", "told"]);
    expect(socraticOutcome(s, false)).toBe("flagged");
  });
});

// ---- adaptive length (#D) — the fifth pre-generated step earns its keep ----

describe("socraticReducer adaptive length", () => {
  it("ends a pass early after three unaided answers running, even with a step to spare", () => {
    const four = [0, 1, 2, 3].map((i) => ({ ...steps[0], id: `s${i + 1}` }));
    let s = socraticStart("n", four);
    for (let i = 0; i < 3; i++) s = answered(s, "correct", four);
    expect(s.done).toBe(true);
    expect(s.total).toBe(3);
    expect(s.resolutions).toEqual(["unaided", "unaided", "unaided"]);
  });

  it("buys probes, one per two assisted steps running, while spares last", () => {
    // A two-probe plan with two spares written behind it.
    const four = [0, 1, 2, 3].map((i) => ({ ...steps[0], id: `s${i + 1}` }));
    const assisted = (x: SocraticSession) =>
      answered(socraticReducer(x, { type: "stuck" }, four), "correct", four);
    let s = socraticStart("n", four, 2);
    s = assisted(s); // step 0: hint
    s = assisted(s); // step 1: hint → buys the first spare
    expect(s.total).toBe(3);
    expect(s.done).toBe(false);
    s = assisted(s); // step 2: hint → buys the second
    expect(s.total).toBe(4);
    expect(s.done).toBe(false);
    expect(s.step).toBe(3);
  });

  it("buys nothing for a learner who is only asking to be told", () => {
    const four = [0, 1, 2, 3].map((i) => ({ ...steps[0], id: `s${i + 1}` }));
    let s = socraticStart("n", four, 2);
    s = socraticReducer(s, { type: "tell" }, four); // step 0: told
    s = socraticReducer(s, { type: "tell" }, four); // step 1: told → the pass ends
    expect(s.total).toBe(2);
    expect(s.done).toBe(true);
    // …and it ends flagged, which routes back into the reading.
    expect(socraticOutcome(s, false)).toBe("flagged");
  });

  it("a re-cap shortens a pass that came up short, but never undoes a bought probe", () => {
    const four = [0, 1, 2, 3].map((i) => ({ ...steps[0], id: `s${i + 1}` }));
    let s = socraticStart("n", four, 2);
    for (let i = 0; i < 2; i++) {
      s = socraticReducer(s, { type: "stuck" }, four);
      s = answered(s, "correct", four);
    }
    expect(s.total).toBe(3);
    // The whole written pass landing must not stretch the plan back out to 4.
    expect(socraticReducer(s, { type: "hydrate", total: four.length }, four).total).toBe(
      3,
    );
  });
});

// ---- the pass length is the concept's, not a constant ----------------------

// The floors the right-sizing opened up: a pass is as long as the concept
// earns, so the shortest legal one — two core probes and a single spare — must
// still reach `done`, and a session opened on the streaming estimate must be
// capped down to that plan rather than running the estimate out.
describe("a smallest-legal Socratic pass", () => {
  const written: SocraticStep[] = [
    steps[0],
    steps[1],
    { ...steps[0], id: "s3", spare: true },
  ];

  it("finishes on its two core probes", () => {
    let s = socraticStart("n", written, socraticPlan(written));
    expect(s.total).toBe(2);
    s = answered(s, "correct", written);
    expect(s.done).toBe(false);
    s = answered(s, "correct", written);
    expect(s.done).toBe(true);
  });

  it("caps a session opened on the four-step streaming estimate down to the plan", () => {
    const opened = socraticStart("n", [], SOCRATIC_STEPS);
    const hydrated = socraticReducer(
      opened,
      { type: "hydrate", total: socraticPlan(written) },
      written,
    );
    expect(hydrated.total).toBe(2);
  });

  it("still holds a spare a struggling learner can buy", () => {
    let s = socraticStart("n", written, socraticPlan(written));
    // Two assisted steps running buy one more probe — the spare, and only it.
    s = socraticReducer(s, { type: "stuck" }, written);
    s = answered(s, "correct", written);
    s = socraticReducer(s, { type: "stuck" }, written);
    s = answered(s, "correct", written);
    expect(s.total).toBe(3);
    expect(s.done).toBe(false);
  });
});

describe("socraticPlan", () => {
  it("counts the core probes and leaves the spares out", () => {
    const written: SocraticStep[] = [
      steps[0],
      steps[1],
      { ...steps[0], id: "s3", spare: true },
      { ...steps[0], id: "s4", spare: true },
    ];
    expect(socraticPlan(written)).toBe(2);
    // Nothing marked (a pass cached before spares existed) plans all of it.
    expect(socraticPlan(steps)).toBe(2);
  });
});

// ---- misconception memory (across nodes, across sessions) ------------------

describe("misconception roll-up", () => {
  it("merges a repeat into a count rather than a second entry", () => {
    let list = recordMisconception([], "Treats scaling as rotation", "Linear maps");
    list = recordMisconception(list, "treats scaling as ROTATION", "Eigenvectors");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 2, node: "Eigenvectors" });
  });

  it("only names what the learner keeps coming back to", () => {
    let list = recordMisconception([], "seen once", "A");
    list = recordMisconception(list, "seen twice", "A");
    list = recordMisconception(list, "seen twice", "B");
    const recurring = recurringMisconceptions(list);
    expect(recurring).toHaveLength(1);
    expect(recurring[0]).toContain("seen twice");
    expect(recurring[0]).toContain("2×");
  });

  it("ignores an empty tag and stays bounded", () => {
    expect(recordMisconception([], "   ", "A")).toEqual([]);
    let list = recordMisconception([], "m0", "A");
    for (let i = 1; i < 40; i++) list = recordMisconception(list, `m${i}`, "A");
    expect(list.length).toBeLessThanOrEqual(24);
    // The most recent survive the cap.
    expect(list.at(-1)?.label).toBe("m39");
  });
});

// ---- resuming with nothing arrived yet (bug: total got clamped to 1) -------

describe("socraticReducer hydrate against an empty step list", () => {
  it("does not clamp a resumed session's total down when no steps have arrived yet", () => {
    // A pass saved mid-way through step 1 of a 4-step plan…
    let saved = socraticStart("n", steps.slice(0, 1), 4);
    saved = answered(saved, "correct", steps.slice(0, 1));
    expect(saved.step).toBe(1);
    // …reopened while its steps are still streaming in from scratch (`open([], total)`
    // in AtlasApp's `enterSocratic`) must not shrink the plan to 2.
    const reopened = socraticReducer(saved, { type: "hydrate", total: 4 }, []);
    expect(reopened.total).toBe(4);
  });
});

// Both passes stream their items in one at a time. Before this, the reducers
// derived "am I on the last one?" from the array's length, so answering the
// first question while the rest were still being written ended the session —
// silently, and only under a slow writer. `total` is what fixes that, and
// these are the cases that would have caught it.

describe("socraticReducer against a growing step list", () => {
  it("does not end the session when only the first step has arrived", () => {
    const arrived = steps.slice(0, 1);
    const s = socraticStart("n", arrived, steps.length);
    const next = answered(s, "correct", arrived);
    expect(next.done).toBe(false);
    expect(next.step).toBe(1);
    // Parked on a step that exists in the plan but hasn't been written yet.
    expect(next.awaitingNext).toBe(true);
  });

  it("ignores input while parked, rather than throwing on a missing step", () => {
    const arrived = steps.slice(0, 1);
    let s = socraticStart("n", arrived, steps.length);
    s = answered(s, "correct", arrived);
    expect(() => answered(s, "correct", arrived)).not.toThrow();
    expect(socraticReducer(s, { type: "tell" }, arrived)).toEqual(s);
  });

  it("opens the parked step once it lands", () => {
    let s = socraticStart("n", steps.slice(0, 1), steps.length);
    s = answered(s, "correct", steps.slice(0, 1));
    s = socraticReducer(s, { type: "hydrate" }, steps);
    expect(s.awaitingNext).toBe(false);
    expect(s.step).toBe(1);
    expect(s.log.at(-1)?.text).toBe(steps[1].prompt);
  });

  it("still ends on the real last step", () => {
    let s = socraticStart("n", steps);
    for (let i = 0; i < steps.length; i++) s = answered(s, "correct", steps);
    expect(s.done).toBe(true);
  });

  it("closes the session when the stream ended short of the plan", () => {
    const arrived = steps.slice(0, 1);
    let s = socraticStart("n", arrived, steps.length);
    s = answered(s, "correct", arrived);
    // The stream finished with only one step: re-cap and the pass is over.
    s = socraticReducer(s, { type: "hydrate", total: 1 }, arrived);
    expect(s.done).toBe(true);
  });

  // How re-entering a saved pass reopens it (AtlasApp `enterSocratic`).
  it("resumes a saved session, parked or not, on the step it stopped at", () => {
    const arrived = steps.slice(0, 1);
    let saved = socraticStart("n", arrived, steps.length);
    saved = answered(saved, "correct", arrived);
    expect(saved.awaitingNext).toBe(true);
    // Reopened later, with every step now cached.
    const resumed = socraticReducer(
      saved,
      { type: "hydrate", total: steps.length },
      steps,
    );
    expect(resumed.step).toBe(1);
    expect(resumed.awaitingNext).toBe(false);
    expect(resumed.done).toBe(false);
    expect(resumed.log.at(-1)?.text).toBe(steps[1].prompt);
    // An unparked one comes back untouched.
    expect(
      socraticReducer(resumed, { type: "hydrate", total: steps.length }, steps),
    ).toEqual(resumed);
  });
});

describe("feynmanReducer", () => {
  it("diffs the whole explanation in one pass and opens the Gap Report (#26)", () => {
    const s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "my words",
        verdicts: { b1: "confused", b2: "good" },
        quotes: { b1: "it just rotates" },
        jargon: ["eigenbasis"],
        response: "huh?",
      },
      beats,
    );
    expect(s.reported).toBe(true);
    expect(s.verdicts).toEqual({ b1: "confused", b2: "good" });
    expect(s.quotes.b1).toBe("it just rotates");
    expect(s.jargon).toEqual(["eigenbasis"]);
    expect(s.explanation).toBe("my words");
  });

  it("a sub-point the judge never ruled on counts as never explained", () => {
    const s = feynmanReducer(
      feynmanStart("n"),
      { type: "taught", text: "t", verdicts: { b1: "good" }, response: "r" },
      beats,
    );
    // Silence is a skip: an unmentioned row must never grade as taught.
    expect(s.verdicts).toEqual({ b1: "good", b2: "skipped" });
  });

  it("grades against the rubric rows that arrived, not the ones that didn't", () => {
    const arrived = beats.slice(0, 1);
    const s = feynmanReducer(
      feynmanStart("n"),
      { type: "taught", text: "t", verdicts: { b1: "good" }, response: "r" },
      arrived,
    );
    expect(s.verdicts).toEqual({ b1: "good" });
    expect(s.reported).toBe(true);
  });

  it("the student's reaction streams into the open report", () => {
    let s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "good", b2: "good" },
        response: "",
        pending: true,
      },
      beats,
    );
    s = feynmanReducer(s, { type: "stream", text: "so you mean", pending: true }, beats);
    expect(s.response).toBe("so you mean");
    expect(s.pending).toBe(true);
    s = feynmanReducer(s, { type: "stream", text: "so you mean X." }, beats);
    expect(s.pending).toBe(false);
  });

  it("a retry fills the reaction into a report settled by a failed stream", () => {
    // The judge stream died after the verdicts frame, so the session was
    // settled (`pending: false`) with an empty reaction. Its retry has to be
    // able to write into that open report — gating `stream` on `pending` made
    // the retry a silent no-op and left the pass unsaveable.
    let s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "good", b2: "good" },
        response: "",
        pending: true,
      },
      beats,
    );
    s = { ...s, pending: false };
    s = feynmanReducer(s, { type: "stream", text: "so you mean X." }, beats);
    expect(s.response).toBe("so you mean X.");
    expect(s.pending).toBe(false);
  });

  it("a late frame from a pass the learner reset is dropped", () => {
    let s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "good", b2: "good" },
        response: "",
        pending: true,
      },
      beats,
    );
    s = feynmanReducer(s, { type: "teachAgain" }, beats);
    s = feynmanReducer(s, { type: "stream", text: "stale reaction" }, beats);
    expect(s.response).toBe("");
  });

  it("a correct fix flips the verdict to good", () => {
    let s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "confused", b2: "good" },
        response: "r",
      },
      beats,
    );
    s = feynmanReducer(s, { type: "openFix", beatId: "b1" }, beats);
    s = feynmanReducer(s, { type: "fix", index: 0 }, beats);
    expect(s.verdicts["b1"]).toBe("good");
  });

  it("teaching it again keeps the last pass's verdicts for the delta", () => {
    let s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "skipped", b2: "good" },
        response: "r",
      },
      beats,
    );
    s = feynmanReducer(s, { type: "teachAgain" }, beats);
    expect(s.reported).toBe(false);
    expect(s.verdicts).toEqual({});
    expect(s.previous).toEqual({ b1: "skipped", b2: "good" });
    expect(feynmanGapCount(s.previous!, beats)).toBe(1);
  });
});

describe("feynmanGaps", () => {
  it("quotes the learner's own words back on the gap it writes to the map", () => {
    const s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "confused", b2: "good" },
        quotes: { b1: "it just rotates" },
        response: "r",
      },
      beats,
    );
    const [gap] = feynmanGaps(s, beats);
    expect(gap.id).toBe("gap-b1");
    expect(gap.reason).toBe('You said: "it just rotates" — why');
  });

  it("falls back to the written reason when nothing was quotable", () => {
    const s = feynmanReducer(
      feynmanStart("n"),
      {
        type: "taught",
        text: "t",
        verdicts: { b1: "skipped", b2: "good" },
        response: "r",
      },
      beats,
    );
    expect(feynmanGaps(s, beats)[0].reason).toBe("why");
  });
});

// ---- crucible ---------------------------------------------------------------

describe("crucibleReducer", () => {
  it("judged result sets outcome and attempt-grounded transfer (#27)", () => {
    let s = crucibleStart("n1");
    s = crucibleReducer(s, { type: "confidence", level: 2 }, crucibleContent);
    s = crucibleReducer(
      s,
      { type: "attempt", value: "my real attempt" },
      crucibleContent,
    );
    const rows = [
      { verdict: "good" as const, text: "x" },
      { verdict: "red" as const, text: "y" },
    ];
    s = crucibleReducer(
      s,
      { type: "result", outcome: "partial", transfer: rows },
      crucibleContent,
    );
    expect(s.submitted).toBe(true);
    expect(s.outcome).toBe("partial");
    expect(s.transfer).toEqual(rows);
  });

  it("an empty attempt can never be submitted", () => {
    let s = crucibleStart("n1");
    s = crucibleReducer(s, { type: "confidence", level: 0 }, crucibleContent);
    s = crucibleReducer(
      s,
      { type: "result", outcome: "pass", transfer: [] },
      crucibleContent,
    );
    expect(s.submitted).toBe(false);
    expect(s.outcome).toBeNull();
  });

  it("retry re-asks confidence — calibration fires on every attempt", () => {
    let s = crucibleStart("n1");
    s = crucibleReducer(s, { type: "confidence", level: 2 }, crucibleContent);
    s = crucibleReducer(s, { type: "attempt", value: "attempt" }, crucibleContent);
    s = crucibleReducer(
      s,
      {
        type: "result",
        outcome: "partial",
        transfer: [{ verdict: "red", text: "t" }],
      },
      crucibleContent,
    );
    s = crucibleReducer(s, { type: "retry" }, crucibleContent);
    expect(s.stage).toBe("confidence");
    expect(s.conf).toBeNull();
    expect(s.rung).toBe(1);
    expect(s.transfer).toBeNull();
  });
});

// ---- map state --------------------------------------------------------------

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
    const plan = LEGACY_PHASE_PLAN;
    const gates = planGates(plan);
    expect(phaseIndex(plan, gates, "mastered", false)).toBe(plan.length - 1);
    expect(phaseIndex(plan, gates, "mastered", true)).toBe(plan.length);
    expect(phaseIndex(plan, gates.slice(0, -1), "shaky", false)).toBe(
      plan.indexOf("crucible"),
    );
  });
});

// ---- the phase catalogue ----------------------------------------------------
// These three are load-bearing and silent when broken: a plan that violates
// any of them still renders, it just renders something wrong.

describe("PHASE_PLAN invariants", () => {
  it("every plan is a subsequence of the canonical order", () => {
    // What keeps a phase index monotone and the rail left-to-right.
    for (const kind of NODE_KINDS) {
      const positions = PHASE_PLAN[kind].map((p) => PHASE_ORDER.indexOf(p));
      expect(positions).not.toContain(-1);
      expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("every plan starts at Consume and ends at Retain", () => {
    // The warm chain needs a known first and last, and index 0 must be the
    // reading pass for the part-read case to mean anything.
    for (const kind of NODE_KINDS) {
      const plan = PHASE_PLAN[kind];
      expect(plan[0]).toBe("consume");
      expect(plan[plan.length - 1]).toBe("retain");
    }
  });

  it("every phase in the catalogue has at least one home", () => {
    // A phase no plan contains is dead code — which is why a new phase enters
    // PHASE_ORDER only in the release that implements it.
    //
    // A home is now EITHER table: three of the phases exist for a domain
    // rather than for a kind, so `PHASE_PLAN` alone would call them dead. The
    // invariant's meaning is unchanged — nothing unreachable — and
    // `resolvePlan` over every pair is the honest way to ask it.
    const homed = new Set(
      NODE_KINDS.flatMap((k) => DOMAINS.flatMap((d) => [...resolvePlan(k, d)])),
    );
    for (const id of PHASE_ORDER) expect(homed.has(id), id).toBe(true);
  });

  it("names every phase it defines, and defines every phase it names", () => {
    expect(Object.keys(PHASE_DEFS).sort()).toEqual([...PHASE_ORDER].sort());
  });

  it("gives no two phases the same signal", () => {
    // The admission test for the catalogue: a candidate that adds no new
    // signal is a setting, not a phase.
    const signals = PHASE_ORDER.map((id) => PHASE_DEFS[id].signal);
    expect(new Set(signals).size).toBe(signals.length);
  });

  it("runs a genuinely different ladder per kind", () => {
    // The headline, spelled out rather than derived — a table this small is
    // worth asserting literally, since a typo in it is a ladder shipped.
    expect([...PHASE_PLAN.fact]).toEqual([
      "consume",
      "discriminate",
      "drill",
      "connect",
      "recall",
      "retain",
    ]);
    expect([...PHASE_PLAN.concept]).toEqual([
      "consume",
      "discriminate",
      "socratic",
      "feynman",
      "connect",
      "crucible",
      "recall",
      "retain",
    ]);
    expect([...PHASE_PLAN.procedure]).toEqual([
      "consume",
      "trace",
      "feynman",
      "perform",
      "drill",
      "connect",
      "crucible",
      "retain",
    ]);
    expect([...PHASE_PLAN.principle]).toEqual([
      "consume",
      "socratic",
      "predict",
      "trace",
      "feynman",
      "connect",
      "crucible",
      "retain",
    ]);
  });

  it("gives a fact no rung that asks it to reason", () => {
    // The rationale, as a test: a fact is an arbitrary association. There is
    // nothing to reason out, teach back, or transfer — so Socratic, Feynman
    // and the Crucible are not a lighter version of its ladder, they are the
    // wrong ladder. Recall is the rung that took their place.
    for (const phase of ["socratic", "feynman", "crucible"] as const)
      expect(PHASE_PLAN.fact).not.toContain(phase);
    expect(PHASE_PLAN.fact).toContain("recall");
  });

  it("makes discriminating instances a concept's own rung, not a warm-up", () => {
    // A concept is a classification. Telling an instance from a near-miss is
    // the thing being learned, which is why it sits right behind the reading
    // rather than being folded into it — and why a `fact` runs it too: an
    // arbitrary association is still confusable with its neighbours.
    expect(PHASE_PLAN.concept).toContain("discriminate");
    expect(PHASE_PLAN.fact).toContain("discriminate");
    expect(PHASE_PLAN.concept.indexOf("discriminate")).toBe(1);
  });

  it("asks only a procedure to execute", () => {
    // Perform grades a procedure actually run on a case. Nothing else is a
    // thing you carry out: a fact is had, a concept is told apart, a principle
    // is a mechanism you forecast and walk. The pairing with Drill is the
    // point — run it correctly, then run it fast, in that order.
    expect(PHASE_PLAN.procedure).toContain("perform");
    for (const kind of ["fact", "concept", "principle"] as const)
      expect(PHASE_PLAN[kind]).not.toContain("perform");
    const plan = PHASE_PLAN.procedure;
    expect(plan.indexOf("perform")).toBeLessThan(plan.indexOf("drill"));
  });

  it("is the whole catalogue, with every phase built", () => {
    // `PHASE_ORDER` holds only built phases, so this assertion is also the
    // statement that nothing is pending. Fifteen now: the twelve that were
    // keyed on kind, plus the three the domain axis added — Provenance and
    // Steelman for `interpretive`, Produce for `performative`.
    expect([...PHASE_ORDER]).toEqual([
      "consume",
      "discriminate",
      "provenance",
      "socratic",
      "steelman",
      "predict",
      "trace",
      "feynman",
      "perform",
      "drill",
      "produce",
      "connect",
      "crucible",
      "recall",
      "retain",
    ]);
  });

  it("puts each new phase where its own domain needs it", () => {
    // Order is the claim. Provenance comes before Socratic: you weigh the
    // source before you reason from it. Steelman comes after: you cannot argue
    // both sides of a thing you have not reasoned about. Produce comes after
    // Drill, because fluency precedes live production.
    const at = (p: string) => PHASE_ORDER.indexOf(p as never);
    expect(at("provenance")).toBeLessThan(at("socratic"));
    expect(at("socratic")).toBeLessThan(at("steelman"));
    expect(at("drill")).toBeLessThan(at("produce"));
  });

  it("puts Trace ahead of Feynman on both kinds that run it", () => {
    // A procedure and a principle are both chains, and the ordering is the
    // claim: you follow the mechanism before you are asked to explain it
    // unaided. Teaching back a chain you have never walked is exactly the
    // fluent recitation Feynman exists to catch.
    for (const kind of ["procedure", "principle"] as const) {
      const plan = PHASE_PLAN[kind];
      expect(plan).toContain("trace");
      expect(plan.indexOf("trace")).toBeLessThan(plan.indexOf("feynman"));
    }
    // A fact has no chain to walk, and a concept is told apart rather than
    // stepped through.
    for (const kind of ["fact", "concept"] as const)
      expect(PHASE_PLAN[kind]).not.toContain("trace");
  });

  it("asks only a principle to forecast", () => {
    // A principle is a mechanism, and the test of having one is whether it
    // predicts. Nothing else on the map claims to: a fact has no mechanism, a
    // concept classifies rather than forecasts, and a procedure's forecast is
    // just running it — which is what Perform grades.
    expect(PHASE_PLAN.principle).toContain("predict");
    for (const kind of ["fact", "concept", "procedure"] as const)
      expect(PHASE_PLAN[kind]).not.toContain("predict");
  });

  it("gives the two kinds that need it a rung for automaticity", () => {
    // A fact and a procedure both fail the same way under time pressure: the
    // answer is derived rather than known. Drill is the only rung that grades
    // that, which is why it is the one phase those two ladders share and a
    // `principle` — which is meant to be reasoned through — never runs.
    expect(PHASE_PLAN.fact).toContain("drill");
    expect(PHASE_PLAN.procedure).toContain("drill");
    expect(PHASE_PLAN.principle).not.toContain("drill");
  });

  it("asks a procedure to run, not to recite", () => {
    // Recall is unaided *retrieval*. A procedure reciting its own steps from
    // memory is the rehearsal it most easily fakes — what it owes is the
    // procedure actually carried out, which is Perform's rung, not this one.
    expect(PHASE_PLAN.procedure).not.toContain("recall");
  });

  it("gives a procedure no Socratic pass", () => {
    // A procedure is executed, not argued with: questioning it produces talk
    // about the steps rather than the steps. Feynman stays — saying what each
    // step is for is the part that catches a memorised sequence.
    expect(PHASE_PLAN.procedure).not.toContain("socratic");
    expect(PHASE_PLAN.procedure).toContain("feynman");
  });

  it("leaves no kind without a gate to close", () => {
    // A plan whose only gate is Consume would go green on a reading. Every
    // kind owes at least one rung that grades something.
    for (const kind of NODE_KINDS)
      expect(planGates(PHASE_PLAN[kind]).length).toBeGreaterThan(1);
  });

  it("gives a Connect-ending plan no reason to sit Shaky", () => {
    // The trap the Connect handler guards: writing `connect-complete` on a
    // plan whose last gate IS Connect derives Shaky, `primaryPhase` re-opens
    // Connect, and finishing it writes the reason again — a loop with no
    // exit.
    //
    // Asserted against a plan of that *shape* rather than against whichever
    // kind happens to have it this release. The fact ladder was that plan
    // until Recall shipped behind Connect; the guard is about the shape, and
    // a run built before Recall existed still carries exactly this frozen
    // plan, so it has to keep holding.
    const plan = ["consume", "connect", "retain"] as const;
    expect(planGates(plan).at(-1)).toBe("connect");
    expect(stateFromPlan(plan, planGates(plan))).toBe("mastered");
    expect(stateFromPlan(plan, planGates(plan), { shaky: "connect-complete" })).toBe(
      "shaky",
    );
    expect(primaryPhase(plan, planGates(plan), "shaky")).toBe("connect");
  });

  it("names the plan's own last gate in the copy that sends you back to it", () => {
    // Every shaky line used to say "the Crucible", which a `fact` never runs.
    expect(shakyLine("review-miss", "en", PHASE_PLAN.procedure)).toContain("Crucible");
    expect(shakyLine("review-miss", "en", PHASE_PLAN.fact)).toContain("Recall");
    expect(shakyLine("review-miss", "en", PHASE_PLAN.fact)).not.toContain("Crucible");
    // No plan — the state legend describes the state, not a node.
    expect(shakyLine("review-miss", "en")).toContain("Crucible");
    expect(shakyLine("review-miss", "pt-BR", PHASE_PLAN.fact)).toContain("Recall");
  });

  it("gates mastery on everything but Retain", () => {
    expect([...planGates(LEGACY_PHASE_PLAN)]).toEqual([
      "consume",
      "socratic",
      "feynman",
      "connect",
      "crucible",
    ]);
  });
});

describe("primaryPhase — what the CTA opens is what the CTA says", () => {
  const plan = LEGACY_PHASE_PLAN;

  it("names the next unfinished rung, not a fixed one per state", () => {
    // The bug it exists to stop: a Learning node that has only read the pass
    // opens Socratic, and the button used to call that "Continue · Feynman".
    expect(primaryPhase(plan, [], "frontier")).toBe("consume");
    expect(primaryPhase(plan, ["consume"], "learning")).toBe("socratic");
    expect(primaryPhase(plan, ["consume", "socratic"], "learning")).toBe("feynman");
  });

  it("sends a Shaky node back to the last gate even with a full ledger", () => {
    // A review miss flags a fully-finished node Shaky, and every shaky line in
    // the app says re-attempt the Crucible — falling through to the review
    // queue would contradict the copy the learner is reading.
    expect(primaryPhase(plan, planGates(plan), "shaky")).toBe("crucible");
    expect(primaryPhase(plan, planGates(plan).slice(0, -1), "shaky")).toBe("crucible");
  });

  it("has nothing to open once the plan is finished", () => {
    expect(primaryPhase(plan, planGates(plan), "mastered")).toBeUndefined();
  });

  it("routes an interpretive node through the rungs its domain added", () => {
    // What the in-session hand-offs must ask, and for a while did not. They
    // named their target instead — the reading opened Socratic and Socratic
    // opened Feynman — so Provenance and Steelman were skipped on the path a
    // learner actually walks, while the map's own route ran them correctly.
    // Being IN the plan is not enough; these are the rungs that come first.
    const interpretive = resolvePlan("concept", "interpretive");
    expect(primaryPhase(interpretive, ["consume"], "learning")).toBe("discriminate");
    expect(primaryPhase(interpretive, ["consume", "discriminate"], "learning")).toBe(
      "provenance",
    );
    expect(
      primaryPhase(
        interpretive,
        ["consume", "discriminate", "provenance", "socratic"],
        "learning",
      ),
    ).toBe("steelman");
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

describe("crucibleMasters", () => {
  // A `procedure`: the kind whose last gate genuinely is the Crucible. A
  // `concept` owes Recall after it, which is exactly the case below.
  const nodes = [{ id: "n", kind: "procedure" as const }];
  const done = (...p: string[]) => ({ n: p as never });

  it("lifts the node when Crucible is the last gate left", () => {
    expect(
      crucibleMasters(
        nodes,
        "n",
        done("consume", "trace", "feynman", "perform", "drill", "connect"),
      ),
    ).toBe(true);
  });

  it("does not lift a node that still owes a rung after the Crucible", () => {
    // The concept ladder puts Recall behind the Crucible, so passing the
    // transfer test closes that rung and nothing else — and the closing copy
    // must not promise green, or the map contradicts it on the next screen.
    const concept = [{ id: "n", kind: "concept" as const }];
    expect(
      crucibleMasters(concept, "n", done("consume", "socratic", "feynman", "connect")),
    ).toBe(false);
  });

  it("does not lift a node that jumped the queue", () => {
    // "I know this →" and the rail's skip nudge both open the Crucible early.
    // Passing it closes that rung and nothing else, so the closing copy must
    // not promise Mastered — the map would contradict it on the next screen.
    expect(crucibleMasters(nodes, "n", done("consume"))).toBe(false);
  });

  it("promises nothing about a node it cannot find", () => {
    expect(crucibleMasters(nodes, "gone", {})).toBe(true);
  });
});

// ---- the six phases of the catalogue's growth to twelve -----------------------
// Each owns its own gate, and the gates differ on purpose: what counts as
// passing a retrieval is not what counts as passing a run, and neither is what
// counts as having walked a chain. These pin the differences, because a gate
// that quietly became a shared two-thirds threshold would be the six phases
// collapsing back into two with extra files.

describe("discriminate", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The rule",
    ask: "Which is it?",
    cases: [0, 1, 2, 3].map((i) => ({
      id: `c${i}`,
      candidate: `case ${i}`,
      readings: ["it is", "it is not"],
      answerIndex: i % 2,
      decidedBy: "the requirement",
      // Even cases are instances, odd ones are near-misses.
      isInstance: i % 2 === 0,
    })),
  };
  const run = (calls: number[]) =>
    calls.reduce(
      (acc, call) =>
        discriminateReducer(
          discriminateReducer(acc, { type: "call", index: call }, content),
          { type: "next" },
          content,
        ),
      discriminateStart("n"),
    );

  it("will not let a call be changed once it is committed", () => {
    // Cycling the readings until the reveal turns green is not a boundary test.
    const once = discriminateReducer(
      discriminateStart("n"),
      { type: "call", index: 1 },
      content,
    );
    expect(discriminateReducer(once, { type: "call", index: 0 }, content).calls.c0).toBe(
      1,
    );
  });

  it("fails a learner who waves near-misses through, however good the score", () => {
    // The phase's own standard, and the reason it does not share a gate with
    // its siblings: calling everything an instance scores whatever fraction of
    // the run happens to be instances, by luck rather than by the boundary.
    const all = run([0, 0, 0, 0]);
    expect(discriminateFalsePositives(all, content)).toHaveLength(2);
    expect(discriminatePassed(all, content)).toBe(false);
  });

  it("passes a run that gets the boundary right", () => {
    expect(discriminatePassed(run([0, 1, 0, 1]), content)).toBe(true);
  });
});

describe("predict", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The rule",
    setups: [0, 1].map((i) => ({
      id: `s${i}`,
      situation: `setup ${i}`,
      outcomes: ["holds", "reverses"],
      answerIndex: 0,
      because: "the chain",
    })),
  };

  it("takes the confidence before the forecast and locks it after", () => {
    // A rating given after the outcome is visible is not a calibration
    // reading, so the reducer refuses it rather than the view hiding it.
    const rated = predictReducer(predictStart("n"), { type: "sure", level: 2 }, content);
    const committed = predictReducer(rated, { type: "commit", index: 1 }, content);
    const after = predictReducer(committed, { type: "sure", level: 0 }, content);
    expect(after.sureness.s0).toBe(2);
  });

  it("surfaces the forecasts held with certainty and still wrong", () => {
    const s = predictReducer(
      predictReducer(predictStart("n"), { type: "sure", level: 2 }, content),
      { type: "commit", index: 1 },
      content,
    );
    expect(predictOverconfident(s, content).map((x) => x.id)).toEqual(["s0"]);
  });
});

describe("trace", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The rule",
    scenario: "one run",
    stages: [0, 1, 2].map((i) => ({
      id: `t${i}`,
      reached: `stage ${i}`,
      nexts: ["forward", "backward"],
      answerIndex: 0,
      handsOn: "the next input",
    })),
  };
  const walk = (steps: number[]) =>
    steps.reduce(
      (acc, step) =>
        traceReducer(
          traceReducer(acc, { type: "step", index: step }, content),
          { type: "next" },
          content,
        ),
      traceStart("n"),
    );

  it("gates on an unbroken chain, not on a fraction correct", () => {
    // Two of three right passes only if they are the FIRST two: a run that
    // broke at the first link and guessed the rest has not followed anything.
    expect(tracePassed(walk([0, 0, 1]), content)).toBe(true);
    expect(tracePassed(walk([1, 0, 0]), content)).toBe(false);
  });

  it("reports where the chain first broke", () => {
    expect(traceBreak(walk([0, 1, 0]), content)).toBe(1);
    expect(traceBreak(walk([0, 0, 0]), content)).toBe(-1);
  });
});

describe("drill", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The rule",
    reps: [0, 1, 2].map((i) => ({
      id: `r${i}`,
      prompt: `rep ${i}`,
      answers: ["a", "b"],
      answerIndex: 0,
      rule: "the rule",
    })),
  };
  const drill = (ms: number[]) =>
    ms.reduce(
      (acc, gap, i) =>
        drillReducer(
          drillReducer(acc, { type: "answer", index: 0, now: i * 100000 + gap }, content),
          { type: "next", now: (i + 1) * 100000 },
          content,
        ),
      drillStart("n", 0),
    );

  it("reports the median rep, not the mean", () => {
    // One interrupted rep must not describe the run.
    expect(drillMedianMs(drill([1000, 2000, 60000]), content)).toBe(2000);
  });

  it("names the reps that were right but slow", () => {
    // The finding only Drill can produce: correct, and still being derived.
    const s = drill([1000, 30000, 1000]);
    expect(drillLabored(s, content).map((r) => r.id)).toEqual(["r1"]);
    // ...and it is a finding, not a failure. Speed is reported, never gated.
    expect(drillPassed(s, content)).toBe(true);
  });
});

describe("recall", () => {
  const content = {
    nodeId: "n",
    nodeLabel: "The rule",
    brief: "write it down",
    scaffold: "start here",
    rubric: ["a", "b", "c"].map((id) => ({ id, point: id, mustRetrieve: [id] })),
  };
  const reported = (v: Record<string, "good" | "skipped" | "confused">) => ({
    ...recallStart("n"),
    reported: true,
    retrieved: v,
  });

  it("takes partial credit — memory is graded, not all-or-nothing", () => {
    expect(recallPassed(reported({ a: "good", b: "good" }), content)).toBe(true);
    expect(recallPassed(reported({ a: "good" }), content)).toBe(false);
  });

  it("scores only what actually came back", () => {
    expect(
      recallScore(reported({ a: "good", b: "confused", c: "skipped" }), content),
    ).toBe(1);
  });

  it("writing it again leaves nothing of the first attempt", () => {
    const again = recallReducer(reported({ a: "good" }), { type: "again" });
    expect(again).toEqual(recallStart("n"));
  });
});

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
    // Execution takes no partial credit, and this is where it parts company
    // with Recall: a run with a wrong intermediate result is a failed run.
    expect(
      performPassed(reported({ s1: "good", s2: "confused", s3: "good" }), content),
    ).toBe(false);
  });

  it("requires every load-bearing step to have actually been carried out", () => {
    expect(performPassed(reported({ s1: "good", s2: "skipped" }), content)).toBe(false);
  });

  it("lets a skipped check through — a thinner run, not a wrong one", () => {
    expect(
      performPassed(reported({ s1: "good", s2: "good", s3: "skipped" }), content),
    ).toBe(true);
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

// ---- pace (#23) ----------------------------------------------------------------

describe("real pace math", () => {
  it("daysUntil counts whole days and floors at 0", () => {
    const now = new Date("2026-07-01T15:00:00");
    expect(daysUntil("2026-07-11", now)).toBe(10);
    expect(daysUntil("2026-06-01", now)).toBe(0);
    expect(daysUntil("garbage", now)).toBe(0);
  });

  it("paceStatus divides remaining work by the real days left", () => {
    const pace = paceStatus({ a: "mastered" }, graph, 35, 10);
    expect(pace.remaining).toBe(1);
    expect(pace.daysLeft).toBe(10);
    // One plan-less node runs the full concept ladder: 50 min over 10 days.
    expect(pace.neededPerDay).toBe(5);
    expect(pace.onTrack).toBe(true);
  });

  it("paceStatus counts only the phases still owed", () => {
    const done = { b: ["consume", "discriminate", "socratic"] as const };
    const pace = paceStatus({ a: "mastered" }, graph, 35, 10, {
      b: [...done.b],
    });
    expect(pace.neededPerDay).toBe(3); // 50 - 22 = 28 min → ceil(2.8)
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

  it("sums the unfinished gates and never charges Retain", () => {
    const full = planGates(PHASE_PLAN.concept).reduce((m, p) => m + PHASE_MINUTES[p], 0);
    expect(minutesLeft(node)).toBe(full);
    expect(minutesLeft(node, [...planGates(PHASE_PLAN.concept)])).toBe(0);
  });

  it("scales by difficulty", () => {
    expect(minutesLeft({ ...node, difficulty: "hard" })).toBe(70); // 50 × 1.4
    // Easy also sheds Socratic: (50 - 8) × 0.75.
    expect(minutesLeft({ ...node, difficulty: "easy" })).toBe(32);
  });

  it("follows a short support ladder", () => {
    expect(minutesLeft({ ...node, importance: "support" })).toBe(19);
  });
});

// The cost axes only ever REMOVE rungs, so the catalogue's invariants must hold
// over every combination — and the defaults must reproduce today's ladders.
describe("importance × difficulty", () => {
  const combos = NODE_KINDS.flatMap((kind) =>
    DOMAINS.flatMap((domain) =>
      (["core", "support"] as const).flatMap((importance) =>
        (["easy", "medium", "hard"] as const).map(
          (difficulty) => [kind, domain, importance, difficulty] as const,
        ),
      ),
    ),
  );

  it("every combination keeps the three invariants and a real gate", () => {
    for (const c of combos) {
      const plan = resolvePlan(...c);
      const at = plan.map((p) => PHASE_ORDER.indexOf(p));
      expect([...at], c.join("/")).toEqual([...at].sort((a, b) => a - b));
      expect(plan[0], c.join("/")).toBe("consume");
      expect(plan.at(-1), c.join("/")).toBe("retain");
      expect(planGates(plan).length, c.join("/")).toBeGreaterThan(1);
    }
  });

  it("core + medium is the pre-axes ladder, byte for byte", () => {
    for (const kind of NODE_KINDS)
      for (const domain of DOMAINS)
        expect(resolvePlan(kind, domain, "core", "medium")).toEqual(
          resolvePlan(kind, domain),
        );
  });

  it("draws the concept table from the plan", () => {
    const row = (i: "core" | "support", d: "easy" | "medium" | "hard") =>
      resolvePlan("concept", "general", i, d).join(" ");
    expect(row("core", "easy")).toBe(
      "consume discriminate feynman connect crucible recall retain",
    );
    expect(row("core", "hard")).toBe(PHASE_PLAN.concept.join(" "));
    expect(row("support", "medium")).toBe("consume discriminate recall retain");
    expect(row("support", "hard")).toBe("consume discriminate socratic recall retain");
  });

  it("a support node on a formal map still computes something", () => {
    expect(resolvePlan("concept", "formal", "support").join(" ")).toBe(
      "consume discriminate trace perform recall retain",
    );
  });

  it("reads unknown axes as core / medium", () => {
    expect(nodeAxes({ importance: "vital", difficulty: 9 })).toMatchObject({
      importance: "core",
      difficulty: "medium",
    });
    expect(nodeAxes({ importance: "support", difficulty: "hard" })).toMatchObject({
      importance: "support",
      difficulty: "hard",
    });
  });
});

// The domain axis is a second lever over the same catalogue, so it owes the
// same three invariants — over every (kind, domain) pair, not just the four
// kinds. A rule that quietly produced an out-of-order or truncated ladder would
// be silent at runtime: the rail would just draw the wrong rungs.

describe("DOMAIN_PLAN invariants", () => {
  const pairs = NODE_KINDS.flatMap((kind) =>
    DOMAINS.map((domain) => [kind, domain] as const),
  );

  it("every resolved plan is a subsequence of the canonical order", () => {
    for (const [kind, domain] of pairs) {
      const positions = resolvePlan(kind, domain).map((p) => PHASE_ORDER.indexOf(p));
      expect(positions, `${kind}/${domain}`).not.toContain(-1);
      expect([...positions], `${kind}/${domain}`).toEqual(
        [...positions].sort((a, b) => a - b),
      );
    }
  });

  it("every resolved plan starts at Consume and ends at Retain", () => {
    for (const [kind, domain] of pairs) {
      const plan = resolvePlan(kind, domain);
      expect(plan[0], `${kind}/${domain}`).toBe("consume");
      expect(plan[plan.length - 1], `${kind}/${domain}`).toBe("retain");
    }
  });

  it("no resolved plan repeats a phase", () => {
    // The merge filters PHASE_ORDER, so a phase the kind and the domain both
    // ask for must still appear once.
    for (const [kind, domain] of pairs) {
      const plan = resolvePlan(kind, domain);
      expect(new Set(plan).size, `${kind}/${domain}`).toBe(plan.length);
    }
  });

  it("every resolved plan still gates on more than Retain", () => {
    for (const [kind, domain] of pairs)
      expect(
        planGates(resolvePlan(kind, domain)).length,
        `${kind}/${domain}`,
      ).toBeGreaterThan(1);
  });

  it("general changes nothing — the pre-domain ladder, byte for byte", () => {
    // The guarantee that shipping this axis cannot re-cut an existing map.
    for (const kind of NODE_KINDS)
      expect([...resolvePlan(kind, "general")]).toEqual([...PHASE_PLAN[kind]]);
  });

  it("formal gives a concept node something to actually compute", () => {
    // The structural bug this axis exists to fix: PHASE_PLAN.concept carries no
    // execution rung, so a `concept` node could reach mastered without the
    // learner ever running anything.
    for (const phase of ["trace", "perform", "drill"] as const) {
      expect(PHASE_PLAN.concept).not.toContain(phase);
      expect(resolvePlan("concept", "formal")).toContain(phase);
    }
  });

  it("performative takes the prose rungs off, whatever the kind says", () => {
    // Explaining the preterite in your own words is not speaking Spanish.
    for (const kind of NODE_KINDS) {
      const plan = resolvePlan(kind, "performative");
      for (const phase of ["socratic", "feynman", "crucible"] as const)
        expect(plan, `${kind}/performative`).not.toContain(phase);
      expect(plan).toContain("drill");
    }
  });

  it("craft forecasts the failure before the cut, and never drills on a screen", () => {
    const plan = resolvePlan("procedure", "craft");
    expect(plan).toContain("predict");
    expect(plan).toContain("perform");
    expect(plan).not.toContain("drill");
  });

  it("every phase a domain rule names is one that exists", () => {
    // Same reason PHASE_ORDER holds only built phases: a rule naming an
    // unbuilt rung is a ladder with a missing screen.
    for (const rule of Object.values(DOMAIN_PLAN)) {
      const named = "plan" in rule ? rule.plan : rule.add;
      for (const phase of named) expect(PHASE_ORDER).toContain(phase);
    }
  });

  it("reads an unknown domain as general rather than refusing it", () => {
    // Lenient in both directions, like asNodeKind: an older map, a newer
    // server, or a model that invented a value must degrade, not break.
    expect(asDomain("formal")).toBe("formal");
    expect(asDomain("astrology")).toBe("general");
    expect(asDomain(undefined)).toBe("general");
    expect(asDomain(7)).toBe("general");
  });
});

describe('ledgerAfter — "I already know this" has to be proven', () => {
  const plan = PHASE_PLAN.concept;

  it("appends the phase that closed, once", () => {
    expect(ledgerAfter(plan, ["consume"], "discriminate", false)).toEqual([
      "consume",
      "discriminate",
    ]);
    expect(ledgerAfter(plan, ["consume"], "consume", false)).toEqual(["consume"]);
  });

  it("a challenged pass of the last gate credits every gate, never Retain", () => {
    const done = ledgerAfter(plan, ["consume"], "crucible", true);
    expect(new Set(done)).toEqual(new Set(planGates(plan)));
    expect(done[0]).toBe("consume");
    expect(done).not.toContain("retain");
    expect(stateFromPlan(plan, done)).toBe("mastered");
  });

  it("credits nothing extra without the challenge, or on any other gate", () => {
    expect(ledgerAfter(plan, [], "crucible", false)).toEqual(["crucible"]);
    expect(ledgerAfter(plan, [], "discriminate", true)).toEqual(["discriminate"]);
  });

  it("proves on the Crucible when the plan has one, even before Recall", () => {
    expect(ledgerAfter(plan, [], "recall", true)).toEqual(["recall"]);
  });

  it("uses the plan's own last gate when it has no Crucible", () => {
    const fact = PHASE_PLAN.fact;
    expect(stateFromPlan(fact, ledgerAfter(fact, [], "recall", true))).toBe("mastered");
  });
});

describe("applyDiagnosticLedger — a placement writes the ledger, not just states", () => {
  const g: ConceptGraph = {
    nodes: [
      {
        id: "a",
        label: "A",
        state: "unknown",
        kind: "concept",
        g: 1,
        week: 0,
        x: 0,
        y: 0,
      },
      { id: "b", label: "B", state: "unknown", kind: "fact", g: 2, week: 0, x: 0, y: 0 },
    ],
    edges: [["a", "b"]],
  };

  it("a known node and its whole chain get every gate, and derive mastered", () => {
    const done = applyDiagnosticLedger({}, "mastered", "b", g);
    expect(done.a).toEqual(planGates(PHASE_PLAN.concept));
    expect(done.b).toEqual(planGates(PHASE_PLAN.fact));
    expect(done.b).not.toContain("retain");
    expect(stateFromPlan(PHASE_PLAN.fact, done.b)).toBe("mastered");
  });

  it("a genuine miss owes exactly the last gate, and touches nothing else", () => {
    const done = applyDiagnosticLedger({}, "shaky", "b", g);
    expect(done.b).toEqual(planGates(PHASE_PLAN.fact).slice(0, -1));
    expect(done.a).toBeUndefined();
  });
});
