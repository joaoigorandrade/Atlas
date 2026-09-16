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
  // Not Recall's screen, and not Recall's brief.
  await expect(page.getByTestId("phase-recall")).toHaveCount(0);
  await expect(sheet.getByText(/Carry it out|Execute neste caso/)).toBeVisible();
  // The rubric is withheld here for the same reason it is in Recall.
  await expect(sheet.getByTestId("recite-score")).toHaveCount(0);

  await sheet
    .getByTestId("field-answer")
    .fill("Step one holds, so step two applies and gives the stated result.");
  await sheet.getByTestId("action-submit").click();

  await expect(sheet.getByTestId("recite-score")).toBeVisible({ timeout: 20_000 });
  await sheet.getByTestId("action-finish").click();

  // The fixture judge rules one row of three good — below the two-thirds bar —
  // so the rung stays open, exactly as it does for Recall.
  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "worked-cases")!;
    expect(row.phases_done).not.toContain("perform");
  }).toPass({ timeout: 20_000 });
});
