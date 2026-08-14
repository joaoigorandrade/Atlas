import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Rich from "@/components/Rich";
import { spokenText, tokenSlice, tokenizeRich } from "@/lib/rich";

const html = (text: string) => renderToStaticMarkup(createElement(Rich, { text }));

test("inline code loses its backticks and becomes a <code>", () => {
  const out = html("Em `func soma() async -> Int`, qual afirmação é correta?");
  expect(out).not.toContain("`");
  expect(out).toContain("<code");
  expect(out).toContain("func soma() async -&gt; Int");
});

test("bold and italic markers are consumed", () => {
  const out = html("**bold** and *italic* and _under_");
  expect(out).toBe(
    '<span style="min-width:0"><strong style="font-weight:600">bold</strong> and <em>italic</em> and <em>under</em></span>',
  );
});

test("fenced blocks become a <pre> and keep surrounding prose", () => {
  const out = html("Antes\n```swift\nlet a = 1\n```\ndepois");
  expect(out).toContain("display:block");
  expect(out).toContain("let a = 1");
  expect(out).toContain("Antes");
  expect(out).toContain("depois");
  expect(out).not.toContain("```");
});

test("plain text and empty input pass through untouched", () => {
  expect(html("a * b * c is fine")).toContain("a ");
  expect(html("")).toBe("");
});

// ---- the spoken string ----------------------------------------------------
// Read-aloud sends `spokenText()` to the engine and gets character offsets
// back, so these two have to agree exactly or the highlight lands on the wrong
// word — silently, and only on prose that happens to carry markup.

test("spokenText strips every marker the renderer consumes", () => {
  expect(spokenText("**bold** and *italic* and _under_ and `code`")).toBe(
    "bold and italic and under and code",
  );
});

test("spokenText drops fenced blocks, which are not prose", () => {
  expect(spokenText("Antes\n```swift\nlet a = 1\n```\ndepois")).toBe(
    "Antes\n\ndepois",
  );
});

test("token offsets index into spokenText", () => {
  const text = "A **matrix** acts on `space`.";
  const spoken = spokenText(text);
  expect(spoken).toBe("A matrix acts on space.");
  for (const token of tokenizeRich(text)) {
    if (token.at < 0) continue;
    expect(spoken.slice(token.at, token.at + token.text.length)).toBe(token.text);
  }
});

test("a fence contributes no offset and shifts nothing after it", () => {
  const text = "one\n```\nx\n```\n**two**";
  const spoken = spokenText(text);
  const tokens = tokenizeRich(text);
  const fence = tokens.find((t) => t.kind === "fence");
  const bold = tokens.find((t) => t.kind === "bold");
  expect(fence?.at).toBe(-1);
  expect(bold && spoken.slice(bold.at, bold.at + bold.text.length)).toBe("two");
});

test("tokenSlice clamps a range to the token it lands in", () => {
  const [token] = tokenizeRich("matrix");
  expect(tokenSlice(token, { from: 0, to: 3 })).toEqual({ from: 0, to: 3 });
  // A word spanning a markup boundary highlights its share of each token.
  expect(tokenSlice(token, { from: 4, to: 99 })).toEqual({ from: 4, to: 6 });
  expect(tokenSlice(token, { from: 9, to: 12 })).toBeNull();
  expect(tokenSlice(token, null)).toBeNull();
});

test("the highlight marks only the spoken slice", () => {
  const out = renderToStaticMarkup(
    createElement(Rich, { text: "matrix acts", speak: { from: 0, to: 6 } }),
  );
  expect(out).toContain("matrix");
  expect(out).toContain(" acts");
  // One mark, not a span per word.
  expect(out.match(/border-radius:3px/g)?.length).toBe(1);
});
