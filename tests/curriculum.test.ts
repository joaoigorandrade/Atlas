import { describe, expect, it } from "vitest";
import {
  crucibleReducer,
  crucibleStart,
  daysUntil,
  diagnosticEffect,
  displayStates,
  feynmanReducer,
  feynmanStart,
  freshAdherence,
  markTodayMet,
  paceStatus,
  phaseIndex,
  removeNode,
  rolloverAdherence,
  socraticOutcome,
  socraticReducer,
  socraticStart,
  spawnGap,
  stepDifficulty,
  type ConceptGraph,
  type CrucibleContent,
  type FeynmanBeat,
  type SocraticStep,
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

  it("discounts a miss no harder than evidence already proven (an ENEM-style luck slip)", () => {
    // Aced a hard question, then fumbled an easy one — noise, not a gap.
    expect(diagnosticEffect("easy", false, "hard")).toBe("mastered");
  });

  it("still calls a miss shaky when it's harder than anything proven so far", () => {
    // Only proven medium; missing hard is real, uncovered evidence.
    expect(diagnosticEffect("hard", false, "medium")).toBe("shaky");
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

const beats: FeynmanBeat[] = [0, 1].map((i) => ({
  id: `b${i + 1}`,
  subPoint: `point ${i}`,
  transcript: "reference explanation",
  interjection: "but why?",
  replies: [
    { label: "good answer", verdict: "good", response: "ok" },
    { label: "dodge", verdict: "skipped", response: "still lost" },
    { label: "wrong claim", verdict: "confused", response: "contradiction" },
  ],
  fix: {
    probe: "fix probe",
    replies: [
      { label: "right", correct: true, response: "yes" },
      { label: "wrong", correct: false, response: "no" },
    ],
  },
  gap: { id: `gap-b${i + 1}`, label: `gap ${i}`, reason: "why", dx: 0, dy: 100 },
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
  it("advances on a correct scripted reply and fades help", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(s, { type: "reply", index: 0 }, steps);
    expect(next.step).toBe(1);
    expect(next.help).toBe(0);
  });

  it("judged wrong answers raise help and never advance (#25)", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(
      s,
      { type: "judged", answer: "scalar mult rotates", quality: "wrong", response: "caught: it scales" },
      steps,
    );
    expect(next.step).toBe(0);
    expect(next.help).toBe(2);
    expect(next.log.at(-1)?.tone).toBe("catch");
  });

  it("judged correct answers advance", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(
      s,
      { type: "judged", answer: "it scales the vector", quality: "correct", response: "right" },
      steps,
    );
    expect(next.step).toBe(1);
  });

  it("'answer' posts the answer at once, and the verdict fills that same bubble", () => {
    const s = socraticStart("n", steps);
    const sent = socraticReducer(s, { type: "answer", text: "it scales it" }, steps);
    expect(sent.log.at(-2)).toMatchObject({ role: "learner", text: "it scales it" });
    expect(sent.log.at(-1)).toMatchObject({ role: "ai", pending: true });
    const judged = socraticReducer(
      sent,
      { type: "judged", answer: "it scales it", quality: "correct", response: "right" },
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

  it("setHelp sets the dial directly, even on a finished session", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "setHelp", level: 3 }, steps);
    expect(s.help).toBe(3);
    s = { ...s, done: true };
    expect(socraticReducer(s, { type: "setHelp", level: 0 }, steps).help).toBe(0);
  });

  it("records an unaided resolution on a clean correct reply", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(s, { type: "reply", index: 0 }, steps);
    expect(next.resolutions).toEqual(["unaided"]);
  });

  it("downgrades to a hint resolution once the step was assisted (#C)", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "stuck" }, steps);
    expect(s.stepAssisted).toBe(true);
    s = socraticReducer(s, { type: "reply", index: 0 }, steps);
    expect(s.resolutions).toEqual(["hint"]);
    // The next step starts clean again.
    expect(s.stepAssisted).toBe(false);
  });

  it("records 'told' for 'tell' and for a judged 'lost' verdict", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "tell" }, steps);
    expect(s.resolutions).toEqual(["told"]);
    s = socraticReducer(
      s,
      { type: "judged", answer: "no idea", quality: "lost", response: "here's the answer" },
      steps,
    );
    expect(s.resolutions).toEqual(["told", "told"]);
    expect(s.done).toBe(true);
  });
});

// ---- socratic outcome (#C) — "done" is not automatically "understood" ------

describe("socraticOutcome", () => {
  it("earns 'unaided' when every step went clean, and closes a gap pass", () => {
    let s = socraticStart("n", steps);
    for (let i = 0; i < steps.length; i++)
      s = socraticReducer(s, { type: "reply", index: 0 }, steps);
    expect(s.done).toBe(true);
    expect(socraticOutcome(s, false)).toBe("unaided");
    expect(socraticOutcome(s, true)).toBe("unaided");
  });

  it("softens to 'assisted' on a regular node with one hint; a gap still closes (reconstructed, not told)", () => {
    let s = socraticStart("n", steps);
    s = socraticReducer(s, { type: "stuck" }, steps);
    s = socraticReducer(s, { type: "reply", index: 0 }, steps); // step 0: hint
    s = socraticReducer(s, { type: "reply", index: 0 }, steps); // step 1: unaided
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
    for (let i = 0; i < 3; i++) s = socraticReducer(s, { type: "reply", index: 0 }, four);
    expect(s.done).toBe(true);
    expect(s.total).toBe(3);
    expect(s.resolutions).toEqual(["unaided", "unaided", "unaided"]);
  });

  it("buys one more probe after two straight assisted steps, if the plan wrote a spare", () => {
    const three = [0, 1, 2].map((i) => ({ ...steps[0], id: `s${i + 1}` }));
    // total pinned at 2 even though a third step is already available.
    let s = socraticStart("n", three.slice(0, 2), 2);
    s = socraticReducer(s, { type: "tell" }, three); // step 0: told
    s = socraticReducer(s, { type: "tell" }, three); // step 1: told → would finish at total=2
    expect(s.total).toBe(3);
    expect(s.done).toBe(false);
    expect(s.step).toBe(2);
  });
});

// ---- resuming with nothing arrived yet (bug: total got clamped to 1) -------

describe("socraticReducer hydrate against an empty step list", () => {
  it("does not clamp a resumed session's total down when no steps have arrived yet", () => {
    // A pass saved mid-way through step 1 of a 4-step plan…
    let saved = socraticStart("n", steps.slice(0, 1), 4);
    saved = socraticReducer(saved, { type: "reply", index: 0 }, steps.slice(0, 1));
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
    const next = socraticReducer(s, { type: "reply", index: 0 }, arrived);
    expect(next.done).toBe(false);
    expect(next.step).toBe(1);
    // Parked on a step that exists in the plan but hasn't been written yet.
    expect(next.awaitingNext).toBe(true);
  });

  it("ignores input while parked, rather than throwing on a missing step", () => {
    const arrived = steps.slice(0, 1);
    let s = socraticStart("n", arrived, steps.length);
    s = socraticReducer(s, { type: "reply", index: 0 }, arrived);
    expect(() =>
      socraticReducer(s, { type: "reply", index: 0 }, arrived),
    ).not.toThrow();
    expect(socraticReducer(s, { type: "tell" }, arrived)).toEqual(s);
  });

  it("opens the parked step once it lands", () => {
    let s = socraticStart("n", steps.slice(0, 1), steps.length);
    s = socraticReducer(s, { type: "reply", index: 0 }, steps.slice(0, 1));
    s = socraticReducer(s, { type: "hydrate" }, steps);
    expect(s.awaitingNext).toBe(false);
    expect(s.step).toBe(1);
    expect(s.log.at(-1)?.text).toBe(steps[1].prompt);
  });

  it("still ends on the real last step", () => {
    let s = socraticStart("n", steps);
    for (let i = 0; i < steps.length; i++)
      s = socraticReducer(s, { type: "reply", index: 0 }, steps);
    expect(s.done).toBe(true);
  });

  it("closes the session when the stream ended short of the plan", () => {
    const arrived = steps.slice(0, 1);
    let s = socraticStart("n", arrived, steps.length);
    s = socraticReducer(s, { type: "reply", index: 0 }, arrived);
    // The stream finished with only one step: re-cap and the pass is over.
    s = socraticReducer(s, { type: "hydrate", total: 1 }, arrived);
    expect(s.done).toBe(true);
  });

  // How re-entering a saved pass reopens it (AtlasApp `enterSocratic`).
  it("resumes a saved session, parked or not, on the step it stopped at", () => {
    const arrived = steps.slice(0, 1);
    let saved = socraticStart("n", arrived, steps.length);
    saved = socraticReducer(saved, { type: "reply", index: 0 }, arrived);
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

describe("feynmanReducer against a growing beat list", () => {
  it("does not open the Gap Report while beats are still arriving", () => {
    const arrived = beats.slice(0, 1);
    const s = feynmanStart("n", beats.length);
    const next = feynmanReducer(
      s,
      { type: "taught", text: "t", verdict: "good", response: "r" },
      arrived,
    );
    expect(next.reported).toBe(false);
    expect(next.beat).toBe(1);
  });

  it("parks on a beat that has not arrived instead of throwing", () => {
    const arrived = beats.slice(0, 1);
    let s = feynmanStart("n", beats.length);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "good", response: "r" }, arrived);
    expect(feynmanReducer(s, { type: "speak" }, arrived)).toEqual(s);
  });

  it("reports when the stream ended short of the plan", () => {
    const arrived = beats.slice(0, 1);
    let s = feynmanStart("n", beats.length);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "good", response: "r" }, arrived);
    s = feynmanReducer(s, { type: "hydrate", total: 1 }, arrived);
    // Re-capped to the beat in hand, so the next answer closes the pass.
    expect(s.total).toBe(2);
  });
});

// ---- feynman ----------------------------------------------------------------

describe("feynmanReducer", () => {
  it("'taught' sets the judged verdict and advances the beat (#26)", () => {
    const s = feynmanStart("n", beats.length);
    const next = feynmanReducer(
      s,
      { type: "taught", text: "my words", verdict: "confused", response: "huh?" },
      beats,
    );
    expect(next.verdicts["b1"]).toBe("confused");
    expect(next.beat).toBe(1);
    expect(next.reported).toBe(false);
  });

  it("last beat opens the Gap Report", () => {
    let s = feynmanStart("n", beats.length);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "good", response: "r" }, beats);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "skipped", response: "r" }, beats);
    expect(s.reported).toBe(true);
    expect(s.verdicts).toEqual({ b1: "good", b2: "skipped" });
  });

  it("a correct fix flips the verdict to good", () => {
    let s = feynmanStart("n", beats.length);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "confused", response: "r" }, beats);
    s = feynmanReducer(s, { type: "openFix", beatId: "b1" }, beats);
    s = feynmanReducer(s, { type: "fix", index: 0 }, beats);
    expect(s.verdicts["b1"]).toBe("good");
  });
});

// ---- crucible ---------------------------------------------------------------

describe("crucibleReducer", () => {
  it("judged result sets outcome and attempt-grounded transfer (#27)", () => {
    let s = crucibleStart("n1");
    s = crucibleReducer(s, { type: "confidence", level: 2 }, crucibleContent);
    s = crucibleReducer(s, { type: "attempt", value: "my real attempt" }, crucibleContent);
    const rows = [
      { verdict: "good" as const, text: "x" },
      { verdict: "red" as const, text: "y" },
    ];
    s = crucibleReducer(s, { type: "result", outcome: "partial", transfer: rows }, crucibleContent);
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
      { type: "result", outcome: "partial", transfer: [{ verdict: "red", text: "t" }] },
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
    expect(phaseIndex("mastered", false)).toBe(5);
    expect(phaseIndex("mastered", true)).toBe(6);
    expect(phaseIndex("shaky", false)).toBe(4);
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
    expect(pace.neededPerDay).toBe(4); // ceil(35/10)
    expect(pace.onTrack).toBe(true);
  });
});
