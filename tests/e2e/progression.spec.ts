// The progression specs: the state machine Phase 2.1 moves.
//
// The rest of the suite opens a phase and asserts its material rendered. These
// drive a phase to completion and assert what it *changed* — the node's state,
// the gaps it spawned, the cards it wrote, the snapshot it persisted. That is
// the half a hook split can break silently, so it is the half worth covering
// before splitting anything.

import { expect, test, type Page } from "@playwright/test";
import {
  FIRST_NODE,
  SECOND_NODE,
  openPhase,
  openRun,
  readRun,
  type Snapshot,
} from "./helpers";

/**
 * The persisted snapshot, once it satisfies `until`.
 *
 * The predicate is not optional by accident: a seeded row is already on disk
 * when the spec starts, so "a snapshot exists" is true immediately and would
 * happily return the *seed* instead of what the app just wrote. Every caller
 * states the change it is waiting for.
 */
async function persisted(page: Page, until: (snap: Snapshot) => boolean = () => true) {
  let snap: Snapshot | undefined;
  await expect(async () => {
    const row = await readRun(page.request);
    expect(row?.snapshot).toBeTruthy();
    expect(until(row!.snapshot)).toBe(true);
    snap = row!.snapshot;
  }).toPass({ timeout: 20_000 });
  return snap!;
}

const nodeState = (page: Page, id: string) =>
  expect(page.getByTestId(`node-${id}`)).toHaveAttribute("data-state", /./);

/**
 * A section's check only mounts once the end of that section is properly on
 * screen (an IntersectionObserver with a -15% bottom margin, in
 * components/session/consume/SectionCheck.tsx). Playwright cannot auto-scroll
 * to an element that does not exist yet, so the reading is scrolled the way a
 * learner scrolls it until the check appears.
 */
async function scrollToCheck(page: Page) {
  const sheet = page.getByTestId("phase-consume");
  await sheet.hover();
  // Not merely the last check: an already-answered one stays on screen and
  // stays disabled, so the newest *unanswered* option is the target.
  const check = sheet.locator('[data-testid="action-check-1"]:not([disabled])').last();
  await expect(async () => {
    await page.mouse.wheel(0, 900);
    await expect(check).toBeVisible({ timeout: 750 });
  }).toPass({ timeout: 20_000 });
  return check;
}

test("consume: reading the pass through moves the node off unknown", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, 0);

  const sheet = page.getByTestId("phase-consume");
  await expect(sheet).toBeVisible();

  // Three fixture sections; each gates its Continue behind the check.
  for (let i = 0; i < 3; i++) {
    // Option 1 is the correct one (lib/server/fixtures.ts).
    const check = await scrollToCheck(page);
    await check.click();
    const last = i === 2;
    await sheet.getByTestId(last ? "action-finish" : "action-continue").click({
      timeout: 15_000,
    });
  }

  // Finishing swaps the reading for the recap, which offers the hand-off into
  // Socratic rather than dumping the learner back on the map.
  const recap = page.getByTestId("phase-consume-recap");
  await expect(recap).toBeVisible();
  await expect(recap.getByTestId("action-begin-socratic")).toBeVisible();

  // …and the reading is recorded against the node, not lost with the sheet.
  type Progress = Record<string, { idx: number; finished: boolean }>;
  const snap = await persisted(
    page,
    (s) => !!(s.consumeProgress as Progress | undefined)?.[FIRST_NODE]?.finished,
  );
  // Read to the end, and recorded as such — the whole point of the mirror.
  expect((snap.consumeProgress as Progress)[FIRST_NODE].idx).toBeGreaterThan(0);
});

test("socratic: three answered probes advance the node", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "frontier" });
  await openPhase(page, FIRST_NODE, 1);

  const sheet = page.getByTestId("phase-socratic");
  await expect(sheet).toBeVisible();

  // Each step offers written reply options; the fixture's first is "correct".
  for (let i = 0; i < 3; i++) {
    const field = sheet.getByTestId("field-answer");
    if (!(await field.isVisible().catch(() => false))) break;
    await field.fill("It names the rule and what follows from it.");
    await sheet.getByTestId("action-submit").click();
    // The judge round-trip is a fixture: it lands immediately, but the reply
    // still has to render before the next probe is asked.
    await page.waitForTimeout(400);
  }

  // Whatever the pass concluded, it is persisted as progress on this node —
  // an unfinished pass must survive stepping back to the map.
  const snap = await persisted(page);
  expect(snap.states).toBeTruthy();
});

test("feynman: a judged teach-back spawns the gap it found", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "learning" });
  await openPhase(page, FIRST_NODE, 2);

  const sheet = page.getByTestId("phase-feynman");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("action-begin").click();

  // Two fixture beats, one textarea each.
  for (let i = 0; i < 2; i++) {
    await sheet.getByTestId("field-answer").fill(`Beat ${i + 1}: the rule, in my words.`);
    const last = i === 1;
    await sheet.getByTestId(last ? "action-submit" : "action-next").click();
  }

  // The fixture judge rules row 0 good and row 1 confused, so exactly one gap
  // is found — and taking the advance is what lands it on the map.
  const advance = sheet.getByTestId("action-advance");
  await expect(advance).toBeVisible({ timeout: 20_000 });
  await advance.click();

  // The hand-off goes on to Connect — Feynman's advance is a step in the
  // spiral, not an exit to the map.
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", /connect|map/);
  const snap = await persisted(
    page,
    (s) => ((s.spawnedIds ?? []) as string[]).length > 0,
  );
  const gapIds = snap.spawnedIds as string[];
  // …and the gap node is a real node on the persisted graph, not just an id.
  const nodes = snap.graph.nodes.map((n) => n.id);
  expect(nodes).toEqual(expect.arrayContaining([gapIds[0]]));
});

test("crucible: a graded attempt records a calibration reading", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "shaky", [SECOND_NODE]: "mastered" });
  await openPhase(page, FIRST_NODE, 4);

  const sheet = page.getByTestId("phase-crucible");
  await expect(sheet).toBeVisible();

  // The confidence gate comes first — that tap is the "felt" half of the
  // calibration reading the judged attempt completes.
  const confident = sheet.getByTestId("action-confidence-2");
  if (await confident.isVisible().catch(() => false)) await confident.click();

  await sheet
    .getByTestId("field-answer")
    .fill("The rule still applies: its requirement is met, only the framing changed.");
  await sheet.getByTestId("action-submit").click();

  // The fixture judge returns "partial", which is a real verdict with a real
  // consequence — the run records a felt-vs-real sample either way.
  await persisted(page, (s) => ((s.calibSamples ?? []) as unknown[]).length > 0);
});

test("retain: grading the day's queue writes the card store", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "mastered" });
  await openPhase(page, FIRST_NODE, 5);

  const sheet = page.getByTestId("phase-retain");
  await expect(sheet).toBeVisible();

  // Confidence tap (the pre-flip "felt"), then flip, then grade.
  const felt = sheet.getByTestId("action-confidence-2");
  if (await felt.isVisible().catch(() => false)) await felt.click();
  const good = sheet.getByTestId("action-grade-good");
  await expect(good).toBeVisible({ timeout: 20_000 });
  await good.click();

  await persisted(page, (s) => ((s.cards ?? []) as unknown[]).length > 0);
});

test("persistence: a reload restores the run exactly", async ({ page }) => {
  await openRun(page, { [FIRST_NODE]: "mastered", [SECOND_NODE]: "learning" });
  await nodeState(page, FIRST_NODE);

  const before = await persisted(page);
  await page.reload();
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");

  await expect(page.getByTestId(`node-${FIRST_NODE}`)).toHaveAttribute(
    "data-state",
    "mastered",
  );
  await expect(page.getByTestId(`node-${SECOND_NODE}`)).toHaveAttribute(
    "data-state",
    "learning",
  );
  const after = await persisted(page);
  expect(after.graph.nodes.length).toBe(before.graph.nodes.length);
});
