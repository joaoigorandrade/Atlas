// What a write decides to send.
//
// This is the half of persistence that has no screen: `useRunState` owns *when*
// a write goes, and this owns *what*. A bug here is silent — the app looks
// saved, the row is stale — which is why the diff and the write path get their
// own tests rather than being covered incidentally through a hook.

import { beforeEach, describe, expect, it, vi } from "vitest";

const patchNodes = vi.fn(async () => undefined);
const putCards = vi.fn(async () => undefined);
const deleteCards = vi.fn(async () => undefined);
const patchTopic = vi.fn(async () => undefined);

vi.mock("@/lib/persistence", () => ({
  patchNodes: (...a: unknown[]) => patchNodes(...(a as [])),
  putCards: (...a: unknown[]) => putCards(...(a as [])),
  deleteCards: (...a: unknown[]) => deleteCards(...(a as [])),
  patchTopic: (...a: unknown[]) => patchTopic(...(a as [])),
}));

const { projectCards, projectNodes, projectTopic, pushRun } =
  await import("@/components/atlas/runProjection");

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id,
  state: "unknown" as const,
  g: 0,
  week: 0,
  x: 1,
  y: 2,
  ...extra,
});

const run = (over: Record<string, unknown> = {}) =>
  ({
    graph: { nodes: [node("a"), node("b")], edges: [["a", "b", false]] },
    states: {},
    positions: {},
    shakyReasons: {},
    reviewedNodes: [],
    consumeProgress: {},
    socraticProgress: {},
    feynmanProgress: {},
    connectProgress: {},
    ...over,
  }) as Parameters<typeof projectNodes>[0];

const card = (id: string, due = "2026-01-01T00:00:00.000Z") =>
  ({
    id,
    nodeId: "a",
    type: "recall",
    source: "Retain",
    back: "…",
    fsrs: { due },
  }) as never;

const refs = (nodes = {}, cards = {}, topic = "") => ({
  nodes: { current: { ...nodes } },
  cards: { current: { ...cards } },
  topic: { current: topic },
});

beforeEach(() => {
  patchNodes.mockClear();
  putCards.mockClear();
  deleteCards.mockClear();
  patchTopic.mockClear();
});

describe("projectNodes", () => {
  it("prefers a dragged position over the node's generated one", () => {
    const shots = projectNodes(run({ positions: { a: { x: 99, y: 100 } } }));
    expect(JSON.parse(shots.a)).toMatchObject({ x: 99, y: 100 });
    // A node nobody dragged keeps what the generation gave it.
    expect(JSON.parse(shots.b)).toMatchObject({ x: 1, y: 2 });
  });

  it("takes the live state over the node's generated seed", () => {
    const shots = projectNodes(run({ states: { a: "mastered" } }));
    expect(JSON.parse(shots.a).state).toBe("mastered");
    expect(JSON.parse(shots.b).state).toBe("unknown");
  });

  it("carries the flags and records a node owns", () => {
    const shots = projectNodes(
      run({
        graph: { nodes: [node("a", { gap: true, summary: "why" })], edges: [] },
        shakyReasons: { a: "reviewMiss" },
        reviewedNodes: ["a"],
        consumeProgress: { a: { idx: 3 } },
      }),
    );
    expect(JSON.parse(shots.a)).toMatchObject({
      isGap: true,
      summary: "why",
      shakyReason: "reviewMiss",
      reviewed: true,
      consumeProgress: { idx: 3 },
    });
  });

  it("writes null for what a node does not have, rather than dropping the key", () => {
    // A key that disappears would compare equal to a key that was never set,
    // so "this node stopped being shaky" would never reach the server.
    const shots = projectNodes(run());
    expect(JSON.parse(shots.a)).toMatchObject({
      shakyReason: null,
      consumeProgress: null,
      reviewed: false,
    });
  });

  it("is stable across key order, so an unchanged node is not rewritten", () => {
    const once = projectNodes(run({ states: { a: "learning" } }));
    const twice = projectNodes(run({ states: { a: "learning" } }));
    expect(once.a).toBe(twice.a);
  });
});

describe("projectCards and projectTopic", () => {
  it("keys cards by id and notices a graded one", () => {
    const before = projectCards([card("c1")]);
    const after = projectCards([card("c1", "2027-06-01T00:00:00.000Z")]);
    expect(Object.keys(before)).toEqual(["c1"]);
    expect(before.c1).not.toBe(after.c1);
  });

  it("omits a language nobody has recorded rather than guessing one", () => {
    const shot = JSON.parse(
      projectTopic({
        goal: "exam",
        interests: "",
        paretoPct: 20,
        examDate: "",
        language: null,
        calibSamples: [],
        misconceptions: [],
        modalityTally: {},
        litToday: [],
      }),
    );
    expect("language" in shot).toBe(false);
  });
});

describe("pushRun", () => {
  const base = {
    topicId: "t1",
    cards: [],
    cardShots: {},
    topicShot: "",
    edges: [["a", "b", false]] as never,
  };

  it("sends nothing, and reports nothing, when nothing changed", async () => {
    const nodes = projectNodes(run());
    const wrote = await pushRun({ ...base, nodes, saved: refs(nodes) });
    expect(wrote).toBe(false);
    expect(patchNodes).not.toHaveBeenCalled();
  });

  it("sends only the node that moved", async () => {
    const before = projectNodes(run());
    const nodes = projectNodes(run({ positions: { a: { x: 50, y: 60 } } }));
    await pushRun({ ...base, nodes, saved: refs(before) });
    const [, deltas] = patchNodes.mock.calls[0] as unknown as [
      string,
      Array<{ id: string }>,
    ];
    expect(deltas.map((d) => d.id)).toEqual(["a"]);
  });

  it("gives a node the server has never seen its prerequisite edges", async () => {
    const nodes = projectNodes(run());
    await pushRun({ ...base, nodes, saved: refs({ a: nodes.a }) });
    const [, deltas] = patchNodes.mock.calls[0] as unknown as [
      string,
      Array<{ id: string; prereqs?: string[] }>,
    ];
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ id: "b", prereqs: ["a"] });
  });

  it("does not re-send edges for a node the server already has", async () => {
    const before = projectNodes(run());
    const nodes = projectNodes(run({ states: { b: "learning" } }));
    await pushRun({ ...base, nodes, saved: refs(before) });
    const [, deltas] = patchNodes.mock.calls[0] as unknown as [
      string,
      Array<{ prereqs?: string[] }>,
    ];
    expect(deltas[0].prereqs).toBeUndefined();
  });

  it("removes a node that left the map", async () => {
    const nodes = projectNodes(run({ graph: { nodes: [node("a")], edges: [] } }));
    await pushRun({ ...base, nodes, saved: refs({ ...nodes, "b-gap": "{}" }) });
    const [, , removed] = patchNodes.mock.calls[0] as unknown as [
      string,
      unknown,
      string[],
    ];
    expect(removed).toEqual(["b-gap"]);
  });

  it("writes changed cards and deletes dropped ones", async () => {
    const nodes = projectNodes(run());
    const cards = [card("c1")];
    await pushRun({
      ...base,
      nodes,
      cards: cards as never,
      cardShots: projectCards(cards as never),
      saved: refs(nodes, { c2: "{}" }),
    });
    expect(putCards).toHaveBeenCalledOnce();
    const [, ids] = deleteCards.mock.calls[0] as unknown as [string, string[]];
    expect(ids).toEqual(["c2"]);
  });

  it("leaves the baseline where it was when a write fails", async () => {
    // The next tick has to retry. Advancing the baseline optimistically is how
    // a failed save becomes a silently lost one.
    patchNodes.mockRejectedValueOnce(new Error("offline"));
    const before = projectNodes(run());
    const nodes = projectNodes(run({ states: { a: "mastered" } }));
    const saved = refs(before);
    await expect(pushRun({ ...base, nodes, saved })).rejects.toThrow();
    expect(saved.nodes.current).toEqual(before);
  });

  it("advances the baseline once the write lands", async () => {
    const before = projectNodes(run());
    const nodes = projectNodes(run({ states: { a: "mastered" } }));
    const saved = refs(before);
    expect(await pushRun({ ...base, nodes, saved })).toBe(true);
    expect(saved.nodes.current).toEqual(nodes);
  });

  it("patches the topic's own fields on their own", async () => {
    const nodes = projectNodes(run());
    await pushRun({
      ...base,
      nodes,
      topicShot: JSON.stringify({ goal: "pareto" }),
      saved: refs(nodes),
    });
    expect(patchNodes).not.toHaveBeenCalled();
    expect(patchTopic).toHaveBeenCalledWith("t1", { goal: "pareto" });
  });
});
