// Drill, end to end.
//
// The seam worth covering: Drill is the deck family's timed member, and the
// clock is the only thing it has that Discriminate does not. The bar it
// actually gates on is correctness — a learner who is right and careful must
// not be walled out of their own ladder — so this checks both halves: the
// timing is reported, and it is not what decides the rung.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test("drill: the clock is reported, and correctness is what closes the rung", async ({
  page,
}) => {
  await openRun(page, {
    notation: { state: "learning", phases_done: ["consume", "discriminate"] },
    foundations: "mastered",
  });
  await openPhase(page, "notation", "drill");

  const sheet = page.getByTestId("phase-drill");
  await expect(sheet).toBeVisible();
  // Drill is the one phase that opens on the closed form: routing a timed rep
  // through a judge round-trip would measure the network, not the learner.
  await expect(sheet.getByTestId("action-pick-0")).toBeVisible();
  await expect(sheet.getByTestId("rep-clock")).toBeVisible();

  // Deliberately unhurried: every item is answered correctly, slowly enough
  // that a speed gate would fail the run. The rung must still close.
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(400);
    await sheet.getByTestId(`action-pick-${i % 2}`).click();
    await sheet.getByTestId("action-next").click();
  }

  await expect(sheet.getByTestId("phase-score")).toBeVisible();
  // The signal the phase exists for. Without it Drill would be Discriminate
  // with a different prompt, which is the thing it was split apart to not be.
  await expect(sheet.getByTestId("drill-pace")).toBeVisible();
  await sheet.getByTestId("action-finish").click();

  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "notation")!;
    expect(row.phases_done).toContain("drill");
  }).toPass({ timeout: 20_000 });
});
