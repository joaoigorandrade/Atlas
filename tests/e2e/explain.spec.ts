// Explain, end to end.
//
// What a unit test cannot cover: the phase sits straight behind the reading on
// every plan, and it is the one post-reading rung that does not exit to the
// map — finishing it hands on to whatever the plan owes next.

import { expect, test } from "@playwright/test";
import { openPhase, openRun, readNodeRows } from "./helpers";

test("the model, a wrong reply taught, the right one, then the owed rung", async ({
  page,
}) => {
  await openRun(page, {
    notation: { state: "learning", phases_done: ["consume"] },
    foundations: "mastered",
  });
  await openPhase(page, "notation", "explain");

  const sheet = page.getByTestId("phase-explain");
  await expect(sheet).toBeVisible();
  // One card at a time; the check waits on the whole model.
  await expect(sheet.getByTestId("explain-card-problem")).toBeVisible();
  await expect(sheet.getByTestId("explain-card-analogy")).toHaveCount(0);
  await expect(sheet.getByTestId("explain-listener")).toHaveCount(0);
  for (let i = 0; i < 4; i++) await sheet.getByTestId("action-reveal").click();
  await expect(sheet.getByTestId("explain-card-checkBack")).toBeVisible();
  await expect(sheet.getByTestId("action-reveal")).toHaveCount(0);
  await expect(sheet.getByTestId("explain-listener")).toBeVisible();
  // Own words is the default; the closed form is the alternative.
  await expect(sheet.getByTestId("field-answer")).toBeVisible();
  await sheet.getByTestId("action-mode-choices").click();

  // The fixture's first reply fails: it is taught on the spot, and not offered
  // again.
  await sheet.getByTestId("action-reply-0").click();
  await expect(sheet.getByTestId("reply-wrong")).toBeVisible();
  await expect(sheet.getByTestId("action-reply-0")).toHaveCount(0);
  await expect(sheet.getByTestId("action-finish")).toHaveCount(0);

  await sheet.getByTestId("action-reply-1").click();
  await expect(sheet.getByTestId("reply-right")).toBeVisible();
  await sheet.getByTestId("action-finish").click();

  // On to the owed rung — a concept's Discriminate — not back to the map.
  await expect(page.getByTestId("phase-discriminate")).toBeVisible();
  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "notation")!;
    expect(row.phases_done).toContain("explain");
  }).toPass({ timeout: 20_000 });
});
