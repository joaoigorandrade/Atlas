// W2.7: a Provenance excerpt is checked against the page it names, on an
// allow-list of public-domain corpora, before it is cached.
import { describe, expect, it } from "vitest";
import { allowedSource, matchRatio, pageText } from "@/lib/server/sources";

const page = pageText(
  "<html><body><p>We believe in one God, the Father Almighty, maker of all things visible and invisible;</p><script>x()</script><p>and in one Lord Jesus Christ, the Son of God, begotten of the Father.</p></body></html>",
);

describe("allowedSource", () => {
  it("admits only the listed corpora", () => {
    expect(allowedSource("https://www.newadvent.org/fathers/3801.htm")).toBe(
      "https://www.newadvent.org/fathers/3801.htm",
    );
    expect(allowedSource("https://example.com/nicaea")).toBeNull();
    expect(allowedSource("https://newadvent.org.evil.com/x")).toBeNull();
    expect(allowedSource(null)).toBeNull();
  });
});

describe("matchRatio", () => {
  it("finds a quote with modernised punctuation and accents", () => {
    expect(
      matchRatio(
        "we believe in one God — the Father almighty, Maker of all things",
        page,
      ),
    ).toBe(1);
  });
  it("does not mistake a paraphrase for a quote", () => {
    expect(
      matchRatio("the council said the son is equal in being to the father", page),
    ).toBeLessThan(0.9);
  });
});
