import { expect, test, type Page } from "@playwright/test";
import { FIRST_NODE, openPhase, openRun } from "./helpers";

// Consume as reels: the same reading, a card per screen. The gates are the
// page view's (consume.spec.ts covers them through the shared test ids); this
// covers what only the feed does — the order it deals cards in, moving through
// them, the action rail, and the switch back to the page.

/** Set REELS_SHOTS to a directory to keep screenshots of the feed. */
const SHOTS = process.env.REELS_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function pick(page: Page, option: number) {
  const sheet = page.getByTestId("phase-consume");
  await sheet.getByTestId("action-mode-choices").last().click();
  await sheet
    .locator(`[data-testid="action-check-${option}"]:not([disabled])`)
    .last()
    .click();
}

const kinds = (page: Page) =>
  page
    .getByTestId("phase-consume")
    .locator("[data-reel]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-reel-kind")));

test("consume reels: a section dealt a card at a time, gated by its check", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, "consume");
  const sheet = page.getByTestId("phase-consume");
  await expect(sheet).toHaveAttribute("data-layout", "reels");
  const cards = sheet.locator("[data-reel]");

  // The pretest is the whole feed until it is answered.
  await expect.poll(() => kinds(page)).toEqual(["pretest"]);
  await shot(page, "01-pretest-desktop");
  await pick(page, 0);

  // A miss deals the section: a card per beat, the example, the figure, the
  // check — and nothing past the check.
  await expect
    .poll(() => kinds(page))
    .toEqual(["beat", "beat", "beat", "example", "figure", "check"]);
  await expect(cards.nth(0)).toContainText(/Your guess missed/);
  await shot(page, "02-beat-desktop");

  // The arrow under a card, and the keyboard, each move one card.
  await cards.nth(0).getByTestId("action-next-card").click();
  await expect(cards.nth(1)).toBeInViewport({ ratio: 0.6 });
  await page.keyboard.press("ArrowDown");
  await expect(cards.nth(2)).toBeInViewport({ ratio: 0.6 });
  await page.keyboard.press("ArrowDown");
  await expect(cards.nth(3)).toBeInViewport({ ratio: 0.6 });
  await page.waitForTimeout(1400); // the steps land one after another
  await shot(page, "03-example-desktop");

  await cards.nth(5).scrollIntoViewIfNeeded();
  await pick(page, 1);
  // Answered: the takeaway is dealt, with the way on.
  await expect.poll(() => kinds(page)).toContain("takeaway");
  const takeaway = sheet.locator('[data-reel-kind="takeaway"]');
  await takeaway.scrollIntoViewIfNeeded();
  await shot(page, "04-takeaway-desktop");
  await takeaway.getByTestId("action-continue").click();

  // Continue carries the learner to where the next section starts.
  const next = sheet.locator("[data-reel]").last();
  await expect(next).toHaveAttribute("data-reel-kind", "pretest");
  await expect(next).toBeInViewport({ ratio: 0.6 });
});

test("consume reels: the rail opens a lens and a question over the card", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, "consume");
  await pick(page, 0);
  const card = page.getByTestId("phase-consume").locator("[data-reel]").first();

  await card.getByTestId("action-lens-simpler").click();
  const lens = page.getByRole("dialog", { name: /— 1 · What it is/ });
  await expect(lens).toBeVisible();
  await lens.getByRole("button", { name: /Close/ }).first().click();
  await expect(lens).toBeHidden();

  // "Ask" is seeded with the card's own beat, not the whole section.
  await card.getByTestId("action-ask").click();
  await expect(page.getByText("You asked about")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: /Ask about this section/ }),
  ).toContainText(/states it plainly/);

  // On a phone the rail sits over the card's lower right, beside the text.
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.getByTestId("action-lens-simpler")).toBeInViewport();
  await shot(page, "05-beat-phone");
});

test("consume reels: the page view is one tap away, and stays chosen", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, "consume");
  const sheet = page.getByTestId("phase-consume");
  await sheet.getByTestId("action-view-page").click();
  await expect(sheet).not.toHaveAttribute("data-layout", "reels");
  await expect(sheet.getByTestId("action-view-reels")).toBeVisible();

  await page.reload();
  await openPhase(page, FIRST_NODE, "consume");
  await expect(page.getByTestId("phase-consume")).not.toHaveAttribute(
    "data-layout",
    "reels",
  );
  await page.getByTestId("action-view-reels").click();
  await expect(page.getByTestId("phase-consume")).toHaveAttribute("data-layout", "reels");
});
