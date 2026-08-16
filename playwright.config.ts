// Phase 1.4 — the e2e harness (docs/PLAN-QUALITY.md, docs/AGENT-TESTING.md).
//
// The server it boots is the same one a browser-driving agent should point at:
// `next dev` with ATLAS_FIXTURES=1, which answers every generation from
// lib/server/fixtures.ts. No OpenRouter key, no Supabase project, no spend, and
// a step that takes milliseconds instead of seconds.

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.ATLAS_E2E_PORT ?? 3941);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // The seed store (lib/server/fixtures.ts) is one in-memory map in one dev
  // server, so specs share it — they run one at a time and each seeds its own
  // run. Parallelism would buy seconds and cost determinism.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ATLAS_FIXTURES: "1",
      // Placeholders: the browser Supabase client is still constructed (it owns
      // sign-out), it is simply never reached — persistence goes through
      // /api/test/seed in fixture mode.
      SUPABASE_URL: process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
      SUPABASE_PUBLISHABLE_KEY:
        process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_placeholder",
    },
  },
});
