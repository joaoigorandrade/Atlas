import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("crucible: a novel transfer problem is posed", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", 4);

  const sheet = page.getByTestId("phase-crucible");
  await expect(sheet).toBeVisible();
  // Crucible states confidence before it shows the problem — the calibration
  // read is worthless if the problem has already been seen.
  await sheet.getByTestId("action-confidence-1").click();
  await expect(sheet.getByText(/A case you have not seen/)).toBeVisible();
});
