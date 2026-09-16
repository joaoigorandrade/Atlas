// Trace, end to end.
//
// Trace is the deck family's chained member: what an answered step established
// stays on screen, because it is the input to the next one. A run where each
// item stands alone would be Discriminate with a different prompt, so that is
// what this spec checks.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test("trace: each answered step stays on screen as the chain builds", async ({
  page,
}) => {
  await openRun(page, {
    "worked-cases": { state: "learning", phases_done: ["consume"] },
    "core-rule": "mastered",
    foundations: "mastered",
    notation: "mastered",
  });
  await openPhase(page, "worked-cases", "trace");

  const sheet = page.getByTestId("phase-trace");
  await expect(sheet).toBeVisible();
  const progress = sheet.getByTestId("phase-progress");
  await expect(progress).toHaveText(/1 (of|de) 4/);

  // Nothing behind the learner yet — the chain starts empty.
  await expect(sheet.getByTestId("chain-link-0")).toHaveCount(0);

  await sheet.getByTestId("action-mode-choices").click();
  await sheet.getByTestId("action-pick-0").click();
  await sheet.getByTestId("action-next").click();
  await expect(progress).toHaveText(/2 (of|de) 4/);
  // What the answered stage established is now on screen, because it is the
  // input to the one being asked.
  await expect(sheet.getByTestId("chain-link-0")).toBeVisible();

  for (let i = 1; i < 4; i++) {
    await sheet.getByTestId("action-mode-choices").click();
    await sheet.getByTestId(`action-pick-${i % 2}`).click();
    await sheet.getByTestId("action-next").click();
  }

  await expect(sheet.getByTestId("phase-score")).toBeVisible();
  await sheet.getByTestId("action-finish").click();

  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "worked-cases")!;
    expect(row.phases_done).toContain("trace");
  }).toPass({ timeout: 20_000 });
});
