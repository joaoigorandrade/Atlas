// The fixture contract (docs/PLAN-QUALITY.md §1.1). The e2e suite is the real
// check on these payloads; this is the cheap one that fails in two seconds when
// a kind stops being answered, or when a context-dependent payload stops
// matching the request it was written for — the two ways fixture mode breaks
// without any type error.

import { describe, expect, it } from "vitest";
import { fixturePayload } from "@/lib/server/fixtures";
import type { GenerateBody } from "@/lib/server/job";

const body = (over: Partial<GenerateBody> = {}): GenerateBody =>
  ({
    kind: "consume",
    topic: "Linear algebra",
    nodeId: "core-rule",
    nodeLabel: "The core rule",
    ...over,
  }) as GenerateBody;

const KINDS = [
  "curriculum",
  "summary",
  "diagnosticQuestion",
  "consume",
  "model",
  "passage",
  "socratic",
  "feynman",
  "connect",
  "crucible",
  "retain",
  "judge",
];

describe("fixturePayload", () => {
  it("answers every kind /api/generate resolves", () => {
    for (const kind of KINDS) expect(fixturePayload(kind, body())).toBeTruthy();
  });

  it("declines a kind it has no payload for, rather than inventing one", () => {
    expect(fixturePayload("nonsense", body())).toBeNull();
  });

  it("draws Connect's candidates from the pool the request offered", () => {
    const pool = [
      { id: "foundations", label: "Foundations" },
      { id: "notation", label: "Notation" },
    ];
    const { content } = fixturePayload("connect", body({ pool })) as {
      content: { cands: Array<{ id: string }> };
    };
    expect(content.cands.map((c) => c.id)).toEqual(["foundations", "notation"]);
  });

  it("keeps Retain's cards on nodes the run has actually learned", () => {
    const nodes = [{ id: "foundations", label: "Foundations", state: "mastered" }];
    const { content } = fixturePayload("retain", body({ kind: "retain", nodes })) as {
      content: { cards: Array<{ node: string }> };
    };
    expect(content.cards.every((c) => c.node === "foundations")).toBe(true);
  });

  it("judges every rubric row — an unjudged row spawns no gap", () => {
    const rubric = [0, 1, 2].map((i) => ({
      subPoint: `point ${i}`,
      mustConvey: ["something"],
    }));
    const { judgement } = fixturePayload(
      "judge",
      body({ kind: "judge", mode: "feynman", rubric }),
    ) as { judgement: { verdicts: Array<{ i: number }> } };
    expect(judgement.verdicts.map((v) => v.i)).toEqual([0, 1, 2]);
  });
});
