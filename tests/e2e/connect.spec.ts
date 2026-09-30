import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("connect: prior concepts are offered as links", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "connect");

  const sheet = page.getByTestId("phase-connect");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/relational, not a list/)).toBeVisible();
});

test("connect: a link is confirmed only in the learner's own words", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "connect");

  const sheet = page.getByTestId("phase-connect");
  await sheet.locator('[data-testid^="action-candidate-"]').first().click();
  const confirm = sheet.getByTestId("action-confirm-link");
  // An empty box used to confirm on the map's own sentence.
  await expect(confirm).toBeDisabled();
  await sheet
    .getByTestId("field-connection")
    .fill("It is the rule this one is built on, applied to a narrower case.");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(confirm).toContainText(/confirmed|confirmado/i);
});
