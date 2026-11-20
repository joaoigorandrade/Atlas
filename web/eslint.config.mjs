// Phase 0.1 — the lint gate. `npm run lint` used to call `next lint`, which is
// gone in Next 16 and was never installed here; it exited 0 by doing nothing.
//
// Rules are limited to what catches real bugs. No style rules: Prettier owns
// formatting, and a style rule that fires on a correct program is noise the
// next agent learns to ignore.

import next from "eslint-config-next";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      ".claude/**",
      "next-env.d.ts",
      "scratch/**",
    ],
  },
  ...next,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // eslint-plugin-react-hooks v6 ships three new rules that fire ~110
      // times here, almost all of them inside AtlasApp's ref/callback web.
      // They are a Phase 2 conversation (the split hooks are the fix), not a
      // Phase 0 one — turning them on now would mean 110 suppressions.
      // ponytail: off until AtlasApp is split; re-enable per-rule after 2.1.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // Every hit is a deliberate full-page navigation after the session
      // cookie changes — router.push() would keep the stale session in the
      // client cache and is exactly the bug this pattern avoids.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
);
