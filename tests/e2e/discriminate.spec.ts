// Discriminate, end to end.
//
// The seam this covers that a unit test cannot: the phase sits at index 1 of
// two ladders, so it is the first rung a learner meets after the reading — and
// it is the first surface in the app whose grading is local, with the open
// answer mapped onto an index by the `choice` judge rather than by a phase's
// own judge mode.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test.describe("discriminate", () => {
  test("nothing about the answer is on screen before the commit", async ({ page }) => {
    await openRun(page, {
      notation: { state: "learning", phases_done: ["consume"] },
      foundations: "mastered",
    });
    await openPhase(page, "notation", "discriminate");

    const sheet = page.getByTestId("phase-discriminate");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("case-candidate")).toBeVisible();
    // The reveal, the verdict and the reason are all withheld until an answer
    // is committed — otherwise the item is a recognition task.
    await expect(sheet.getByTestId("call-right")).toHaveCount(0);
    await expect(sheet.getByTestId("call-wrong")).toHaveCount(0);
    await expect(sheet.getByTestId("action-next")).toHaveCount(0);
    // Own words is the default; the closed form is the alternative.
    await expect(sheet.getByTestId("field-answer")).toBeVisible();
  });

  test("a run of right answers closes the rung", async ({ page }) => {
    await openRun(page, {
      notation: { state: "learning", phases_done: ["consume"] },
      foundations: "mastered",
    });
    await openPhase(page, "notation", "discriminate");

    const sheet = page.getByTestId("phase-discriminate");
    await sheet.getByTestId("action-mode-choices").click();

    // The fixture deck alternates its answer between option 0 and option 1,
    // which is also what the generator's "not every item answers to the same
    // index" guard requires of a real one.
    for (let i = 0; i < 4; i++) {
      await sheet.getByTestId(`action-pick-${i % 2}`).click();
      await expect(sheet.getByTestId("call-right")).toBeVisible();
      await sheet.getByTestId("action-next").click();
    }

    await expect(sheet.getByTestId("phase-score")).toBeVisible();
    await sheet.getByTestId("action-finish").click();

    await expect(async () => {
      const row = (await readNodeRows(page.request)).find((r) => r.id === "notation")!;
      expect(row.phases_done).toContain("discriminate");
    }).toPass({ timeout: 20_000 });
  });
});
