import { expect, test } from "@playwright/test";
import { clearRuns, runOnboarding, readRun, TOPIC } from "./helpers";

test.describe("onboarding", () => {
  test.beforeEach(async ({ request }) => clearRuns(request));

  test("builds a map from a topic and lands on it", async ({ page }) => {
    await runOnboarding(page);

    // The fixture map (lib/server/fixtures.ts) — six concepts, frontier first.
    await expect(page.getByTestId("node-foundations")).toBeVisible();
    await expect(page.getByTestId("node-putting-it-together")).toBeVisible();
    await expect(page.getByTestId("node-foundations")).toHaveAttribute(
      "data-state",
      /frontier|mastered|shaky|learning/,
    );

    // …and it is persisted, which is what every other spec seeds from.
    await expect(async () => {
      const row = await readRun(page.request);
      expect(row?.subject).toBe(TOPIC);
      expect(row?.snapshot.graph.nodes.length).toBeGreaterThan(1);
    }).toPass();
  });
});
