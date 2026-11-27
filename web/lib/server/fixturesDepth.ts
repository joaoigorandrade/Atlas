// Fixture mode's deeper levels — split from `fixtures.ts`, which is at its size budget.

import type { DepthSpec } from "@/lib/curriculum";

/** Deeper levels on two fixture concepts — the core rule to level III, the
 *  worked cases to level II — so fixture mode and e2e can go deeper. */
export const FIXTURE_DEEPER: Record<string, DepthSpec[]> = {
  "core-rule": [
    {
      label: "The rule, generalised",
      summary: "The core rule stated for every case at once.",
    },
    {
      label: "Where the rule breaks",
      summary: "The limits past which the rule no longer holds.",
    },
  ],
  "worked-cases": [
    {
      label: "Harder cases",
      summary: "Cases that need two applications of the rule at once.",
    },
  ],
};
