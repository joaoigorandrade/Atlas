import { expect, test } from "@playwright/test";
import { openRun } from "./helpers";

// Signing in (or opening a new tab) lands on the dashboard, not on map
// creation and not straight into a map; a reload keeps the map. Map creation
// reached from "+ New map" always has a way back.

test("a new tab lands on the dashboard; a reload keeps the map", async ({
  page,
  context,
}) => {
  await openRun(page, {});
  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");

  const fresh = await context.newPage();
  await fresh.goto("/");
  await expect(fresh.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  await expect(fresh.getByTestId("app")).toHaveAttribute("data-screen", "dashboard");
});

test("map creation goes back to the dashboard", async ({ page }) => {
  await openRun(page, {});
  await page.getByText("Atlas", { exact: true }).first().click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "dashboard");
  await page.getByTestId("action-new-map").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "welcome");
  await page.getByTestId("action-back-dashboard").click();
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "dashboard");
});
