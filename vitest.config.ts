import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  // tsconfig keeps jsx: "preserve" for Next; vitest has to compile it itself.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Phase 0.3 — a floor on the logic layer only. Components and routes are
    // covered by e2e (Phase 1), not by unit-coverage theatre, so they are not
    // measured here. Thresholds start at today's numbers and ratchet up.
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      // Test-only surfaces. `fixtures.ts` is the e2e harness's content (Phase
      // 1.1) — it is exercised by `npm run e2e` on every run, and counting it
      // here would let placeholder prose inflate the floor for real logic.
      exclude: ["lib/server/fixtures.ts", "lib/fixtureMode.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 55, functions: 49, branches: 49, statements: 55 },
    },
  },
});
