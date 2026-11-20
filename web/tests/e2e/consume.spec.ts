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

test("consume: knowing every section before reading offers the proof gate (W3.4)", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, "consume");

  const sheet = page.getByTestId("phase-consume");
  for (let i = 0; i < 3; i++) {
    await guess(page, 1);
    const last = i === 2;
    await sheet.getByTestId(last ? "action-finish" : "action-continue").click();
  }
  const recap = page.getByTestId("phase-consume-recap");
  await expect(recap.getByTestId("action-prove-known")).toBeVisible();
  // The ladder stays one tap away; proving it is the lead.
  await expect(recap.getByTestId("action-begin-next")).toBeVisible();
  await recap.getByTestId("action-prove-known").click();
  await expect(page.getByTestId("phase-crucible")).toBeVisible();
});

test("node detail: a reading known end to end leads with proving it (W3.4)", async ({
  page,
}) => {
  const clean = {
    idx: 2,
    total: 3,
    finished: true,
    handedOff: false,
    variant: {},
    collapsed: { c1: true, c2: true, c3: true },
    checks: {
      c1: { oi: 1, correct: true },
      c2: { oi: 1, correct: true },
      c3: { oi: 1, correct: true },
    },
    pretest: { c1: true, c2: true, c3: true },
    termsSeen: [],
  };
  await openRun(page, {
    [FIRST_NODE]: {
      state: "learning",
      phases_done: ["consume"],
      consume_progress: clean,
    },
  });
  await page.getByTestId(`node-${FIRST_NODE}`).press("Enter");
  const panel = page.getByTestId("panel-node");
  await expect(panel.getByTestId("action-primary")).toContainText("prove it");
  await expect(panel.getByTestId("action-walk-ladder")).toBeVisible();
  await panel.getByTestId("action-primary").click();
  await expect(page.getByTestId("phase-crucible")).toBeVisible();
});
