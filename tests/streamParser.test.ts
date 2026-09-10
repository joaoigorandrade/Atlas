import { describe, expect, it } from "vitest";
import {
  closePartialJson,
  extractCompleteObjects,
  slots,
} from "@/lib/server/streamingJson";

describe("extractCompleteObjects", () => {
  it("extracts nothing from a partial object", () => {
    const { objects, rest } = extractCompleteObjects('{"a": 1, "b":');
    expect(objects).toEqual([]);
    expect(rest).toBe('{"a": 1, "b":');
  });

  it("extracts one compact object and keeps no rest", () => {
    const { objects, rest } = extractCompleteObjects('{"a":1}');
    expect(objects).toEqual(['{"a":1}']);
    expect(rest).toBe("");
  });

  it("extracts multiple objects arriving pretty-printed across chunks", () => {
    const chunk1 = '{\n  "a": 1,\n  "b": {"nested": true}\n}\n{"c":';
    const { objects, rest } = extractCompleteObjects(chunk1);
    expect(objects).toEqual(['{\n  "a": 1,\n  "b": {"nested": true}\n}']);
    expect(JSON.parse(objects[0])).toEqual({ a: 1, b: { nested: true } });
    expect(rest.trim()).toBe('{"c":');

    const { objects: more, rest: rest2 } = extractCompleteObjects(rest + "2}");
    expect(more).toEqual(['{"c":2}']);
    expect(rest2).toBe("");
  });

  // The bug this guards: a wrapper never returns to depth 0 until its final
  // brace, so a map that arrived as {"nodes":[...]} streamed nothing and landed
  // in one burst at the end — 23.6s of blank building screen.
  it('streams the items of a {"nodes":[...]} wrapper before it closes', () => {
    const first = extractCompleteObjects('{"nodes": [{"id":"a"},{"id":"b"},{"id');
    expect(first.objects.map((o) => JSON.parse(o))).toEqual([{ id: "a" }, { id: "b" }]);

    // ...and the wrapper's own tail is not mistaken for an item.
    const last = extractCompleteObjects(first.rest + '":"c"}]}');
    expect(last.objects.map((o) => JSON.parse(o))).toEqual([{ id: "c" }]);
  });

  it("streams the items of a bare array as they close", () => {
    const { objects } = extractCompleteObjects('[{"id":"a"},{"id":"b"');
    expect(objects.map((o) => JSON.parse(o))).toEqual([{ id: "a" }]);
  });

  // The one single-key-array payload in the app that is NOT a wrapper: the
  // too-broad answer is validated whole, so it must arrive whole (#30).
  it("keeps a too-broad scope answer as one object", () => {
    const raw = '{"tooBroad": true, "scopes": [{"label":"x","note":"y"}]}';
    const { objects } = extractCompleteObjects(raw);
    expect(objects.map((o) => JSON.parse(o))).toEqual([JSON.parse(raw)]);

    const reordered = '{"scopes": [{"label":"x","note":"y"}], "tooBroad": true}';
    expect(extractCompleteObjects(reordered).objects.map((o) => JSON.parse(o))).toEqual([
      JSON.parse(reordered),
    ]);
  });

  it("ignores braces and quotes inside string values", () => {
    const { objects, rest } = extractCompleteObjects(
      '{"body": "a {weird} \\"quoted\\" sentence"}',
    );
    expect(objects.length).toBe(1);
    expect(JSON.parse(objects[0])).toEqual({
      body: 'a {weird} "quoted" sentence',
    });
    expect(rest).toBe("");
  });
});

describe("closePartialJson", () => {
  const close = (s: string) => closePartialJson(s);

  it("closes an unterminated string mid-word", () => {
    expect(close('{"p": "the mechanism is a feed')).toEqual({
      p: "the mechanism is a feed",
    });
  });

  it("keeps the members already written and drops a dangling key", () => {
    expect(close('{"label": "What it is", "text": ')).toEqual({
      label: "What it is",
    });
    expect(close('{"label": "What it is", "text"')).toEqual({
      label: "What it is",
    });
    expect(close('{"label": "What it is",')).toEqual({ label: "What it is" });
  });

  it("closes nested structures", () => {
    expect(close('{"a": {"b": [1, 2')).toEqual({ a: { b: [1, 2] } });
  });

  it("is not fooled by braces or escaped quotes inside a string", () => {
    expect(close('{"p": "a {weird} \\"quoted\\" half')).toEqual({
      p: 'a {weird} "quoted" half',
    });
  });

  it("survives a buffer cut on an escape character", () => {
    expect(close('{"p": "line one\\')).toEqual({ p: "line one" });
  });

  it("returns null when nothing coherent has arrived", () => {
    expect(close("")).toBeNull();
    expect(close("   \n")).toBeNull();
    expect(close("{")).toBeNull();
    expect(close('{"')).toBeNull();
  });
});

describe("slots", () => {
  const asSection = (raw: unknown, i: number) => {
    const s = raw as { example?: unknown; kicker?: unknown };
    if (typeof s?.example !== "object" || s.example === null)
      throw new Error(`chunks[${i}].example must be an object`);
    return s.kicker as string;
  };

  it("takes the objects the model was asked for", () => {
    const raws = ['{"kicker":"a","example":{}}', '{"kicker":"b","example":{}}'];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["a", "b"]);
  });

  // The whole reason this exists: the model wraps the list despite being told
  // not to, and the wrapper used to fail as `chunks[0].example` and cost a
  // second whole generation.
  it("unwraps the {chunks: [...]} object the model was told not to send", () => {
    const raws = ['{"chunks":[{"kicker":"a","example":{}},{"kicker":"b","example":{}}]}'];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["a", "b"]);
  });

  // What the model actually sends when told to write bare objects: it numbers
  // them. Captured off production — `{"secao1": {...}}`, one per frame.
  it("unwraps the numbered single-key object the model actually sends", () => {
    const raws = [
      '{"secao1":{"kicker":"a","example":{}}}',
      '{"secao2":{"kicker":"b","example":{}}}',
    ];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["a", "b"]);
  });

  it("leaves a real section alone — it never has a single field", () => {
    const raws = ['{"kicker":"a","example":{},"takeaway":"t"}'];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["a"]);
  });

  it("unwraps a bare top-level array too", () => {
    const raws = ['[{"kicker":"a","example":{}}]'];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["a"]);
  });

  it("drops the slot the model wrote badly and keeps the rest", () => {
    const raws = ['{"chunks":[{"kicker":"a"},{"kicker":"b","example":{}}]}'];
    expect([...slots(raws, 0, "consume-stream", asSection)]).toEqual(["b"]);
  });

  it("numbers from `from`, counting only what it yields", () => {
    const seen: number[] = [];
    const raws = ['{"chunks":[{"kicker":"a","example":{}},{"kicker":"b","example":{}}]}'];
    [
      ...slots(raws, 3, "x", (raw, i) => {
        seen.push(i);
        return raw;
      }),
    ];
    expect(seen).toEqual([3, 4]);
  });

  it("skips a raw that is not JSON at all rather than throwing", () => {
    expect([...slots(["not json"], 0, "x", (raw) => raw)]).toEqual([]);
  });
});
