import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("retain: the day's queue is built from learned nodes", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, FIRST_NODE, "retain");

  const sheet = page.getByTestId("phase-retain");
  await expect(sheet).toBeVisible();
  // The queue is generated against the run's own learned nodes — a card naming
  // a node this run never learned is content the reducer drops.
  await expect(sheet.getByText(/from your/i).first()).toBeVisible();
});

test("retain: an answer written before the flip is read back as a suggestion (W4.3)", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, FIRST_NODE, "retain");

  const sheet = page.getByTestId("phase-retain");
  await sheet.getByTestId("field-card-answer").fill("the rule");
  await sheet.getByTestId("action-sure-1").click();
  // The judge's read sits over the grades; the grade stays the learner's.
  const suggestion = sheet.getByTestId("card-suggestion");
  await expect(suggestion).toContainText("the rule");
  await expect(suggestion).toContainText(/came back/i);
  await sheet.getByTestId("action-grade-good").click();
});
