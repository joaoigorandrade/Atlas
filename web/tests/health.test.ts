import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, from, select, limit, logWarning } = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/log", () => ({ logWarning }));
vi.mock("@/lib/server/apiError", () => ({
  newRequestId: () => "health-test-request",
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createClient.mockResolvedValue({ from });
    from.mockReturnValue({ select });
    select.mockReturnValue({ limit });
    limit.mockResolvedValue({ data: [], error: null });
  });

  it("probes the normalized topics table and accepts an empty RLS result", async () => {
    const response = await GET();

    expect(from).toHaveBeenCalledExactlyOnceWith("topics");
    expect(select).toHaveBeenCalledExactlyOnceWith("id");
    expect(limit).toHaveBeenCalledExactlyOnceWith(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      supabase: "up",
      ms: expect.any(Number),
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  it("returns 503 without exposing database error details", async () => {
    limit.mockResolvedValue({
      error: { message: "private database connection detail" },
    });
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      supabase: "down",
      ms: expect.any(Number),
    });
    expect(logWarning).toHaveBeenCalledWith(
      "health_supabase_down",
      new Error("private database connection detail"),
      { req: "health-test-request" },
    );
  });

  it("returns 503 when creating the database client throws", async () => {
    createClient.mockRejectedValue(new Error("missing configuration"));
    const response = await GET();

    expect(response.status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ ok: false, supabase: "down" });
    expect(logWarning).toHaveBeenCalledOnce();
  });
});
