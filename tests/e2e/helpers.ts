// Shared e2e plumbing (docs/AGENT-TESTING.md).
//
// The one idea here: no spec hand-writes a run. Onboarding is driven once, the
// rows the app itself persisted are captured from the fixture tables, and every
// later spec re-seeds those same rows with the node states it needs. A run
// literal in a test file would be a second, drifting copy of the schema — this
// one is always what the app just wrote.
//
// Reads go through the real `/api/v1` route rather than the seed store, so a
// spec asserting "it was persisted" is asserting what the app would actually
// read back. Writes go straight to the tables, because forcing a node to
// `mastered` is the one thing no route will do for you.

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

/** The fixture tables, as the seed route hands them over. */
type Tables = Record<string, Array<Record<string, unknown>>>;

/** A topic as `/api/v1` sends it — the shape both clients draw from. Only the
 *  parts a spec reaches into are named; the rest travels untouched. */
export interface Run {
  id: string;
  subject: string;
  states: Record<string, string>;
  graph: { nodes: Array<{ id: string; label: string; gap?: boolean }> };
  consumeProgress: Record<string, unknown>;
  cards: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Gap nodes, which used to be their own `spawnedIds` list on the snapshot and
 *  are now a flag on the node row. Derived here so a spec asks one question. */
export const gapIds = (run: Run): string[] =>
  run.graph.nodes.filter((n) => n.gap).map((n) => n.id);

export async function clearRuns(request: APIRequestContext): Promise<void> {
  await request.delete(SEED);
}

/** The open run, read back through the route the app itself reads. */
export async function readRun(request: APIRequestContext): Promise<Run | null> {
  const res = await request.get("/api/v1/bootstrap");
  if (!res.ok()) return null;
  const body = (await res.json()) as { topics: Run[] };
  return body.topics?.[0] ?? null;
}

async function readTables(request: APIRequestContext): Promise<Tables> {
  const res = await request.get(SEED);
  const body = (await res.json()) as { tables: Tables };
  return body.tables ?? {};
}

/** Replace the store with these rows. Cleared first: the seed route appends,
 *  and seeding over a live run would double every node. */
async function writeTables(request: APIRequestContext, tables: Tables): Promise<void> {
  await clearRuns(request);
  const res = await request.post(SEED, { data: { tables } });
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
 * The first call in a worker builds the run and keeps its rows; later calls
 * re-seed them (with `states` applied) and reload. `states` is how a spec lands
 * on a concept that is already learned — a Crucible spec needs a mastered
 * neighbour to draw on, and earning one through the UI is six phases of setup.
 */
let captured: Tables | null = null;

// Playwright gives each spec file its own module registry, so the in-memory
// copy above only covers one file. The build is worth ~10s a spec, so the rows
// are also parked on disk — under `test-results/`, which Playwright wipes at
// the start of every run, so they can never go stale across runs.
const CACHE = path.join(process.cwd(), "test-results", "run-tables.json");

function cached(): Tables | null {
  if (captured) return captured;
  try {
    captured = JSON.parse(readFileSync(CACHE, "utf8")) as Tables;
  } catch {
    captured = null;
  }
  return captured;
}

/** The captured rows with `states` forced onto the matching nodes. */
function withStates(tables: Tables, states: Record<string, string>): Tables {
  return {
    ...tables,
    nodes: (tables.nodes ?? []).map((node) => {
      const forced = states[node.id as string];
      return forced ? { ...node, state: forced } : node;
    }),
  };
}

export async function openRun(
  page: Page,
  states: Record<string, string> = {},
): Promise<Run> {
  if (!cached()) {
    // A run left behind by an earlier spec would open on the map, and
    // onboarding starts from the welcome screen.
    await clearRuns(page.request);
    await runOnboarding(page);
    // The writes are debounced; the rows appear a beat after the map does.
    await expect(async () => {
      const tables = await readTables(page.request);
      expect((tables.nodes ?? []).length).toBeGreaterThan(1);
      captured = tables;
    }).toPass({ timeout: 15_000 });
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(captured));
  }
  await writeTables(page.request, withStates(captured!, states));
  await page.goto("/");
  await expect(page.getByTestId("app")).toHaveAttribute("data-screen", "map");
  await expect(page.getByTestId("app")).toHaveAttribute("data-hydrated", "1");
  return (await readRun(page.request))!;
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
