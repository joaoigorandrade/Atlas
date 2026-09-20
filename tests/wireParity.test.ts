// The two clients agree on the wire, or this fails.
//
// `NodeDelta` is the write side — the shape both clients send learner progress
// in — and it is hand-written twice: a TypeScript interface in
// `lib/persistence.ts` and a Swift struct with a hand-rolled `encode(to:)` in
// `AtlasRun.swift`. Nothing made the two agree, and twice now they did not:
//
//   - `domain` was added to the TS delta and to Swift's `ConceptNode`, but not
//     to Swift's `NodeDelta`. The phone resolved the right interpretive ladder,
//     sent `phasePlan`, and dropped the axis — every map built on a phone
//     stored `domain = null` beside a plan naming `provenance`, a row that
//     disagrees with itself and keys every later generation to the wrong
//     cache row. Found by driving a simulator against production.
//   - `phaseProgress` was added to the TS delta, the column, the server and
//     bootstrap, and never reached Swift at all.
//
// Both were silent, and both are the same failure: a field that exists on one
// side and is quietly dropped by the other. Reading the two files as text is
// deliberately blunt — it needs no Swift toolchain in CI, and the thing worth
// catching is a field that is *missing*, which a parser this crude sees fine.
//
// A field that genuinely must not cross to iOS goes in `WEB_ONLY` below, with
// the reason. An empty exemption list is the honest default.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TS_SRC = readFileSync("lib/persistence.ts", "utf8");
const SWIFT_SRC = readFileSync(
  "ios/AtlasKit/Sources/AtlasKit/Data/AtlasRun.swift",
  "utf8",
);

/** Fields the web sends that the phone deliberately does not. Each one needs a
 *  reason — "iOS doesn't do that yet" is a bug, not an exemption. */
const WEB_ONLY: Record<string, string> = {};

/** The body of a `{ ... }` block, from the line that opens it. Brace-counted
 *  rather than regexed, so a nested type doesn't end the block early. */
function blockAfter(src: string, opener: string): string {
  const start = src.indexOf(opener);
  expect(start, `\`${opener}\` not found — did it get renamed?`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0)
      return src.slice(src.indexOf("{", start) + 1, i);
  }
  throw new Error(`unterminated block for \`${opener}\``);
}

/** `name?: T;` / `name: T;` at the head of a line, comments and docs skipped. */
function tsFields(body: string): string[] {
  return [...body.matchAll(/^\s{2}(\w+)\??\s*:/gm)].map((m) => m[1]);
}

/** `public var name: T` — the struct's own stored properties. */
function swiftProperties(body: string): string[] {
  return [...body.matchAll(/^\s*public var (\w+)\s*:/gm)].map((m) => m[1]);
}

describe("NodeDelta stays the same shape on both clients", () => {
  const ts = tsFields(blockAfter(TS_SRC, "export interface NodeDelta {"));
  const swiftBody = blockAfter(SWIFT_SRC, "public struct NodeDelta:");
  const swift = swiftProperties(swiftBody);

  it("reads a plausible field list from each side", () => {
    // A parser that silently matches nothing would make every assertion below
    // vacuous, so pin the shape of the parse itself.
    expect(ts).toContain("id");
    expect(ts.length).toBeGreaterThan(15);
    expect(swift).toContain("id");
    expect(swift.length).toBeGreaterThan(15);
  });

  it("carries every field the web sends", () => {
    const missing = ts.filter((f) => !swift.includes(f) && !(f in WEB_ONLY));
    expect(
      missing,
      `Swift's NodeDelta is missing ${missing.join(", ")}. A field the web ` +
        `sends and the phone doesn't is learner data dropped on the floor — ` +
        `add it to the struct, the Key enum and encode(to:), or list it in ` +
        `WEB_ONLY with a reason.`,
    ).toEqual([]);
  });

  it("sends nothing the web's contract doesn't define", () => {
    const extra = swift.filter((f) => !ts.includes(f));
    expect(
      extra,
      `Swift's NodeDelta declares ${extra.join(", ")}, which \`NodeDelta\` in ` +
        `lib/persistence.ts does not — the server will ignore it.`,
    ).toEqual([]);
  });

  it("actually encodes every property it declares", () => {
    // The `domain` bug's exact shape one layer down: a property that exists,
    // is set at the call site, and never reaches the JSON because the
    // hand-written encoder forgot its line.
    const encode = blockAfter(swiftBody, "public func encode(to encoder: Encoder)");
    const unencoded = swift.filter((f) => !encode.includes(`.${f})`));
    expect(
      unencoded,
      `Swift's NodeDelta declares ${unencoded.join(", ")} but encode(to:) ` +
        `never writes ${unencoded.length === 1 ? "it" : "them"}.`,
    ).toEqual([]);
  });

  it("names every property in its CodingKeys", () => {
    const keys = blockAfter(swiftBody, "private enum Key: String, CodingKey");
    const unkeyed = swift.filter((f) => !new RegExp(`\\b${f}\\b`).test(keys));
    expect(unkeyed, `no CodingKey for ${unkeyed.join(", ")}`).toEqual([]);
  });
});
