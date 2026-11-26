import { expect, test } from "@playwright/test";
import { FIRST_NODE, openRun } from "./helpers";

// "Just want to know" ends its ladder on keeping what it used: once perform
// closes, the node's button opens its cards, and walking on is the second one.
test("glance: a node whose perform closed opens its cards first", async ({ page }) => {
  const plan = ["consume", "explain", "perform", "retain"];
  await openRun(
    page,
    {
      [FIRST_NODE]: {
        state: "mastered",
        phase_plan: plan,
        phases_done: ["consume", "explain", "perform"],
      },
      notation: { state: "frontier", phase_plan: plan, phases_done: [] },
    },
    { goal: "glance" },
  );
  await page.getByTestId(`node-${FIRST_NODE}`).press("Enter");
  const panel = page.getByTestId("panel-node");
  await expect(panel.getByTestId("action-primary")).toContainText("Keep it");
  await expect(panel.getByTestId("action-walk-on")).toContainText("Notation");
  await panel.getByTestId("action-primary").click();
  await expect(page.getByTestId("phase-retain")).toBeVisible();
});
