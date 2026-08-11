import { describe, expect, it } from "vitest";
import {
  AtlasError,
  codeForStatus,
  isErrorCode,
  toAtlasError,
} from "@/lib/errors";
import { WarmDeclined } from "@/lib/api";
import { BadRequest } from "@/lib/server/job";

describe("codeForStatus", () => {
  it("maps the statuses the app actually answers with", () => {
    expect(codeForStatus(401)).toBe("auth");
    expect(codeForStatus(403)).toBe("auth");
    expect(codeForStatus(404)).toBe("notfound");
    expect(codeForStatus(408)).toBe("timeout");
    expect(codeForStatus(429)).toBe("rate_limit");
    expect(codeForStatus(504)).toBe("timeout");
    expect(codeForStatus(502)).toBe("upstream");
    expect(codeForStatus(503)).toBe("upstream");
    expect(codeForStatus(400)).toBe("invalid");
    expect(codeForStatus(422)).toBe("invalid");
  });

  it("does not classify a success", () => {
    expect(codeForStatus(200)).toBe("unknown");
  });
});

describe("retryable", () => {
  it("is true only where a second attempt is a different roll", () => {
    for (const code of ["offline", "timeout", "rate_limit", "upstream"] as const)
      expect(new AtlasError(code, "x").retryable).toBe(true);
    // Retrying these unchanged can only fail the same way.
    for (const code of ["auth", "invalid", "notfound", "declined"] as const)
      expect(new AtlasError(code, "x").retryable).toBe(false);
  });
});

describe("toAtlasError", () => {
  it("returns an AtlasError by identity, never re-wrapping", () => {
    const original = new AtlasError("rate_limit", "slow down");
    expect(toAtlasError(original)).toBe(original);
  });

  it("keeps WarmDeclined intact through normalization", () => {
    // The regression this guards: `generate()` branches on
    // `instanceof WarmDeclined`, so re-wrapping a declined warm would turn a
    // control-flow signal into a user-visible failure.
    const declined = new WarmDeclined();
    const normalized = toAtlasError(declined);
    expect(normalized).toBe(declined);
    expect(normalized).toBeInstanceOf(WarmDeclined);
    expect(normalized.code).toBe("declined");
    expect(normalized.retryable).toBe(false);
  });

  it("recognizes BadRequest across the client/server seam", () => {
    // By `name`, not `instanceof` — client code cannot import lib/server. The
    // class sets `this.name` explicitly for exactly this reason: an Error
    // subclass inherits `name === "Error"` otherwise.
    expect(new BadRequest("nope").name).toBe("BadRequest");
    expect(toAtlasError(new BadRequest("nope")).code).toBe("invalid");
  });

  it("classifies anything carrying a numeric status", () => {
    // How an OpenRouterError arrives — it has `.status` and no special name.
    const upstream = Object.assign(new Error("OpenRouter 429: slow down"), {
      status: 429,
    });
    const normalized = toAtlasError(upstream);
    expect(normalized.code).toBe("rate_limit");
    expect(normalized.status).toBe(429);
  });

  it("reads a rejected fetch as upstream when the browser claims to be online", () => {
    expect(toAtlasError(new TypeError("Failed to fetch")).code).toBe("upstream");
  });

  it("reads a rejected fetch as offline when the browser says so", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    try {
      expect(toAtlasError(new TypeError("Failed to fetch")).code).toBe("offline");
    } finally {
      if (original)
        Object.defineProperty(globalThis, "navigator", {
          value: original,
          configurable: true,
        });
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  it("treats an aborted request as a timeout, not a failure", () => {
    const aborted = new Error("The operation was aborted");
    aborted.name = "AbortError";
    expect(toAtlasError(aborted).code).toBe("timeout");
  });

  it("survives the things a catch block is actually handed", () => {
    expect(toAtlasError(new Error("plain")).code).toBe("unknown");
    expect(toAtlasError("just a string").message).toBe("just a string");
    expect(toAtlasError(null).code).toBe("unknown");
    expect(toAtlasError(undefined).message).toBe("something went wrong");
  });

  it("preserves the cause so the log line can still reach the original", () => {
    const root = new Error("root");
    expect(toAtlasError(root).cause).toBe(root);
  });
});

describe("isErrorCode", () => {
  it("accepts known codes and rejects anything else", () => {
    expect(isErrorCode("offline")).toBe(true);
    expect(isErrorCode("upstream")).toBe(true);
    // A server shipping a code this client has never heard of must fall back
    // rather than produce an empty message.
    expect(isErrorCode("teapot")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
    expect(isErrorCode(502)).toBe(false);
  });
});
