import { describe, expect, it } from "vitest";
import { extractCompleteObjects } from "@/lib/server/openrouter";

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
