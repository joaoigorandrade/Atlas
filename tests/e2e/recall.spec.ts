// Recall, end to end — the first phase built after the catalogue inverted.
//
// What a unit test can't see: the phase has to be reachable from a node's own
// rail, its content has to resolve through a cache kind the job router knows,
// the rubric has to survive the round trip into the judge, and the rung must
// close on the ledger — the seam every catalogue bug so far has lived in.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test.describe("recall", () => {
  test("a blank page, and no rubric before the answer", async ({ page }) => {
    await openRun(page, {
      notation: { state: "learning", phases_done: ["consume", "connect"] },
      foundations: "mastered",
    });
    await openPhase(page, "notation", "recall");

    const sheet = page.getByTestId("phase-recall");
    await expect(sheet).toBeVisible();
    // How much they expect back comes first; the blank page waits on it.
    await expect(sheet.getByTestId("field-answer")).toHaveCount(0);
    await sheet.getByTestId("action-sure-0").click();
    // The whole diagnostic: what the learner never thinks to write is the
    // finding, so nothing the rubric names may be on screen before they write.
    await expect(sheet.getByTestId("phase-score")).toHaveCount(0);
    await expect(sheet.getByText("The requirement")).toHaveCount(0);
    await expect(sheet.getByTestId("field-answer")).toBeVisible();
  });

  test("the rung closes only on an answer that clears the rubric", async ({ page }) => {
    // The fixture judge rules row 0 good and the rest confused — one of three,
    // under the two-thirds bar. A learner who read the report and pressed
    // Continue has not passed, and the ledger has to say so.
    await openRun(page, {
      notation: { state: "learning", phases_done: ["consume", "connect"] },
      foundations: "mastered",
    });
    await openPhase(page, "notation", "recall");

    const sheet = page.getByTestId("phase-recall");
    await sheet.getByTestId("action-sure-2").click();
    await sheet.getByTestId("field-answer").fill("It is written the way the rule says.");
    await sheet.getByTestId("action-submit").click();

    await expect(sheet.getByTestId("phase-score")).toBeVisible({ timeout: 20_000 });
    await sheet.getByTestId("action-finish").click();

    await expect(async () => {
      const row = (await readNodeRows(page.request)).find((r) => r.id === "notation")!;
      expect(row.phases_done).not.toContain("recall");
    }).toPass({ timeout: 20_000 });

    // The report showed the rubric, so the next cold try waits out a night:
    // reopening it lands on the map with the hold, not on the blank page.
    await openPhase(page, "notation", "recall");
    await expect(page.getByTestId("phase-recall")).toHaveCount(0);
    await expect(page.getByText(/opens in ~\d+h/)).toBeVisible();
  });
});
