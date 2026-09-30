import { expect, test, type Page } from "@playwright/test";
import { openPhase, openRun } from "./helpers";

// W4.1 — every plan's last gate opens a night after the last thing studied,
// so no node goes green on the day it was learned. `edge-cases` is a working
// concept: Consume, then Discriminate as its one — and last — gate.
const NODE = "edge-cases";

async function readKnowingEverySection(page: Page) {
  await openRun(page, { [NODE]: "frontier", "core-rule": "mastered" });
  await openPhase(page, NODE, "consume");
  const sheet = page.getByTestId("phase-consume");
  for (let i = 0; i < 3; i++) {
    await sheet.getByTestId("action-mode-choices").last().click();
    await sheet.locator('[data-testid="action-check-1"]:not([disabled])').last().click();
    await sheet.getByTestId(i === 2 ? "action-finish" : "action-continue").click();
  }
  return page.getByTestId("phase-consume-recap");
}

test("the last gate waits a night after the reading", async ({ page }) => {
  const recap = await readKnowingEverySection(page);
  await recap.getByTestId("action-begin-next").click();
  // Held: the map, and a line saying when it opens — not the phase.
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
  await expect(page.getByText(/Discriminate on Edge cases opens in ~\d+h/)).toBeVisible();
  await expect(page.getByTestId("phase-discriminate")).toHaveCount(0);
});

test("a prove-it challenge is exempt from the night", async ({ page }) => {
  const recap = await readKnowingEverySection(page);
  // Every section known before reading: the recap leads with the proof, and
  // the proof is the claim that it was known before this sitting.
  await recap.getByTestId("action-prove-known").click();
  await expect(page.getByTestId("phase-discriminate")).toBeVisible();
});
