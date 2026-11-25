import { describe, expect, it } from "vitest";
import { toWire } from "@/lib/server/vision";
import { sketchUrl } from "@/lib/server/jobInput";
import { performReducer, performStart } from "@/lib/curriculum";

const png = "data:image/png;base64,iVBORw0KGgo=";

describe("a perform sketch on its way to the judge", () => {
  it("leaves a text message as it is and makes an image message multipart", () => {
    expect(toWire({ role: "user", content: "hi" })).toEqual({
      role: "user",
      content: "hi",
    });
    expect(toWire({ role: "user", content: "hi", image: undefined })).toEqual({
      role: "user",
      content: "hi",
    });
    expect(toWire({ role: "user", content: "hi", image: png })).toEqual({
      role: "user",
      content: [
        { type: "text", text: "hi" },
        { type: "image_url", image_url: { url: png } },
      ],
    });
  });

  it("only lets a PNG data URL under the cap through", () => {
    expect(sketchUrl(png)).toBe(png);
    expect(sketchUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeUndefined();
    expect(sketchUrl("https://example.com/a.png")).toBeUndefined();
    expect(sketchUrl(`data:image/png;base64,${"A".repeat(1_600_000)}`)).toBeUndefined();
    expect(sketchUrl(42)).toBeUndefined();
  });

  it("keeps the sketch through a fix and drops it on a new case", () => {
    const drawn = performReducer(performStart("n"), { type: "sketch", value: png });
    expect(performReducer(drawn, { type: "fix", steps: ["a"] }).sketch).toBe(png);
    expect(performReducer(drawn, { type: "rerun" }).sketch).toBeUndefined();
  });
});
