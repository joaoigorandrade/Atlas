import { expect, test } from "@playwright/test";
import { FIRST_NODE, SECOND_NODE, clearRuns, openRun } from "./helpers";

// The one flow (docs/PLAN-FLOW.md): no mode to pick on the way in, and a
// learned concept walks on to the next one — its cards were kept in the
// "Guardar" pass right after Perform.

test("welcome: one flow, nothing to pick", async ({ page, request }) => {
  await clearRuns(request);
  await page.goto("/");
  await page.getByTestId("screen-welcome").waitFor();
  await expect(page.getByTestId("action-mode-mastery")).toHaveCount(0);
  await expect(page.getByTestId("action-mode-glance")).toHaveCount(0);
  await page.getByTestId("field-topic").fill("Anything at all");
  await page.getByTestId("action-build").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("screen-diagnostic")).toHaveCount(0);
});

test("a learned concept walks on to the next one", async ({ page }) => {
  await openRun(page, {
    [FIRST_NODE]: {
      state: "mastered",
      phases_done: ["consume", "explain", "perform"],
    },
    [SECOND_NODE]: { state: "frontier", phases_done: [] },
  });
  await page.getByTestId(`node-${FIRST_NODE}`).press("Enter");
  const panel = page.getByTestId("panel-node");
  await expect(panel.getByTestId("action-primary")).toContainText("Notation");
  await expect(panel.getByTestId("action-walk-on")).toHaveCount(0);
});
