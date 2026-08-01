import { describe, expect, it } from "vitest";
import { contentKey } from "@/lib/server/contentCache";

// The cache key is the whole mechanism: a warm and the click that follows it
// must hash to the same row, and two genuinely different requests must not.

describe("contentKey", () => {
  it("ignores property order", () => {
    const a = contentKey("consume", {
      topic: "Fourier analysis",
      nodeLabel: "Convolution",
      interests: "audio",
    });
    const b = contentKey("consume", {
      interests: "audio",
      nodeLabel: "Convolution",
      topic: "Fourier analysis",
    });
    expect(a).toBe(b);
  });

  it("ignores undefined-valued keys, so an omitted field matches an empty one", () => {
    const a = contentKey("curriculum", { topic: "Rust", outline: undefined });
    const b = contentKey("curriculum", { topic: "Rust" });
    expect(a).toBe(b);
  });

  it("separates kinds sharing identical params", () => {
    const params = { topic: "Rust", nodeLabel: "Borrowing", interests: "" };
    expect(contentKey("consume", params)).not.toBe(
      contentKey("socratic", params),
    );
  });

  it("separates learners whose interests differ — content is personalized", () => {
    const base = { topic: "Rust", nodeLabel: "Borrowing" };
    expect(contentKey("consume", { ...base, interests: "game dev" })).not.toBe(
      contentKey("consume", { ...base, interests: "web servers" }),
    );
  });

  it("keys nested lists by content, not identity", () => {
    const a = contentKey("connect", {
      topic: "Rust",
      pool: [{ id: "n1", label: "Ownership" }],
    });
    const b = contentKey("connect", {
      topic: "Rust",
      pool: [{ label: "Ownership", id: "n1" }],
    });
    expect(a).toBe(b);
  });

  it("distinguishes a different pool — the content references it", () => {
    const a = contentKey("connect", { pool: [{ id: "n1", label: "Ownership" }] });
    const b = contentKey("connect", { pool: [{ id: "n2", label: "Lifetimes" }] });
    expect(a).not.toBe(b);
  });
});
