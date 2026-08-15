// Shared e2e plumbing (docs/AGENT-TESTING.md).
//
// The one idea here: no spec hand-writes a run snapshot. Onboarding is driven
// once, the snapshot the app itself persisted is captured from the seed store,
// and every later spec re-seeds that same snapshot with the node states it
// needs. A snapshot literal in a test file would be a second, drifting copy of
// `RunSnapshot` — this one is always the shape the app just wrote.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Mirrors DIAGNOSTIC_COUNT in lib/curriculum.ts. */
const DIAGNOSTIC_COUNT = 5;

export const TOPIC = "Linear algebra";
/** The first concept on the fixture map (lib/server/fixtures.ts). */
export const FIRST_NODE = "foundations";
export const SECOND_NODE = "notation";

const SEED = "/api/test/seed";

interface SeededRow {
  subject: string;
  snapshot: Snapshot;
  caches: unknown;
}

/** Only the parts a spec reaches into; the rest travels untouched. */
export interface Snapshot {
  states: Record<string, string>;
  graph: { nodes: Array<{ id: string; label: string }> };
  [key: string]: unknown;
}

export async function clearRuns(request: APIRequestContext): Promise<void> {
  await request.delete(SEED);
}

export async function readRun(
  request: APIRequestContext,
  subject = TOPIC,
): Promise<SeededRow | null> {
  const res = await request.get(`${SEED}?subject=${encodeURIComponent(subject)}`);
  const body = (await res.json()) as { runs: SeededRow[] };
  return body.runs[0] ?? null;
}

export async function writeRun(
  request: APIRequestContext,
  snapshot: Snapshot,
  subject = TOPIC,
): Promise<void> {
  const res = await request.post(SEED, { data: { subject, snapshot } });
  expect(res.ok()).toBeTruthy();
}

/** Onboarding, driven for real: topic → goal → build → placement → map. */
export async function runOnboarding(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("screen-welcome").waitFor();
  await page.getByTestId("field-topic").fill(TOPIC);
  await page.getByTestId("action-goal-mastery").click();
  await page.getByTestId("action-build").click();
  // The placement panel opens as soon as its first question lands. Answering
  // it for real (rather than skipping) is the point: the map the rest of the
  // suite seeds from is a *placed* map, states and all.
  await page.getByTestId("screen-diagnostic").waitFor({ timeout: 30_000 });
  await page.getByTestId("action-take-placement").click();
  for (let i = 0; i < DIAGNOSTIC_COUNT; i++) {
    // The fixture question's correct option is index 1 (lib/server/fixtures.ts).
    await page.getByTestId("action-answer-1").click({ timeout: 20_000 });
    await page.getByTestId("action-next").click();
  }
  await page.getByTestId("action-start").click({ timeout: 20_000 });
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
}

/**
 * A map with a run on it, without replaying onboarding every time.
 *
 * The first call in a worker builds the run and keeps the snapshot; later calls
 * re-seed it (with `states` applied) and reload. `states` is how a spec lands
 * on a concept that is already learned — a Crucible spec needs a mastered
 * neighbour to draw on, and earning one through the UI is six phases of setup.
 */
let captured: Snapshot | null = null;

// Playwright gives each spec file its own module registry, so the in-memory
// copy above only covers one file. The build is worth ~10s a spec, so the
// snapshot is also parked on disk — under `test-results/`, which Playwright
// wipes at the start of every run, so it can never go stale across runs.
const CACHE = path.join(process.cwd(), "test-results", "run-snapshot.json");

function cached(): Snapshot | null {
  if (captured) return captured;
  try {
    captured = JSON.parse(readFileSync(CACHE, "utf8")) as Snapshot;
  } catch {
    captured = null;
  }
  return captured;
}

export async function openRun(
  page: Page,
  states: Record<string, string> = {},
): Promise<Snapshot> {
  if (!cached()) {
    // A run left behind by an earlier spec would open on the map, and
    // onboarding starts from the welcome screen.
    await clearRuns(page.request);
    await runOnboarding(page);
    // The core save is debounced; the row appears a beat after the map does.
    await expect(async () => {
      const row = await readRun(page.request);
      expect(row?.snapshot).toBeTruthy();
      captured = row!.snapshot;
    }).toPass({ timeout: 15_000 });
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(captured));
  }
  const snapshot: Snapshot = {
    ...captured!,
    states: { ...captured!.states, ...states },
  };
  await writeRun(page.request, snapshot);
  await page.goto("/");
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  return snapshot;
}

/** Select a node and open one phase of its spiral, nudge and all. */
export async function openPhase(
  page: Page,
  nodeId: string,
  phaseIndex: number,
): Promise<void> {
  // Enter, not click: a node chip lives inside a panned/zoomed canvas and can
  // sit under the plan rail. Selecting by keyboard is both the accessible path
  // and the one that does not depend on where the canvas happens to be.
  await page.getByTestId(`node-${nodeId}`).press("Enter");
  await expect(page.getByTestId("panel-node")).toHaveAttribute("data-node", nodeId);
  await page.getByTestId(`action-phase-${phaseIndex}`).click();
  // Jumping ahead of the recommended phase asks first — take the skip.
  const confirm = page.getByTestId("action-skip-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
}
