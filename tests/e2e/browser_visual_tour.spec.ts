import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { FIRST_NODE, SECOND_NODE, clearRuns, openPhase, openRun, TOPIC } from "./helpers";

const SCREENSHOT_DIR =
  "/Users/joaoigor/.gemini/antigravity/brain/defa1227-ab88-4c34-b53e-1f513fb2d566/screenshots";

mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.describe("Full Visual Browser Tour", () => {
  test("Walkthrough every feature and capture visual evidence", async ({ page }) => {
    test.setTimeout(180_000);
    // 1. Welcome Screen
    await clearRuns(page.request);
    await page.goto("/");
    await expect(page.getByTestId("screen-welcome")).toBeVisible();
    await page.getByTestId("field-topic").fill(TOPIC);
    await page.getByTestId("action-goal-mastery").click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_welcome.png") });

    // 2. Build & Diagnostic Placement Quiz
    await page.getByTestId("action-build").click();
    await expect(page.getByTestId("screen-diagnostic")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_diagnostic_start.png") });

    await page.getByTestId("action-take-placement").click();
    for (let i = 0; i < 5; i++) {
      const opt = page.getByTestId("action-answer-1");
      await expect(opt).toBeVisible({ timeout: 20_000 });
      if (i === 0) {
        await page.waitForTimeout(400);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "03_diagnostic_question.png"),
        });
      }
      await opt.click();
      await page.getByTestId("action-next").click();
    }
    await page.getByTestId("action-start").click({ timeout: 20_000 });

    // 3. Map Canvas & TopBar
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
    await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_map_canvas.png") });

    // 4. Node Detail Rail
    const node1 = page.getByTestId(`node-${FIRST_NODE}`);
    await node1.press("Enter");
    await expect(page.getByTestId("panel-node")).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_node_detail.png") });

    // 5. Phase 0: Consume (Reading pass)
    await openPhase(page, FIRST_NODE, 0);
    const consumeSheet = page.getByTestId("phase-consume");
    await expect(consumeSheet).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_phase_consume.png") });

    // Scroll and answer checks to get to recap
    for (let i = 0; i < 3; i++) {
      await consumeSheet.hover();
      const check = consumeSheet
        .locator('[data-testid="action-check-1"]:not([disabled])')
        .last();
      await expect(async () => {
        await page.mouse.wheel(0, 800);
        await expect(check).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await check.click();
      const last = i === 2;
      await consumeSheet
        .getByTestId(last ? "action-finish" : "action-continue")
        .click({ timeout: 15_000 });
    }

    // 6. Consume Recap
    const recap = page.getByTestId("phase-consume-recap");
    await expect(recap).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_consume_recap.png") });

    // 7. Phase 1: Socratic (handoff from Consume recap)
    await recap.getByTestId("action-begin-socratic").click();
    const socraticSheet = page.getByTestId("phase-socratic");
    await expect(socraticSheet).toBeVisible();
    const ansField = socraticSheet.getByTestId("field-answer");
    await expect(ansField).toBeVisible();
    await ansField.fill(
      "It clarifies the distinction between the rule and its concrete instances.",
    );
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_phase_socratic.png") });
    await socraticSheet.getByTestId("action-submit").click();
    await page.waitForTimeout(800);

    // 8. Phase 2: Feynman
    await openRun(page, { [FIRST_NODE]: "learning" });
    await openPhase(page, FIRST_NODE, 2);
    const feynmanSheet = page.getByTestId("phase-feynman");
    await expect(feynmanSheet).toBeVisible();
    await feynmanSheet.getByTestId("action-begin").click();
    await feynmanSheet
      .getByTestId("field-answer")
      .fill("The rule holds generally because the underlying premises are satisfied.");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_phase_feynman.png") });

    // 9. Phase 3: Connect
    await openRun(page, { [FIRST_NODE]: "learning", [SECOND_NODE]: "learning" });
    await openPhase(page, FIRST_NODE, 3);
    const connectSheet = page.getByTestId("phase-connect");
    await expect(connectSheet).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_phase_connect.png") });

    // 10. Phase 4: Crucible
    await openRun(page, { [FIRST_NODE]: "shaky", [SECOND_NODE]: "mastered" });
    await openPhase(page, FIRST_NODE, 4);
    const crucibleSheet = page.getByTestId("phase-crucible");
    await expect(crucibleSheet).toBeVisible();
    const conf = crucibleSheet.getByTestId("action-confidence-2");
    if (await conf.isVisible().catch(() => false)) await conf.click();
    await crucibleSheet
      .getByTestId("field-answer")
      .fill(
        "The constraint is invariant under transformation, so the conclusion still applies.",
      );
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_phase_crucible.png") });

    // 11. Phase 5: Retain (Flashcards)
    await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
    await openPhase(page, FIRST_NODE, 5);
    const retainSheet = page.getByTestId("phase-retain");
    await expect(retainSheet).toBeVisible();
    const felt = retainSheet.getByTestId("action-confidence-2");
    if (await felt.isVisible().catch(() => false)) await felt.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_phase_retain.png") });

    // 12. Dashboard
    await openRun(page, { [FIRST_NODE]: "mastered" });
    await page.getByText("Atlas", { exact: true }).first().click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "dashboard");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13_dashboard.png") });

    // 13. Profile (from Dashboard header)
    const profileBtn = page
      .locator("button[title*='Profile'], button[title*='Perfil']")
      .first();
    await profileBtn.click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "profile");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14_profile.png") });

    // 14. Settings (English)
    const editSettingsBtn = page
      .getByText("Preferences & notifications")
      .or(page.getByText("Preferências e notificações"));
    await editSettingsBtn.click();
    await expect(page.getByTestId("screen-settings")).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15_settings_en.png") });

    // 15. Settings in Portuguese (pt-BR)
    const ptBtn = page.getByRole("button", { name: /Portuguese|Português/i });
    await ptBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "16_settings_pt_br.png") });

    // Return to Map in Portuguese
    const backBtn = page.getByText("← Voltar").or(page.getByText("← Back"));
    await backBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "17_map_pt_br.png") });
  });
});
