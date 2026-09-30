import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

/** Answer the open pretest by choice. Option 1 is right in the fixture pass. */
async function guess(page: import("@playwright/test").Page, option: number) {
  const sheet = page.getByTestId("phase-consume");
  await sheet.getByTestId("action-mode-choices").last().click();
  await sheet
    .locator(`[data-testid="action-check-${option}"]:not([disabled])`)
    .last()
    .click();
}

test("consume: a section opens on its pretest, and a miss opens the reading", async ({
  page,
}) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, "consume");

  const sheet = page.getByTestId("phase-consume");
  await expect(sheet.getByText("1 · What it is")).toBeVisible();
  // W3.3 — the section's check comes first, and the prose waits behind it.
  await expect(sheet.getByText("Before you read")).toBeVisible();
  await expect(sheet.getByText(/states it plainly/)).toHaveCount(0);

  await guess(page, 0);
  // A miss reveals nothing: the reading opens in full, and the same check is
  // asked again at its end.
  await expect(sheet.getByText(/states it plainly/)).toBeVisible();
  await expect(sheet.getByText("It was in the second paragraph.")).toHaveCount(0);
  await expect(async () => {
    await page.mouse.wheel(0, 900);
    await expect(sheet.getByText(/Your guess before reading missed/)).toBeVisible({
      timeout: 750,
    });
  }).toPass({ timeout: 20_000 });
});

test("consume: a right pretest passes the check and folds the section", async ({
  page,
}) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, "consume");

  const sheet = page.getByTestId("phase-consume");
  await guess(page, 1);
  await expect(sheet.getByText(/You already had this/)).toBeVisible();
  await expect(sheet.getByText(/states it plainly/)).toHaveCount(0);
  // The check counts as passed, so the way on is open without re-reading.
  await expect(sheet.getByTestId("action-continue")).toBeVisible();
});
