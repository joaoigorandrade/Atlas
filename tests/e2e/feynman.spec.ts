import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

test("feynman: the teach-back opens without showing the rubric", async ({ page }) => {
  await openRun(page);
  await openPhase(page, FIRST_NODE, "feynman");

  const sheet = page.getByTestId("phase-feynman");
  await expect(sheet).toBeVisible();
  // The rubric rows are the answer sheet — they must not be on screen before
  // the learner has taught anything (lib/curriculum.ts, FeynmanBeat).
  await expect(sheet.getByText(/What it claims in/)).toHaveCount(0);
});

test("feynman: an early start click survives a delayed first beat", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "learning" });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.route("**/api/generate", async (route) => {
    if (route.request().postDataJSON()?.kind === "feynman") {
      intercepted = true;
      await held;
    }
    await route.continue();
  });

  try {
    await openPhase(page, FIRST_NODE, "feynman");
    const sheet = page.getByTestId("phase-feynman");
    await expect.poll(() => intercepted).toBe(true);
    await sheet.getByTestId("action-begin").click();
    await expect(sheet.getByTestId("action-begin")).toHaveCount(0);
    await expect(sheet.getByTestId("field-answer")).toHaveCount(0);
    release();
    await expect(sheet.getByTestId("field-answer")).toBeVisible();
    await sheet.getByTestId("field-answer").fill("My explanation after loading.");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
