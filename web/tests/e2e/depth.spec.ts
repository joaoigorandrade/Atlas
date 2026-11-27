// Going deeper on a phone: a mastered concept the map gave levels offers the
// next one in its drawer, the level opens on whatever its own plan owes, and
// the map still draws one dot — the level shows only as a pip and a tab.

import { expect, test } from "@playwright/test";
import { openRun, readNodeRows } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const BASE = "core-rule";

test("depth: a mastered concept goes deeper without a new dot", async ({ page }) => {
  await openRun(page, {
    foundations: "mastered",
    notation: "mastered",
    [BASE]: "mastered",
  });
  const pips = page.getByTestId(`node-${BASE}`).getByTestId("depth-pips");
  await expect(pips).toHaveAttribute("aria-label", "1/3");

  await page.getByTestId(`node-${BASE}`).press("Enter");
  const panel = page.getByTestId("panel-node");
  await expect(panel).toHaveAttribute("data-node", BASE);
  await expect(panel.getByTestId("level-2")).toBeDisabled();
  await panel.getByTestId("action-go-deeper").click();

  // Level II opens on its own plan's first rung — the reading, about itself.
  const sheet = page.getByTestId("phase-consume");
  await expect(sheet).toBeVisible();
  // The phone folds the masthead title away, so read it rather than look.
  await expect(sheet.locator(".at-mast-title").first()).toHaveText(
    "The rule, generalised",
  );

  // Persisted as a hidden node on a solid edge, inheriting its base.
  await expect(async () => {
    const level = (await readNodeRows(page.request)).find((n) => n.id === `${BASE}~2`);
    expect(level).toMatchObject({
      depth: 2,
      kind: "principle",
      label: "The rule, generalised",
    });
  }).toPass({ timeout: 15_000 });

  await page.goto("/");
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  const app = page.getByTestId("app");
  if ((await app.getAttribute("data-screen")) === "dashboard")
    await page.getByText(/Open the map →|Abrir o mapa →/).click();
  await expect(app).toHaveAttribute("data-screen", "map");

  // Still one dot, and the level is a tab in its drawer.
  await expect(page.getByTestId(`node-${BASE}~2`)).toHaveCount(0);
  await expect(pips).toHaveAttribute("aria-label", "1/3");
  await page.getByTestId(`node-${BASE}`).press("Enter");
  await panel.getByTestId("level-2").click();
  await expect(panel).toHaveAttribute("data-node", `${BASE}~2`);
  await expect(panel.getByTestId("level-2")).toHaveAttribute("aria-selected", "true");
  // Not yet mastered, so there is no level III to offer.
  await expect(panel.getByTestId("action-go-deeper")).toHaveCount(0);
});
