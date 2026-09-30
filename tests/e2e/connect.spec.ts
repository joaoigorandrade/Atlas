import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, SECOND_NODE } from "./helpers";

test("connect: prior concepts are offered as links", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "connect");

  const sheet = page.getByTestId("phase-connect");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/relational, not a list/)).toBeVisible();
});

test("connect: a link is confirmed only in the learner's own words", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "connect");

  const sheet = page.getByTestId("phase-connect");
  await sheet.locator('[data-testid^="action-candidate-"]').first().click();
  const confirm = sheet.getByTestId("action-confirm-link");
  // An empty box used to confirm on the map's own sentence.
  await expect(confirm).toBeDisabled();
  await sheet
    .getByTestId("field-connection")
    .fill("It is the rule this one is built on, applied to a narrower case.");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(confirm).toContainText(/confirmed|confirmado/i);
});

test("connect: a link the judge rules false is not confirmed, and the map's sentence waits until after", async ({
  page,
}) => {
  // W1.5: these sentences become cards rehearsed for months, so a wrong one is
  // caught before it is confirmed; the map's own version is a comparison
  // shown afterwards, never an answer offered before.
  let ruling = "false";
  await page.route("**/api/generate", async (route) => {
    const body = route.request().postDataJSON() as { kind?: string; mode?: string };
    if (body?.kind !== "judge" || body.mode !== "connect") return route.continue();
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      body: (await res.text()).replaceAll('"true"', `"${ruling}"`),
    });
  });
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "connect");
  const sheet = page.getByTestId("phase-connect");
  await sheet.locator('[data-testid^="action-candidate-"]').first().click();
  await expect(sheet.getByTestId("connect-suggestion")).toHaveCount(0);
  await sheet
    .getByTestId("field-connection")
    .fill("It is the exact opposite of this one in every single case.");
  await sheet.getByTestId("action-confirm-link").click();
  await expect(sheet.getByTestId("connect-ruling")).toHaveAttribute(
    "data-verdict",
    "false",
  );
  await expect(sheet.getByTestId("action-confirm-link")).toContainText(
    /Confirm this link/,
  );
  await expect(sheet.getByTestId("connect-suggestion")).toHaveCount(0);

  ruling = "true";
  await sheet
    .getByTestId("field-connection")
    .fill("It is the rule this one is built on, applied to a narrower case.");
  await sheet.getByTestId("action-confirm-link").click();
  await expect(sheet.getByTestId("action-confirm-link")).toContainText(/confirmed/i);
  await expect(sheet.getByTestId("connect-suggestion")).toBeVisible();
});
