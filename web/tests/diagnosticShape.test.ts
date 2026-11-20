// The placement probe's SHAPE follows the domain — `compute` for formal,
// `speak` for performative, `order` for interpretive — and the server has
// carried that table since the axis shipped.
//
// It never fired. `domain` was optional on `DiagnosticQuestionParams`, so both
// call sites simply never passed it, `nodeAxes` resolved `general` on every
// request, and every learner in production got the default MCQ. Verified live
// on 2026-09-17: a `formal` map produced a genuinely computational question
// ("Av = λv, what is λ?") that the model then had to wrap in four options,
// because the shape it was handed had options in it. Nothing errored, and
// placement is what the map prunes on.
//
// The real guard against that is the type: `domain` is REQUIRED now, so a call
// site cannot forget it and the build fails if one tries. What is left for a
// runtime test is the other half — that what a caller computes actually
// reaches the server rather than being dropped in transit.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDiagnosticQuestion } from "@/lib/api";
import { topicDomainOf } from "@/lib/curriculum";

const posted: Array<Record<string, unknown>> = [];

const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      id: "dq-1",
      nodeId: "n1",
      tag: "Eigenvalues",
      difficulty: "medium",
      type: "compute",
      q: "Av = λv for A = [[2,1],[0,3]] and v = (1,1). What is λ?",
      expected: ["3"],
      note: "",
    }),
  } as unknown as Response;
});

const ask = (domain: Parameters<typeof topicDomainOf>[0][number]["domain"]) =>
  fetchDiagnosticQuestion({
    topic: "Eigenvalues and Eigenvectors",
    goal: "mastery",
    interests: "",
    domain: domain ?? "general",
    pool: [{ id: "n1", label: "Eigenvalue Eigenvector Definition" }],
    difficulty: "medium",
  });

describe("the placement probe carries its domain to the server", () => {
  beforeEach(() => {
    posted.length = 0;
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends every shaped domain, not just the one that was tested", async () => {
    for (const domain of ["formal", "performative", "interpretive"] as const) {
      posted.length = 0;
      await ask(domain);
      expect(posted[0]).toMatchObject({ kind: "diagnosticQuestion", domain });
    }
  });

  it("sends what the map was actually read as", async () => {
    // End to end from the nodes the build produced: the value a caller derives
    // is the value the server is asked with.
    const nodes = [
      { domain: "interpretive" as const },
      { domain: "interpretive" as const },
    ];
    await ask(topicDomainOf(nodes));
    expect(posted[0]).toMatchObject({ domain: "interpretive" });
  });

  it("still sends `general`, which the server drops from the key itself", async () => {
    // Harmless by design: `nodeAxes` omits it, so an unshaped map keys to the
    // row a pre-domain request wrote. See contentCache.test.ts.
    await ask("general");
    expect(posted[0]).toMatchObject({ domain: "general" });
  });
});
