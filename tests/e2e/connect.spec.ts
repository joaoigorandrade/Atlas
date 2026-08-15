import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("connect: prior concepts are offered as links", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", 3);

  const sheet = page.getByTestId("phase-connect");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/relational, not a list/)).toBeVisible();
});
