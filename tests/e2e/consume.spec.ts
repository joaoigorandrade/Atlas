import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

test("consume: the reading pass opens on material", async ({ page }) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, 0);

  const sheet = page.getByTestId("phase-consume");
  await expect(sheet).toBeVisible();
  // Fixture section one (lib/server/fixtures.ts) — prose on arrival, no
  // question in front of it.
  await expect(sheet.getByText("1 · What it is")).toBeVisible();
  await expect(sheet.getByText(/states it plainly/)).toBeVisible();
});
