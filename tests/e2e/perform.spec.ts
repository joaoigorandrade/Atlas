// Perform, end to end — the twelfth phase, and the recite family's second.
//
// What this covers beyond Recall's spec: one engine really does serve two
// phases with two different briefs, addressed at two different cache rows, on
// two different screens. A family that collapsed to one would show up here as
// Perform opening Recall's surface or reading Recall's content.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test("perform: its own surface, its own brief, its own rung", async ({ page }) => {
  await openRun(page, {
    "worked-cases": {
      state: "learning",
      phases_done: ["consume", "trace", "feynman"],
    },
    "core-rule": "mastered",
    foundations: "mastered",
    notation: "mastered",
  });
  await openPhase(page, "worked-cases", "perform");

  const sheet = page.getByTestId("phase-perform");
  await expect(sheet).toBeVisible();
  // Its own screen and its own surface. Perform keeps the case on screen —
  // it is not a memory test — where Recall gives a blank page and withholds
  // everything.
  await expect(page.getByTestId("phase-recall")).toHaveCount(0);
  await expect(sheet.getByTestId("perform-task")).toBeVisible();
  await expect(sheet.getByTestId("perform-verdict")).toHaveCount(0);

  await sheet
    .getByTestId("field-answer")
    .fill("Step one holds, so step two applies and gives the stated result.");
  await sheet.getByTestId("action-submit").click();

  await expect(sheet.getByTestId("perform-verdict")).toBeVisible({ timeout: 20_000 });
  await sheet.getByTestId("action-finish").click();

  // The fixture judge rules step one good and the rest confused. Execution
  // takes no partial credit — any wrong step is a failed run — so the rung
  // stays open, and for a stricter reason than Recall's.
  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "worked-cases")!;
    expect(row.phases_done).not.toContain("perform");
  }).toPass({ timeout: 20_000 });
});
