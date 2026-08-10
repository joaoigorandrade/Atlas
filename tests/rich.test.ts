import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Rich from "@/components/Rich";

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
