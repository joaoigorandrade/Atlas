import { describe, expect, it } from "vitest";
import { closePartialJson, extractCompleteObjects } from "@/lib/server/openrouter";

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
