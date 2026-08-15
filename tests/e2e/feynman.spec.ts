import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

test("feynman: the teach-back opens without showing the rubric", async ({ page }) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, 2);

  const sheet = page.getByTestId("phase-feynman");
  await expect(sheet).toBeVisible();
  // The rubric rows are the answer sheet — they must not be on screen before
  // the learner has taught anything (lib/curriculum.ts, FeynmanBeat).
  await expect(sheet.getByText(/What it claims in/)).toHaveCount(0);
});
