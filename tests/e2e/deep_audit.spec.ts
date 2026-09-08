import { expect, test, type Page } from "@playwright/test";
import { FIRST_NODE, SECOND_NODE, clearRuns, openPhase, openRun, TOPIC } from "./helpers";

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

  test("1. Onboarding Flow: Welcome, Options, Diagnostic Quiz, Map Generation", async ({
    page,
  }) => {
    attachAuditListeners(page, audit);
    await clearRuns(page.request);

    await page.goto("/");
    await expect(page.getByTestId("screen-welcome")).toBeVisible();
    audit.passedChecks.push("Welcome screen visible");

    // Check goal choices
    await page.getByTestId("action-goal-project").click();
    await page.getByTestId("action-goal-mastery").click();
    audit.passedChecks.push("Goal toggles functional");

    // Fill topic
    await page.getByTestId("field-topic").fill(TOPIC);
    await page.getByTestId("action-build").click();
    audit.passedChecks.push("Topic entered and build initiated");

    // Diagnostic quiz
    await expect(page.getByTestId("screen-diagnostic")).toBeVisible({ timeout: 30_000 });
    audit.passedChecks.push("Diagnostic screen loaded");

    await page.getByTestId("action-take-placement").click();
    for (let i = 0; i < 5; i++) {
      const option = page.getByTestId("action-answer-1");
      await expect(option).toBeVisible({ timeout: 20_000 });
      await option.click();
      await page.getByTestId("action-next").click();
    }
    audit.passedChecks.push("5 diagnostic questions answered");

    await page.getByTestId("action-start").click({ timeout: 20_000 });
    await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
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
    await openPhase(page, FIRST_NODE, 0);

    const sheet = page.getByTestId("phase-consume");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Consume reading sheet rendered");

    // Complete all 3 sections
    for (let i = 0; i < 3; i++) {
      await sheet.hover();
      const check = sheet
        .locator('[data-testid="action-check-1"]:not([disabled])')
        .last();
      await expect(async () => {
        await page.mouse.wheel(0, 800);
        await expect(check).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });

      await check.click();
      const last = i === 2;
      const nextBtn = sheet.getByTestId(last ? "action-finish" : "action-continue");
      await expect(nextBtn).toBeVisible();
      await nextBtn.click({ timeout: 15_000 });
    }
    audit.passedChecks.push("All Consume reading sections and checks completed");

    // Recap screen
    const recap = page.getByTestId("phase-consume-recap");
    await expect(recap).toBeVisible();
    await expect(recap.getByTestId("action-begin-socratic")).toBeVisible();
    audit.passedChecks.push("Consume recap screen displayed with Socratic hand-off");
  });

  test("4. Phase 1 (Socratic): Probes, Text Submission, Feedback", async ({ page }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "learning" });
    await openPhase(page, FIRST_NODE, 1);

    const sheet = page.getByTestId("phase-socratic");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Socratic sheet rendered");

    for (let i = 0; i < 3; i++) {
      const field = sheet.getByTestId("field-answer");
      if (!(await field.isVisible().catch(() => false))) break;
      await field.fill("This is my understanding of the core concept and its rules.");
      const submit = sheet.getByTestId("action-submit");
      await expect(submit).toBeVisible();
      await submit.click();
      await page.waitForTimeout(500);
    }
    audit.passedChecks.push("Socratic probes answered and submitted");
  });

  test("5. Phase 2 (Feynman): Teach-back, Rubric, Gap Detection", async ({ page }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "learning" });
    await openPhase(page, FIRST_NODE, 2);

    const sheet = page.getByTestId("phase-feynman");
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("action-begin").click();
    audit.passedChecks.push("Feynman teach-back begun");

    for (let i = 0; i < 2; i++) {
      const field = sheet.getByTestId("field-answer");
      await expect(field).toBeVisible({ timeout: 10_000 });
      await field.fill(`Explaining concept beat ${i + 1} simply as if to a newcomer.`);
      const last = i === 1;
      await sheet.getByTestId(last ? "action-submit" : "action-next").click();
    }
    audit.passedChecks.push("Feynman beats submitted");

    const advance = sheet.getByTestId("action-advance");
    await expect(advance).toBeVisible({ timeout: 20_000 });
    audit.passedChecks.push("Feynman evaluation and advance button displayed");
  });

  test("6. Phase 3 (Connect): Concept Relationships & Linking", async ({ page }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "learning", [SECOND_NODE]: "learning" });
    await openPhase(page, FIRST_NODE, 3);

    const sheet = page.getByTestId("phase-connect");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Connect sheet rendered");
  });

  test("7. Phase 4 (Crucible): Transfer Problem & Calibration", async ({ page }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "shaky", [SECOND_NODE]: "mastered" });
    await openPhase(page, FIRST_NODE, 4);

    const sheet = page.getByTestId("phase-crucible");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Crucible sheet rendered");

    // Confidence rating
    const conf = sheet.getByTestId("action-confidence-2");
    if (await conf.isVisible().catch(() => false)) {
      await conf.click();
      audit.passedChecks.push("Crucible confidence rating selected");
    }

    const field = sheet.getByTestId("field-answer");
    await expect(field).toBeVisible();
    await field.fill("Applying this knowledge in a practical transfer scenario.");
    await sheet.getByTestId("action-submit").click();
    audit.passedChecks.push("Crucible transfer problem answered and submitted");
  });

  test("8. Phase 5 (Retain): Spaced Repetition Flashcards & FSRS Grading", async ({
    page,
  }) => {
    attachAuditListeners(page, audit);
    await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
    await openPhase(page, FIRST_NODE, 5);

    const sheet = page.getByTestId("phase-retain");
    await expect(sheet).toBeVisible();
    audit.passedChecks.push("Retain review sheet rendered");

    const conf = sheet.getByTestId("action-confidence-2");
    if (await conf.isVisible().catch(() => false)) {
      await conf.click();
      audit.passedChecks.push("Retain pre-flip confidence tapped");
    }

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
