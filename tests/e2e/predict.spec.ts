// Predict, end to end.
//
// The one thing this phase cannot survive: the outcome being visible before
// the learner commits. A forecast you can read off the screen is not a
// forecast, so that is what this spec is about.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test("predict: the outcome is not on screen until the forecast is committed", async ({
  page,
}) => {
  await openRun(page, {
    "core-rule": { state: "learning", phases_done: ["consume", "socratic"] },
    foundations: "mastered",
    notation: "mastered",
  });
  await openPhase(page, "core-rule", "predict");

  const sheet = page.getByTestId("phase-predict");
  await expect(sheet).toBeVisible();
  // The situation is shown; the outcome and the causal chain behind it are not.
  await expect(sheet.getByTestId("setup-situation")).toBeVisible();
  await expect(sheet.getByTestId("forecast-held")).toHaveCount(0);
  await expect(sheet.getByTestId("forecast-broke")).toHaveCount(0);

  for (let i = 0; i < 4; i++) {
    // Confidence first: the forecast controls do not appear until it is in,
    // because a rating taken after the outcome is not a calibration reading.
    await expect(sheet.getByTestId("action-mode-choices")).toHaveCount(0);
    await sheet.getByTestId("action-sure-1").click();
    await sheet.getByTestId("action-mode-choices").click();
    await sheet.getByTestId(`action-pick-${i % 2}`).click();
    // Only now, and one setup at a time.
    await expect(sheet.getByTestId("forecast-held")).toBeVisible();
    await sheet.getByTestId("action-next").click();
  }

  await sheet.getByTestId("action-finish").click();
  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "core-rule")!;
    expect(row.phases_done).toContain("predict");
  }).toPass({ timeout: 20_000 });
});
