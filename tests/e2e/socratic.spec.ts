import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

test("socratic: a probe is asked, answered, and judged", async ({ page }) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, 1);

  const sheet = page.getByTestId("phase-socratic");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/In your own words/)).toBeVisible();

  // The judge is a fixture too, so the verdict is deterministic: "correct".
  await sheet
    .getByTestId("field-answer")
    .fill("It states the rule the rest of the topic leans on.");
  await sheet.getByTestId("action-submit").click();
  await expect(sheet.getByText(/that is the move/i)).toBeVisible();
});
