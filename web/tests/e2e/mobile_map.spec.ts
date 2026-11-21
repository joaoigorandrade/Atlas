// The map on a phone: no gate, the canvas takes touch (one finger pans, two
// pinch, a tap selects), the node detail rises as a bottom sheet, and the plan
// is a full-width drawer. Touch is driven through CDP — Playwright's
// touchscreen only taps, and pan and pinch are what this is about.

import { expect, test, type Page } from "@playwright/test";
import { FIRST_NODE, openRun } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Point = { x: number; y: number };

/** Fingers down at `from`, moved in steps to `to`, lifted. */
async function gesture(page: Page, from: Point[], to: Point[], steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const at = (k: number) =>
    from.map((p, i) => ({
      x: p.x + ((to[i].x - p.x) * k) / steps,
      y: p.y + ((to[i].y - p.y) * k) / steps,
      id: i,
    }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let k = 1; k <= steps; k++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(k) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** The map layer's translate and scale. */
async function view(page: Page) {
  const t = await page
    .getByTestId("map-canvas")
    .locator(":scope > div")
    .first()
    .evaluate((el) => (el as HTMLElement).style.transform);
  const [x, y, scale] = (t.match(/-?[\d.]+/g) ?? []).map(Number);
  return { x, y, scale };
}

test("mobile: the map pans, pinches and opens a node as a bottom sheet", async ({
  page,
}) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await expect(page.getByTestId("map-canvas")).toBeVisible();
  await expect(page.getByTestId(`node-${FIRST_NODE}`)).toBeVisible();

  // Nothing runs off the side of the screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // A phone opens on the lit concept, not a whole map shrunk past reading.
  const seal = (await page.getByTestId(`node-${FIRST_NODE}`).boundingBox())!;
  expect(seal.x).toBeGreaterThan(0);
  expect(seal.x + seal.width).toBeLessThan(390);

  // A tap on a concept selects it, and its detail rises from the bottom.
  await page.touchscreen.tap(seal.x + seal.width / 2, seal.y + seal.height / 2);
  const panel = page.getByTestId("panel-node");
  await expect(panel).toHaveAttribute("data-node", FIRST_NODE);
  await expect(async () => {
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThan(380);
    expect(box.y).toBeGreaterThan(300);
    expect(box.y + box.height).toBeCloseTo(844, 0);
  }).toPass();

  // Gestures land above the sheet, on the map still showing.
  // One finger pans.
  const before = await view(page);
  await gesture(page, [{ x: 200, y: 160 }], [{ x: 260, y: 220 }]);
  await expect.poll(async () => (await view(page)).x).toBeCloseTo(before.x + 60, 0);

  // Two fingers pinch out: the map zooms in.
  const pre = await view(page);
  await gesture(
    page,
    [
      { x: 170, y: 200 },
      { x: 220, y: 200 },
    ],
    [
      { x: 120, y: 200 },
      { x: 270, y: 200 },
    ],
  );
  await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(pre.scale);

  // The plan is a drawer over the whole width, and picking from it closes it.
  await page.getByRole("button", { name: /Plan|Plano/ }).click();
  const jump = page.getByRole("button", { name: /Jump to frontier|Ir para a fronteira/ });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toBeHidden();
});
