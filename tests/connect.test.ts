import { describe, expect, it } from "vitest";
import {
  connectCards,
  connectLinkedCount,
  connectPool,
  connectReady,
  connectReducer,
  connectStart,
  type ConceptNode,
  type ConnectSession,
  type ElaborationContent,
} from "@/lib/curriculum";

const content: ElaborationContent = {
  centerId: "linear-transformations",
  centerLabel: "Linear transformations",
  encoding: "conceptual",
  detectNote: "wiring, not memorizing",
  center: { x: 290, y: 210 },
  cands: [
    { id: "vectors", label: "Vectors", x: 104, y: 66, rel: "maps vectors" },
    {
      id: "matrices",
      label: "Matrices",
      x: 408,
      y: 92,
      rel: "represented by a matrix",
    },
    {
      id: "basis",
      label: "Basis",
      x: 472,
      y: 314,
      rel: "determined on the basis",
    },
  ],
};

const listLike: ElaborationContent = {
  ...content,
  centerId: "krebs",
  centerLabel: "Krebs cycle",
  encoding: "list-like",
  items: ["citrate", "isocitrate", "succinate"],
  mnemonics: [
    { kind: "Acronym", title: "CIS", body: "Citrate Isocitrate Succinate" },
    { kind: "Acronym", title: "alt", body: "another aid" },
  ],
};

const run = (
  actions: Parameters<typeof connectReducer>[1][],
  c: ElaborationContent = content,
): ConnectSession =>
  actions.reduce((s, a) => connectReducer(s, a, c), connectStart(c.centerId));

describe("connect reducer", () => {
  it("opens the prompt blank so the learner generates, and keeps edits after", () => {
    const opened = run([{ type: "select", id: "vectors" }]);
    expect(opened.drafts.vectors).toBeUndefined();

    const edited = run([
      { type: "select", id: "vectors" },
      { type: "draft", id: "vectors", value: "my own words" },
      { type: "select", id: "matrices" },
      { type: "select", id: "vectors" },
    ]);
    expect(edited.drafts.vectors).toBe("my own words");
  });

  it("keeps a deliberately cleared draft cleared", () => {
    const s = run([
      { type: "select", id: "vectors" },
      { type: "draft", id: "vectors", value: "" },
      { type: "select", id: "matrices" },
      { type: "select", id: "vectors" },
    ]);
    expect(s.drafts.vectors).toBe("");
  });

  it("ignores a mnemonic pick that is out of range", () => {
    const s = run([{ type: "pickMnemonic", index: 9 }], listLike);
    expect(s.mnemonicPick).toBeNull();
  });

  it("will not accept an aid that was never picked", () => {
    expect(run([{ type: "acceptMnemonic" }], listLike).mnemonicAccepted).toBe(false);
  });

  it("re-picking an aid drops the previous acceptance", () => {
    const s = run(
      [
        { type: "pickMnemonic", index: 0 },
        { type: "acceptMnemonic" },
        { type: "pickMnemonic", index: 1 },
      ],
      listLike,
    );
    expect(s.mnemonicAccepted).toBe(false);
    expect(s.mnemonicDraft).toBe("another aid");
  });
});

describe("connect advance gate", () => {
  it("needs two links when two are on offer", () => {
    const one = run([{ type: "confirm", id: "vectors" }]);
    expect(connectLinkedCount(one)).toBe(1);
    expect(connectReady(one, content.cands.length)).toBe(false);

    const two = run([
      { type: "confirm", id: "vectors" },
      { type: "confirm", id: "matrices" },
    ]);
    expect(connectReady(two, content.cands.length)).toBe(true);
  });

  it("is not a dead end when the web only ever offered one candidate", () => {
    const solo: ElaborationContent = { ...content, cands: [content.cands[0]] };
    const s = run([{ type: "confirm", id: "vectors" }], solo);
    expect(connectReady(s, solo.cands.length)).toBe(true);
  });
});

describe("connect cards", () => {
  it("drafts one card per confirmed link, keyed stably", () => {
    const s = run([
      { type: "select", id: "vectors" },
      { type: "draft", id: "vectors", value: "my own words" },
      { type: "confirm", id: "vectors" },
      { type: "confirm", id: "matrices" },
    ]);
    const cards = connectCards(s, content);
    expect(cards.map((c) => c.key)).toEqual([
      "linear-transformations-connect-vectors",
      "linear-transformations-connect-matrices",
    ]);
    expect(cards[0].back).toBe("my own words");
    // Never confirmed with a blank back: an untouched draft falls back to the
    // relationship the map suggested.
    expect(cards[1].back).toBe("represented by a matrix");
  });

  it("falls back to the map's draft when the learner confirms whitespace", () => {
    const s = run([
      { type: "select", id: "vectors" },
      { type: "draft", id: "vectors", value: "   " },
      { type: "confirm", id: "vectors" },
    ]);
    expect(connectCards(s, content)[0].back).toBe("maps vectors");
  });

  it("re-running the phase produces the same keys, so Review cannot double up", () => {
    const first = run([
      { type: "confirm", id: "vectors" },
      { type: "confirm", id: "matrices" },
    ]);
    const again = run([
      { type: "confirm", id: "matrices" },
      { type: "confirm", id: "vectors" },
    ]);
    expect(new Set(connectCards(again, content).map((c) => c.key))).toEqual(
      new Set(connectCards(first, content).map((c) => c.key)),
    );
  });

  it("adds the mnemonic card only once the aid is accepted, list-like only", () => {
    const picked = run(
      [
        { type: "confirm", id: "vectors" },
        { type: "pickMnemonic", index: 0 },
      ],
      listLike,
    );
    expect(connectCards(picked, listLike)).toHaveLength(1);

    const accepted = connectReducer(picked, { type: "acceptMnemonic" }, listLike);
    const cards = connectCards(accepted, listLike);
    expect(cards).toHaveLength(2);
    expect(cards[1].kind).toBe("mnemonic");

    // The same session against conceptual content offers no mnemonic card.
    expect(connectCards(accepted, content).every((c) => c.kind === "link")).toBe(true);
  });

  it("writes card fronts in the learner's language", () => {
    const s = run([{ type: "confirm", id: "vectors" }]);
    expect(connectCards(s, content, "en")[0].front).toContain("what’s the connection?");
    expect(connectCards(s, content, "pt-BR")[0].front).toContain("qual é a conexão?");
  });
});

describe("connectPool", () => {
  const nodes: ConceptNode[] = [
    { id: "a", label: "A", state: "unknown", g: 1, week: 0, x: 0, y: 0 },
    { id: "b", label: "B", state: "unknown", g: 1, week: 0, x: 0, y: 0 },
    { id: "c", label: "C", state: "unknown", g: 2, week: 0, x: 0, y: 0 },
    { id: "d", label: "D", state: "unknown", g: 2, week: 0, x: 0, y: 0 },
    {
      id: "g1",
      label: "Gap",
      state: "unknown",
      g: 2,
      week: 0,
      x: 0,
      y: 0,
      gap: true,
    },
  ];

  it("offers only nodes the learner has touched — never untouched ones", () => {
    // The bug: an untouched map used to fall back to the neighbourhood, asking
    // the learner to wire into concepts they had never met.
    expect(connectPool(nodes, {}, "a")).toEqual([]);
    expect(connectPool(nodes, { b: "learning", c: "unknown" }, "a")).toEqual([
      { id: "b", label: "B" },
    ]);
  });

  it("drops gaps and the node being connected, most-owned first", () => {
    const pool = connectPool(
      nodes,
      {
        a: "mastered",
        b: "learning",
        c: "mastered",
        d: "shaky",
        g1: "mastered",
      },
      "a",
    );
    expect(pool.map((p) => p.id)).toEqual(["c", "d", "b"]);
  });
});
