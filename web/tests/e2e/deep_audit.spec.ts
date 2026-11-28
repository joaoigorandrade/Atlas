import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_NODE,
  SECOND_NODE,
  answerCheck,
  clearRuns,
  openPhase,
  openRun,
  TOPIC,
} from "./helpers";

interface AuditLog {
  errors: string[];
  warnings: string[];
  failedRequests: string[];
  passedChecks: string[];
}

function attachAuditListeners(page: Page, log: AuditLog) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      log.errors.push(`[Console Error] ${text}`);
    } else if (msg.type() === "warning") {
      log.warnings.push(`[Console Warn] ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    log.errors.push(`[Unhandled Page Error] ${err.message}\n${err.stack ?? ""}`);
  });

  page.on("response", (res) => {
    const status = res.status();
    const url = res.url();
    // Ignore planned or expected tests
    if (status >= 400) {
      log.failedRequests.push(`[HTTP ${status}] ${url}`);
    }
  });
}

test.describe("Deep Web Feature Audit", () => {
  const audit: AuditLog = {
    errors: [],
    warnings: [],
    failedRequests: [],
    passedChecks: [],
  };

  test.afterAll(async () => {
    console.log("\n=== AUDIT SUMMARY ===");
    console.log(`Passed feature assertions: ${audit.passedChecks.length}`);
    console.log(`Console errors captured: ${audit.errors.length}`);
    console.log(`Console warnings captured: ${audit.warnings.length}`);
    console.log(`Failed HTTP requests: ${audit.failedRequests.length}`);
    if (audit.errors.length > 0) {
      console.log("\nErrors detail:\n" + audit.errors.join("\n"));
    }
    if (audit.warnings.length > 0) {
      console.log("\nWarnings detail:\n" + audit.warnings.slice(0, 10).join("\n"));
    }
    if (audit.failedRequests.length > 0) {
      console.log("\nFailed requests detail:\n" + audit.failedRequests.join("\n"));
    }
  });

  test("1. Onboarding Flow: Welcome, Map Generation", async ({ page }) => {
    attachAuditListeners(page, audit);
    await clearRuns(page.request);

    await page.goto("/");
    await expect(page.getByTestId("screen-welcome")).toBeVisible();
    audit.passedChecks.push("Welcome screen visible");

    // Fill topic
    await page.getByTestId("field-topic").fill(TOPIC);
    await page.getByTestId("action-build").click();
    audit.passedChecks.push("Topic entered and build initiated");

    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
    audit.passedChecks.push("Successfully transitioned to Map screen");
  });

  test("2. Interactive Map, Rails, Canvas, Search, and Navigation Landmarks", async ({
    page,
  }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "frontier", [SECOND_NODE]: "learning" });

    // Verify Map Canvas
    const canvas = page.getByTestId("map-canvas");
    await expect(canvas).toBeVisible();
    audit.passedChecks.push("Map canvas rendered");

    // Verify nodes rendering
    const node1 = page.getByTestId(`node-${FIRST_NODE}`);
    const node2 = page.getByTestId(`node-${SECOND_NODE}`);
    await expect(node1).toBeVisible();
    await expect(node2).toBeVisible();
    await expect(node1).toHaveAttribute("data-state", "frontier");
    await expect(node2).toHaveAttribute("data-state", "learning");
    audit.passedChecks.push("Nodes rendered with accurate display states");

    // Search input
    const searchInput = page.locator(
      "input[placeholder*='Search'], input[placeholder*='Buscar']",
    );
    await expect(searchInput).toBeVisible();
    await searchInput.fill("notation");
    await page.waitForTimeout(300);
    await searchInput.clear();
    audit.passedChecks.push("Map search input functional");

    // Select node via Enter
    await node1.press("Enter");
    const nodePanel = page.getByTestId("panel-node");
    await expect(nodePanel).toBeVisible();
    await expect(nodePanel).toHaveAttribute("data-node", FIRST_NODE);
    audit.passedChecks.push("Node selection opens detail rail");

    // Verify phase buttons on rail
    for (let p = 0; p <= 5; p++) {
      await expect(page.getByTestId(`action-phase-${p}`)).toBeVisible();
    }
    audit.passedChecks.push("All 6 phase action buttons present in node detail");
  });

  test("3. Phase 0 (Consume): Prose Sections, Checks, Models, Recap", async ({
    page,
  }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "frontier" });
    await openPhase(page, FIRST_NODE, "consume");

    const sheet = page.getByTestId("phase-consume");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Consume reading sheet rendered");

    // Complete all 3 sections
    for (let i = 0; i < 3; i++) {
      await answerCheck(page, 1);
      const last = i === 2;
      const nextBtn = sheet.getByTestId(last ? "action-finish" : "action-continue");
      await expect(nextBtn).toBeVisible();
      await nextBtn.click({ timeout: 15_000 });
    }
    audit.passedChecks.push("All Consume reading sections and checks completed");

    // Recap screen
    const recap = page.getByTestId("phase-consume-recap");
    await expect(recap).toBeVisible();
    await expect(recap.getByTestId("action-begin-next")).toBeVisible();
    audit.passedChecks.push("Consume recap screen displayed with Socratic hand-off");
  });

  test("8. Phase 5 (Retain): Spaced Repetition Flashcards & FSRS Grading", async ({
    page,
  }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
    await openPhase(page, FIRST_NODE, "retain");

    const sheet = page.getByTestId("phase-retain");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Retain review sheet rendered");

    const flip = sheet.getByTestId("action-sure-1");
    await expect(flip).toBeVisible({ timeout: 20_000 });
    await flip.click();
    audit.passedChecks.push("Retain card turned over");

    const goodBtn = sheet.getByTestId("action-grade-good");
    await expect(goodBtn).toBeVisible({ timeout: 20_000 });
    await goodBtn.click();
    audit.passedChecks.push("Retain card graded with 'Good' FSRS rating");
  });

  test("9. Dashboard, Profile, and Settings Navigation", async ({ page }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "mastered" });

    // Open Dashboard via TopBar 'Atlas' wordmark
    await page.getByText("Atlas", { exact: true }).first().click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "dashboard");
    audit.passedChecks.push("Navigated to Dashboard screen");

    // Return to Map
    const openMapBtn = page
      .getByText("Open the map →")
      .or(page.getByText("Abrir o mapa →"));
    await expect(openMapBtn).toBeVisible();
    await openMapBtn.click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
    audit.passedChecks.push("Returned to Map from Dashboard");

    // Open Profile via avatar
    const avatar = page.locator("button.at-press").filter({ hasText: /^L$/ }).first();
    await avatar.click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "profile");
    audit.passedChecks.push("Navigated to Profile screen");

    // Open Settings from Profile
    const editSettingsBtn = page
      .getByText("Preferences & notifications")
      .or(page.getByText("Preferências e notificações"));
    await editSettingsBtn.click();
    await expect(page.getByTestId("screen-settings")).toBeVisible();
    audit.passedChecks.push("Settings sheet opened from Profile");

    // Language toggle in Settings
    const ptBtn = page.getByRole("button", { name: /Português/i });
    await expect(ptBtn).toBeVisible();
    await ptBtn.click();
    audit.passedChecks.push("Toggled language to Portuguese (pt-BR)");

    // Verify PT-BR label update
    await expect(
      page.getByText("Ajuste a jornada").or(page.getByText("Preferências")),
    ).toBeVisible();
    audit.passedChecks.push("Portuguese text rendered in Settings");

    // Toggle back to English
    const enBtn = page.getByRole("button", { name: /English/i });
    await expect(enBtn).toBeVisible();
    await enBtn.click();
    audit.passedChecks.push("Toggled language back to English");

    // Close Settings
    const backBtn = page.getByText("← Back").or(page.getByText("← Voltar"));
    await backBtn.click();
    // exitSettings navigates back to map (useNavigation.ts: exitSettings = () => setScreen("map"))
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
    audit.passedChecks.push("Closed Settings and returned to Map");
  });
});
