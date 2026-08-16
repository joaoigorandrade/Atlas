import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("retain: the day's queue is built from learned nodes", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, FIRST_NODE, 5);

  const sheet = page.getByTestId("phase-retain");
  await expect(sheet).toBeVisible();
  // The queue is generated against the run's own learned nodes — a card naming
  // a node this run never learned is content the reducer drops.
  await expect(sheet.getByText(/from your/i).first()).toBeVisible();
});
