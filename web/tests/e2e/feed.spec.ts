// The Frontier Feed on a phone: a round of pretest cards bet in ink, a miss
// sent to its reading, and the reading wearing what the round found out.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { FIRST_NODE, openRun } from "./helpers";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

/** Nothing wider than the screen — the phone layout's one hard rule. */
async function fitsTheScreen(page: Page) {
  const over = await page.evaluate(
    () =>
      [...document.querySelectorAll("[data-testid^=screen-], [data-testid^=phase-]")]
        .flatMap((s) => [...s.querySelectorAll("*")])
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length,
  );
  expect(over).toBe(0);
}

/** Answer the card by choice, then bet `stake`. Option 1 is right in the fixture pass. */
async function bet(scope: Locator, option: number, stake: number) {
  await scope.getByTestId("action-mode-choices").last().click();
  await scope.getByTestId(`action-check-${option}`).click();
  await scope.getByTestId("consume-bet").getByTestId(`action-sure-${stake}`).click();
}

test("feed: a round bets ink on the next readings, and a miss opens its reading", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  // Offered once a frontier reading has been written in the background.
  const plate = page.getByTestId("action-feed-open");
  await expect(plate).toContainText("0 ink", { timeout: 30_000 });
  await plate.click();

  const feed = page.getByTestId("screen-feed");
  await fitsTheScreen(page);

  // Right, and very sure: +3.
  await bet(feed, 1, 2);
  await expect(feed.getByTestId("feed-ink-delta")).toHaveText("+3 ink");
  await expect(feed.getByTestId("feed-ink")).toHaveText("3 ink");
  await feed.getByTestId("action-feed-next").click();

  // Wrong, and fairly sure: −1, and the way to the answer.
  await bet(feed, 0, 1);
  await expect(feed.getByTestId("feed-ink-delta")).toHaveText("−1 ink");
  await expect(feed.getByTestId("feed-ink")).toHaveText("2 ink");
  await feed.getByTestId("action-feed-read").click();

  // The round changes subject after each card, so the miss is the first section
  // of the next concept: its reading opens on it in full, wearing the bet.
  const reading = page.getByTestId("phase-consume");
  await expect(reading.getByTestId("consume-pretest-missed")).toContainText("−1 ink");
  await expect(reading.getByText("Before you read")).toHaveCount(0);
  await fitsTheScreen(page);

  // Back on the map, the plate carries the balance the bets came to.
  await reading.getByRole("button", { name: "← Map" }).click();
  await expect(page.getByTestId("action-feed-open")).toContainText("2 ink");
});
