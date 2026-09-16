// The phase catalogue, end to end.
//
// What this covers that a unit test cannot: a node's `kind` is decided by the
// map generation, stored as a column, read back through `/api/v1`, turned into
// a plan, drawn as a rail, and sent back out on every generation request. Six
// seams, and the unit tests only see the two in the middle. Every bug the
// catalogue shipped with was in a seam — a prop nobody passed, a CTA reading a
// different function than the click, a ledger nothing seeded.
//
// The fixture map (lib/server/fixtures.ts) carries one node of every kind on
// purpose, so these run against a real mix rather than six `concept`s.

import { expect, test } from "@playwright/test";
import { NODE_KINDS, PHASE_PLAN, type NodeKind, type PhaseId } from "@/lib/curriculum";
import {
  clearRuns,
  openPhase,
  openRun,
  readNodeRows,
  readRun,
  runOnboarding,
} from "./helpers";

/** The fixture map's kinds, by node id. Duplicated from `fixtures.ts` on
 *  purpose: a test that imported the table would assert it equals itself. */
const KIND_OF: Record<string, NodeKind> = {
  foundations: "concept",
  notation: "fact",
  "core-rule": "principle",
  "worked-cases": "procedure",
  "edge-cases": "concept",
  "putting-it-together": "procedure",
};

test.describe("the phase catalogue, end to end", () => {
  test("every generated node carries a kind and the plan that follows from it", async ({
    page,
  }) => {
    const run = await openRun(page);

    for (const node of run.graph.nodes) {
      if (node.gap) continue; // a gap runs no plan of its own
      const n = node as typeof node & { kind?: string; phasePlan?: string[] };
      expect(
        NODE_KINDS as readonly string[],
        `node ${node.id} has a kind the catalogue knows`,
      ).toContain(n.kind);
      expect(n.kind, `node ${node.id} kept the kind the map gave it`).toBe(
        KIND_OF[node.id],
      );
      expect(n.phasePlan, `node ${node.id} stores its kind's plan`).toEqual([
        ...PHASE_PLAN[n.kind as NodeKind],
      ]);
    }
  });

  test("the map exercises more than one kind", async ({ page }) => {
    // The guard on this whole file: if the generation ever collapses to all
    // `concept`, every per-kind assertion below still passes and tests nothing.
    const run = await openRun(page);
    const kinds = new Set(
      run.graph.nodes.filter((n) => !n.gap).map((n) => (n as { kind?: string }).kind),
    );
    expect(kinds.size).toBeGreaterThan(1);
    expect([...kinds].sort()).toEqual(["concept", "fact", "principle", "procedure"]);
  });

  test("kind and plan are stored as columns, not recomputed on read", async ({
    page,
  }) => {
    // Stored is the whole point: shipping a new catalogue must not re-cut the
    // rungs under a run already in progress.
    await openRun(page);
    const rows = await readNodeRows(page.request);
    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows) {
      if (row.is_gap) continue;
      const id = row.id as string;
      expect(row.kind, `row ${id} persisted its kind`).toBe(KIND_OF[id]);
      expect(row.phase_plan, `row ${id} persisted its plan`).toEqual([
        ...PHASE_PLAN[KIND_OF[id]],
      ]);
      expect(row.phases_done, `row ${id} starts with an empty ledger`).toEqual([]);
    }
  });

  test("a stored plan survives a catalogue the client disagrees with", async ({
    page,
  }) => {
    // The frozen-ladder promise, tested the only way it can be: give one node
    // a plan no `PHASE_PLAN` row produces and check the rail draws *that*.
    const short: PhaseId[] = ["consume", "feynman", "retain"];
    await openRun(page, { notation: { phase_plan: short, state: "unknown" } });

    await page.getByTestId("node-notation").press("Enter");
    await expect(page.getByTestId("panel-node")).toHaveAttribute("data-node", "notation");
    const rail = page.locator('[data-testid="panel-node"] [data-phase]');
    await expect(rail).toHaveCount(short.length);
    expect(await rail.evaluateAll((els) => els.map((e) => e.dataset.phase))).toEqual(
      short,
    );
  });

  test("the rail draws each node's own plan, addressed by phase id", async ({ page }) => {
    await openRun(page);

    for (const id of Object.keys(KIND_OF)) {
      await page.getByTestId(`node-${id}`).press("Enter");
      await expect(page.getByTestId("panel-node")).toHaveAttribute("data-node", id);
      const rail = page.locator('[data-testid="panel-node"] [data-phase]');
      await expect(rail, `${id} draws its whole plan`).toHaveCount(
        PHASE_PLAN[KIND_OF[id]].length,
      );
      expect(
        await rail.evaluateAll((els) => els.map((e) => e.dataset.phase)),
        `${id} draws its plan in catalogue order`,
      ).toEqual([...PHASE_PLAN[KIND_OF[id]]]);
    }
  });

  test("every generation request carries the node's kind", async ({ page }) => {
    // The second lever: `kindNote` rewrites the prompt per kind, and it can
    // only do that if the kind makes it onto the wire. It is also part of the
    // cache key, so a request that drops it reads a row the click never wrote.
    //
    // Onboarding is driven for real rather than re-seeded, because the warm
    // pass that fires behind it is the only moment every node's reading is
    // requested — a re-seeded run reads them all back out of the cache and
    // puts nothing on the wire at all.
    const sent = new Map<string, string | undefined>();
    page.on("request", (req) => {
      if (req.method() !== "POST" || !req.url().includes("/api/generate")) return;
      let body: Record<string, unknown> = {};
      try {
        body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        return;
      }
      if (body.kind === "consume" && typeof body.nodeLabel === "string")
        sent.set(body.nodeLabel, body.nodeKind as string | undefined);
    });

    await clearRuns(page.request);
    await runOnboarding(page);

    await expect(async () => {
      expect(sent.size, "every node's reading was requested").toBeGreaterThanOrEqual(
        Object.keys(KIND_OF).length,
      );
    }).toPass({ timeout: 30_000 });

    // Label rather than id, because that is what the request carries.
    expect(sent.get("Notation"), "a fact is requested as a fact").toBe("fact");
    expect(sent.get("The core rule"), "a principle as a principle").toBe("principle");
    expect(sent.get("Worked cases"), "a procedure as a procedure").toBe("procedure");
    expect(sent.get("Foundations"), "a concept as a concept").toBe("concept");
  });

  test("finishing a phase writes the ledger, and state falls out of it", async ({
    page,
  }) => {
    // The inversion, on a non-`concept` node: the old code wrote `learning` as
    // a literal, so a kind whose plan differed could never have derived it.
    // `core-rule` is a `principle`, and its one prerequisite is mastered — so
    // it derives frontier from a stored `unknown`, which is the only way a
    // real run ever reaches frontier. Forcing the string into the row instead
    // would seed a state the app never stores.
    await openRun(page, { notation: "mastered", "core-rule": { state: "unknown" } });
    await expect(page.getByTestId("node-core-rule")).toHaveAttribute(
      "data-state",
      "frontier",
    );

    await openPhase(page, "core-rule", "socratic");
    await expect(page.getByTestId("phase-socratic")).toBeVisible();

    await expect(async () => {
      const row = (await readNodeRows(page.request)).find((r) => r.id === "core-rule")!;
      expect(row.state).toBe("learning");
    }).toPass({ timeout: 15_000 });
  });

  test("the primary CTA names the phase it opens", async ({ page }) => {
    // The bug: a fixed per-state label while the click walked the node's own
    // plan. Sharper now that the plans differ — two nodes in the *same* state
    // with the *same* ledger owe different rungs, so nothing about the state
    // can name the button. `core-rule` is a principle and owes Socratic;
    // `worked-cases` is a procedure, which runs no Socratic pass at all and
    // owes Feynman.
    await openRun(page, {
      "core-rule": { state: "learning", phases_done: ["consume"] },
      "worked-cases": { state: "learning", phases_done: ["consume"] },
    });

    await page.getByTestId("node-worked-cases").press("Enter");
    await expect(page.getByTestId("panel-node")).toHaveAttribute(
      "data-node",
      "worked-cases",
    );
    await expect(page.getByTestId("action-primary")).toContainText("Feynman");

    await page.getByTestId("node-core-rule").press("Enter");
    await expect(page.getByTestId("panel-node")).toHaveAttribute(
      "data-node",
      "core-rule",
    );
    const cta = page.getByTestId("action-primary");
    await expect(cta).toContainText("Socratic");
    await cta.click();
    await expect(page.getByTestId("phase-socratic")).toBeVisible();
  });

  test("a Shaky node with a full ledger goes back to the Crucible, not to review", async ({
    page,
  }) => {
    // Every shaky line in the app says re-attempt the Crucible. `nextPhase`
    // skips Retain, so a review-miss on a finished node returned nothing and
    // the CTA fell through to the review queue — contradicting the copy the
    // learner is reading one line above the button.
    await openRun(page, {
      "putting-it-together": {
        state: "shaky",
        shaky_reason: "review-miss",
        reviewed: true,
        phases_done: ["consume", "socratic", "feynman", "connect", "crucible"],
      },
      "worked-cases": "mastered",
      "edge-cases": "mastered",
      "core-rule": "mastered",
    });

    await page.getByTestId("node-putting-it-together").press("Enter");
    const cta = page.getByTestId("action-primary");
    await expect(cta).toContainText("Crucible");
    await cta.click();
    await expect(page.getByTestId("phase-crucible")).toBeVisible();
  });

  test("a shaky reason left on a node that went green does not drag it back", async ({
    page,
  }) => {
    // Prod carries rows like this: the reason was inert while state was the
    // input, so nothing cleared it when a flagged node later passed. With state
    // derived, loading one would re-derive the node Shaky.
    await openRun(page, {
      "edge-cases": {
        state: "mastered",
        shaky_reason: "crucible-fail",
        phases_done: ["consume", "socratic", "feynman", "connect", "crucible"],
      },
    });

    const run = await readRun(page.request);
    expect(run!.states["edge-cases"]).toBe("mastered");
    expect(
      (run as unknown as { shakyReasons: Record<string, string> }).shakyReasons[
        "edge-cases"
      ],
      "the contradiction is dropped on read",
    ).toBeUndefined();
    await expect(page.getByTestId("node-edge-cases")).toHaveAttribute(
      "data-state",
      "mastered",
    );
  });

  test("a failed Crucible does not close the Crucible rung", async ({ page }) => {
    // The gate has to actually gate. A rung that entered the ledger on a failed
    // attempt would derive the node `mastered` the moment the shaky reason was
    // cleared — the ledger is the record of what was *passed*, not attempted.
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
    await expect(sheet).toBeVisible();
    const confident = sheet.getByTestId("action-confidence-2");
    if (await confident.isVisible().catch(() => false)) await confident.click();
    await sheet
      .getByTestId("field-answer")
      .fill("The requirement is met; only the framing changed.");
    await sheet.getByTestId("action-submit").click();

    await expect(async () => {
      const row = (await readNodeRows(page.request)).find(
        (r) => r.id === "worked-cases",
      )!;
      expect(row.state).toBe("shaky");
      expect(row.phases_done).not.toContain("crucible");
    }).toPass({ timeout: 20_000 });
  });

  test("a plan that ends at Connect goes green there, not into a loop", async ({
    page,
  }) => {
    // The trap the `fact` ladder would otherwise ship. Closing Connect used to
    // write `connect-complete` unconditionally, which derives Shaky; the CTA
    // then re-opens the plan's last gate — which, on a plan whose last gate IS
    // Connect, is the rung just finished. Closing it again writes the reason
    // again: a loop with no exit.
    //
    // Driven on `foundations` with a forced three-rung plan rather than on the
    // fixture's `fact`, because `foundations` is the one node with no
    // prerequisites: nothing else on the map is touched, so the pass takes its
    // nothing-to-wire exit and closes the rung without a generated candidate
    // pool to negotiate. The plan shape is what this is about, not the kind.
    const untouched = { state: "unknown", phases_done: [] };
    await openRun(page, {
      foundations: {
        state: "learning",
        phases_done: ["consume"],
        phase_plan: ["consume", "connect", "retain"],
      },
      notation: untouched,
      "core-rule": untouched,
      "worked-cases": untouched,
      "edge-cases": untouched,
      "putting-it-together": untouched,
    });

    await openPhase(page, "foundations", "connect");

    await expect(page.getByTestId("node-foundations")).toHaveAttribute(
      "data-state",
      "mastered",
    );
    await expect(async () => {
      const row = (await readNodeRows(page.request)).find((r) => r.id === "foundations")!;
      expect(row.state, "Connect is the last gate — closing it is green").toBe(
        "mastered",
      );
      expect(
        row.shaky_reason,
        "and there is no later gate to be shaky about",
      ).toBeFalsy();
      expect(row.phases_done).toContain("connect");
    }).toPass({ timeout: 15_000 });
  });

  test("pruning a node completes its whole plan, not just its last rung", async ({
    page,
  }) => {
    // "I already know this" is the one path to green fixture mode can reach
    // (see the report: the fixture judge returns `partial` on every Crucible
    // attempt, so the transfer-confirmed path is unreachable). It is also the
    // sharper test of the inversion: nothing writes `mastered` as a literal,
    // the whole plan lands in the ledger and the state falls out of it.
    await openRun(page, { foundations: { state: "unknown" } });
    await expect(page.getByTestId("node-foundations")).toHaveAttribute(
      "data-state",
      "frontier",
    );

    await page.getByTestId("node-foundations").press("Enter");
    await page.getByTestId("action-skip-known").click();

    await expect(page.getByTestId("node-foundations")).toHaveAttribute(
      "data-state",
      "mastered",
    );
    await expect(async () => {
      const row = (await readNodeRows(page.request)).find((r) => r.id === "foundations")!;
      expect(row.state).toBe("mastered");
      expect(row.phases_done).toEqual([...PHASE_PLAN.concept]);
    }).toPass({ timeout: 15_000 });
  });
});
