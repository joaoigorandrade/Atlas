// Native clients (ios/) authenticate with `Authorization: Bearer <token>`
// instead of cookies (ios/PLAN.md — the one server change). The branch lives in
// `createClient`, so no route knows about it; what has to hold is that the
// token reaches PostgREST (RLS) *and* `getClaims()` without being asked for.

import { beforeEach, expect, it, vi } from "vitest";

let requestHeaders = new Headers();
const created: Array<Record<string, unknown>> = [];
const getClaims = vi.fn(async (jwt?: string) => ({
  data: { claims: { sub: jwt } },
  error: null,
}));

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: Record<string, unknown>) => {
    created.push(options);
    return { auth: { getClaims } };
  },
}));

beforeEach(() => {
  created.length = 0;
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable");
});

it("authenticates a bearer caller and passes the token to PostgREST", async () => {
  requestHeaders = new Headers({ authorization: "Bearer token-abc" });
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  expect((created[0].global as { headers: Record<string, string> }).headers).toEqual({
    Authorization: "Bearer token-abc",
  });
  // The route calls getClaims() with no argument — the branch supplies the token.
  const { data } = await supabase.auth.getClaims();
  expect(data?.claims?.sub).toBe("token-abc");
});

it("falls back to cookies when there is no bearer header", async () => {
  requestHeaders = new Headers();
  const { createClient } = await import("@/lib/supabase/server");
  await createClient();

  expect(created[0].global).toBeUndefined();
  expect(created[0].cookies).toBeDefined();
});
