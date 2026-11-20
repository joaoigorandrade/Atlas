import { expect, test } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun, readNodeRows, SECOND_NODE } from "./helpers";

test("crucible: a novel transfer problem is posed", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "crucible");

  const sheet = page.getByTestId("phase-crucible");
  await expect(sheet).toBeVisible();
  // Crucible states confidence before it shows the problem — the calibration
  // read is worthless if the problem has already been seen.
  await sheet.getByTestId("action-confidence-1").click();
  await expect(sheet.getByText(/A case you have not seen/)).toBeVisible();
});

test("crucible: an attempt survives a refresh", async ({ page }) => {
  // The bug this pins: `phase_progress` was migrated, accepted by the server
  // and returned by bootstrap, and no client ever wrote it — so the eight
  // phases built after the catalogue held their sessions in memory only. A
  // Crucible attempt is long-form work the learner typed, and a refresh threw
  // it away. Consume, Socratic, Feynman and Connect had been parked for
  // exactly this reason since they were written.
  const attempt = "Same rule, new dressing: the requirement still holds here.";
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, "core-rule", "crucible");

  const sheet = page.getByTestId("phase-crucible");
  await sheet.getByTestId("action-confidence-1").click();
  await sheet.getByTestId("field-answer").fill(attempt);

  // Parked by the mirror effect and saved on the debounce — no exit, because
  // a refresh is precisely the ending that never got to run a write.
  await expect(async () => {
    const res = await page.request.get("/api/v1/bootstrap");
    expect(res.ok()).toBe(true);
    const { topics } = (await res.json()) as {
      topics: Array<{ phaseProgress?: Record<string, Record<string, unknown>> }>;
    };
    const parked = topics[0]?.phaseProgress?.["core-rule"]?.crucible as
      { attempt?: string } | undefined;
    expect(parked?.attempt).toBe(attempt);
  }).toPass({ timeout: 20_000 });

  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  await openPhase(page, "core-rule", "crucible");

  // Reopened on the workspace with the writing still in it — not on the
  // confidence gate with a blank field, which is what a fresh session is.
  await expect(
    page.getByTestId("phase-crucible").getByTestId("field-answer"),
  ).toHaveValue(attempt);
});

test("crucible: a pass on the guided rung leaves the node Shaky and the cold problem waits a night", async ({
  page,
}) => {
  // W1.2: the re-attempt straight after the re-explanation closes the gap it
  // was aimed at — not the rung. The fixture judge answers `partial`; the
  // second attempt is rewritten to a pass.
  let judged = 0;
  await page.route("**/api/generate", async (route) => {
    const body = route.request().postDataJSON() as { kind?: string; mode?: string };
    if (body?.kind !== "judge" || body.mode !== "crucible" || ++judged < 2)
      return route.continue();
    const res = await route.fetch();
    await route.fulfill({
      response: res,
      body: (await res.text()).replaceAll('"partial"', '"pass"'),
    });
  });
  await openRun(page, {
    "worked-cases": {
      state: "shaky",
      shaky_reason: "connect-complete",
      phases_done: ["consume", "socratic", "feynman", "connect"],
    },
    "core-rule": "mastered",
    foundations: "mastered",
    notation: "mastered",
  });
  await openPhase(page, "worked-cases", "crucible");
  const sheet = page.getByTestId("phase-crucible");
  await sheet.getByTestId("action-confidence-1").click();
  await sheet
    .getByTestId("field-answer")
    .fill("The requirement is met; only the framing changed.");
  await sheet.getByTestId("action-submit").click();
  await sheet.getByTestId("action-retry").click();
  await sheet.getByTestId("action-confidence-1").click();
  await sheet
    .getByTestId("field-answer")
    .fill("Checked the requirement first, then applied it.");
  await sheet.getByTestId("action-submit").click();
  await sheet.getByTestId("action-finish").click();

  await expect(async () => {
    const row = (await readNodeRows(page.request)).find((r) => r.id === "worked-cases")!;
    expect(row.state).toBe("shaky");
    expect(row.shaky_reason).toBe("crucible-scaffolded");
    expect(row.phases_done).not.toContain("crucible");
    const held = (row.phase_progress as { crucible?: { opensAt?: number } }).crucible;
    expect(held?.opensAt ?? 0).toBeGreaterThan(Date.now());
  }).toPass({ timeout: 20_000 });
});
