import { describe, expect, it } from "vitest";
import {
  crucibleReducer,
  crucibleStart,
  daysUntil,
  displayStates,
  feynmanReducer,
  feynmanStart,
  freshAdherence,
  markTodayMet,
  paceStatus,
  phaseIndex,
  removeNode,
  rolloverAdherence,
  socraticReducer,
  socraticStart,
  spawnGap,
  type ConceptGraph,
  type CrucibleContent,
  type FeynmanBeat,
  type SocraticStep,
} from "@/lib/curriculum";

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

  it("'tell' advances and counts", () => {
    const s = socraticStart("n", steps);
    const next = socraticReducer(s, { type: "tell" }, steps);
    expect(next.step).toBe(1);
    expect(next.tells).toBe(1);
  });
});

// ---- feynman ----------------------------------------------------------------

describe("feynmanReducer", () => {
  it("'taught' sets the judged verdict and advances the beat (#26)", () => {
    const s = feynmanStart("n");
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
    let s = feynmanStart("n");
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "good", response: "r" }, beats);
    s = feynmanReducer(s, { type: "taught", text: "t", verdict: "skipped", response: "r" }, beats);
    expect(s.reported).toBe(true);
    expect(s.verdicts).toEqual({ b1: "good", b2: "skipped" });
  });

  it("a correct fix flips the verdict to good", () => {
    let s = feynmanStart("n");
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
