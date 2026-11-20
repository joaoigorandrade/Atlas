// The three phases the domain axis adds. Each gate has one clause that is the
// whole reason the phase exists, and each of those clauses is invisible when
// broken — the phase would simply pass everyone.

import { describe, expect, it } from "vitest";
import {
  produceAvoided,
  producePassed,
  produceReducer,
  produceStart,
  provenanceOvertrusted,
  provenanceScore,
  provenancePassed,
  provenanceReducer,
  provenanceStart,
  steelmanPassed,
  steelmanReady,
  steelmanReducer,
  steelmanStart,
  type ProduceContent,
  type ProduceVerdict,
  type ProvenanceContent,
  type ProvenanceRuling,
  type SteelmanContent,
  type SteelmanVerdict,
} from "@/lib/curriculum";

// ---- Provenance ------------------------------------------------------------

const provenance = (
  rulings: ProvenanceRuling[],
): { content: ProvenanceContent; answers: ProvenanceRuling[] } => ({
  content: {
    nodeId: "canossa",
    nodeLabel: "Canossa",
    source: {
      title: "Dictatus Papae",
      attribution: "Gregory VII",
      date: "1075",
      excerpt: "…",
    },
    claims: rulings.map((ruling, i) => ({
      id: `c${i}`,
      claim: `claim ${i}`,
      ruling,
      because: "why",
    })),
    silence: "The German bishops are not heard here.",
  },
  answers: rulings,
});

function runProvenance(content: ProvenanceContent, given: ProvenanceRuling[]) {
  let s = provenanceStart(content.nodeId);
  for (const ruling of given) {
    s = provenanceReducer(s, { type: "rule", ruling }, content);
    s = provenanceReducer(s, { type: "next" }, content);
  }
  return s;
}

describe("Provenance", () => {
  // Nine claims, not five: the over-trust cap only bites when a learner can
  // clear two thirds *while* making the error, and at five claims two
  // over-trusts already fail the score on their own.
  const { content, answers } = provenance([
    "asserts",
    "asserts",
    "asserts",
    "asserts",
    "proves",
    "proves",
    "neither",
    "neither",
    "asserts",
  ]);

  it("passes a learner who read the document as a document", () => {
    expect(provenancePassed(runProvenance(content, answers), content)).toBe(true);
  });

  it("takes one ruling per claim — cycling to the green one is not judgement", () => {
    let s = provenanceStart(content.nodeId);
    s = provenanceReducer(s, { type: "rule", ruling: "neither" }, content);
    s = provenanceReducer(s, { type: "rule", ruling: "asserts" }, content);
    expect(s.rulings.c0).toBe("neither");
  });

  it("fails a learner who took the source at its word, despite passing the score", () => {
    // Seven of nine right — comfortably two thirds — but both misses are the
    // same error in the same direction: reading a claim as a proof. A plain
    // score passes this, and it is the one thing the phase exists to catch.
    const given: ProvenanceRuling[] = [
      "proves",
      "proves",
      "asserts",
      "asserts",
      "proves",
      "proves",
      "neither",
      "neither",
      "asserts",
    ];
    const s = runProvenance(content, given);
    expect(provenanceScore(s, content)).toBe(7);
    expect(provenanceOvertrusted(s, content)).toHaveLength(2);
    expect(provenancePassed(s, content)).toBe(false);
  });

  it("forgives a single over-trust — one slip is not a habit", () => {
    const given: ProvenanceRuling[] = [
      "proves",
      "asserts",
      "asserts",
      "asserts",
      "proves",
      "proves",
      "neither",
      "neither",
      "asserts",
    ];
    const s = runProvenance(content, given);
    expect(provenanceOvertrusted(s, content)).toHaveLength(1);
    expect(provenancePassed(s, content)).toBe(true);
  });
});

// ---- Steelman --------------------------------------------------------------

const steelmanContent: SteelmanContent = {
  nodeId: "investiture",
  nodeLabel: "The Investiture Controversy",
  question: "Was Canossa a papal triumph or an imperial one?",
  positions: [
    {
      id: "papal",
      label: "A papal triumph",
      heldBy: "Gregorian reformers",
      mustCover: ["a", "b"],
    },
    {
      id: "imperial",
      label: "An imperial victory",
      heldBy: "Imperial chroniclers",
      mustCover: ["c"],
    },
  ],
};

function runSteelman(verdicts: Record<string, SteelmanVerdict>, disconfirmer: string) {
  let s = steelmanStart(steelmanContent.nodeId);
  for (const p of steelmanContent.positions)
    s = steelmanReducer(s, { type: "write", positionId: p.id, text: "x".repeat(60) });
  s = steelmanReducer(s, { type: "hold", positionId: "papal", disconfirmer });
  return steelmanReducer(s, { type: "judged", verdicts, response: "read" });
}

describe("Steelman", () => {
  it("passes both sides stood up, with a real disconfirmer", () => {
    const s = runSteelman(
      { papal: "strong", imperial: "strong" },
      "A contemporary account showing the German princes ignored the absolution.",
    );
    expect(steelmanPassed(s, steelmanContent)).toBe(true);
  });

  it("fails a strawman even when the other side is superb", () => {
    // The habit the phase exists to break: a brilliant case for your own view
    // and a shrug for the other. Averaging the two would pass this.
    const s = runSteelman(
      { papal: "strong", imperial: "strawman" },
      "A contemporary account showing the princes ignored the absolution.",
    );
    expect(steelmanPassed(s, steelmanContent)).toBe(false);
  });

  it("fails without a disconfirmer — that is picking, not judging", () => {
    const s = runSteelman({ papal: "strong", imperial: "strong" }, "dunno");
    expect(steelmanPassed(s, steelmanContent)).toBe(false);
  });

  it("does not send a blank page to the judge", () => {
    let s = steelmanStart("investiture");
    expect(steelmanReady(s, steelmanContent)).toBe(false);
    s = steelmanReducer(s, { type: "write", positionId: "papal", text: "x".repeat(60) });
    expect(steelmanReady(s, steelmanContent)).toBe(false);
    s = steelmanReducer(s, {
      type: "write",
      positionId: "imperial",
      text: "y".repeat(60),
    });
    expect(steelmanReady(s, steelmanContent)).toBe(true);
  });

  it("is unfinished until both sides are ruled", () => {
    const s = runSteelman({ papal: "strong" }, "A real disconfirming find, stated.");
    expect(steelmanPassed(s, steelmanContent)).toBe(false);
  });
});

// ---- Produce ---------------------------------------------------------------

const produceContent: ProduceContent = {
  nodeId: "preterite",
  nodeLabel: "Preterite vs imperfect",
  scene: "Telling a colleague about last week.",
  turns: [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `t${i}`,
    cue: `say thing ${i}`,
    targetForms: ["preterite"],
    seconds: 30,
  })),
};

function runProduce(verdicts: ProduceVerdict[]) {
  let s = produceStart(produceContent.nodeId);
  for (const verdict of verdicts) {
    s = produceReducer(s, { type: "said", text: "algo" }, produceContent);
    s = produceReducer(s, { type: "judged", verdict, read: "r" }, produceContent);
    s = produceReducer(s, { type: "next" }, produceContent);
  }
  return s;
}

describe("Produce", () => {
  it("passes a learner who produced it live", () => {
    const s = runProduce(["good", "good", "good", "good", "wrong", "good"]);
    expect(producePassed(s, produceContent)).toBe(true);
  });

  it("takes one attempt per turn — a retry until it lands is rehearsal", () => {
    let s = produceStart(produceContent.nodeId);
    s = produceReducer(s, { type: "said", text: "first" }, produceContent);
    s = produceReducer(s, { type: "said", text: "second" }, produceContent);
    expect(s.saidBy.t0).toBe("first");
  });

  it("fails a learner who was understood every time by going around the form", () => {
    // Every `thin` turn was comprehensible. This is the speaker who is
    // understood for years and never improves, and a plain score cannot see it.
    const s = runProduce(["good", "good", "good", "good", "thin", "thin"]);
    expect(produceAvoided(s, produceContent)).toHaveLength(2);
    expect(producePassed(s, produceContent)).toBe(false);
  });

  it("does not count avoidance as partial credit", () => {
    // Four good + two thin would be "two thirds" only if thin counted.
    const s = runProduce(["good", "thin", "thin", "thin", "good", "good"]);
    expect(producePassed(s, produceContent)).toBe(false);
  });

  it("forgives one dodge", () => {
    const s = runProduce(["good", "good", "good", "good", "thin", "good"]);
    expect(producePassed(s, produceContent)).toBe(true);
  });
});
