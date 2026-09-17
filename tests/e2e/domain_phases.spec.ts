// The three phases the domain axis adds, end to end.
//
// The seam these cover that a unit test cannot: each one's gate has a clause
// that is the whole reason the phase exists, and each of those clauses is
// invisible when broken — the phase would simply pass everyone. The fixtures
// are shaped to trip them rather than to sail through, so a run that passes
// here has actually exercised the rule and not just the screen.

import { expect, test } from "@playwright/test";
import { openPhase, openRun } from "./helpers";

/** A node on the interpretive ladder: the domain puts Provenance and Steelman
 *  into a plan that `PHASE_PLAN` alone would never produce. */
const interpretive = {
  domain: "interpretive",
  state: "learning",
  phases_done: ["consume"],
  phase_plan: [
    "consume",
    "discriminate",
    "provenance",
    "socratic",
    "steelman",
    "feynman",
    "connect",
    "crucible",
    "recall",
    "retain",
  ],
};

/** A performative node: Socratic, Feynman and Crucible are gone, and Produce
 *  is the rung that replaces them. */
const performative = {
  domain: "performative",
  state: "learning",
  phases_done: ["consume", "discriminate", "drill"],
  phase_plan: ["consume", "discriminate", "drill", "produce", "recall", "retain"],
};

test.describe("provenance", () => {
  test("holds the source up and withholds the ruling until it is committed", async ({
    page,
  }) => {
    await openRun(page, { notation: interpretive, foundations: "mastered" });
    await openPhase(page, "notation", "provenance");

    const sheet = page.getByTestId("phase-provenance");
    await expect(sheet).toBeVisible();
    // The source stays on screen for the whole pass: reading and ruling
    // together is the thing being practised.
    await expect(sheet.getByTestId("provenance-source")).toBeVisible();
    await expect(sheet.getByTestId("provenance-claim")).toBeVisible();
    await expect(sheet.getByTestId("call-right")).toHaveCount(0);
    await expect(sheet.getByTestId("call-wrong")).toHaveCount(0);
  });

  test("names taking the source at its word as its own failure", async ({ page }) => {
    await openRun(page, { notation: interpretive, foundations: "mastered" });
    await openPhase(page, "notation", "provenance");
    const sheet = page.getByTestId("phase-provenance");

    // Rule everything "proves" — the error the phase exists to catch. Two of
    // the five fixture claims are genuinely `proves`, so this scores without
    // understanding anything, which is exactly the run a plain score passes.
    for (let i = 0; i < 5; i++) {
      await sheet.getByTestId("action-rule-proves").click();
      await sheet.getByTestId("action-next").click();
    }
    await expect(sheet.getByTestId("phase-score")).toBeVisible();
    await expect(sheet.getByTestId("over-trusted")).toBeVisible();
    // And what the source is silent about, which is not a claim that can be
    // ruled and is half the lesson.
    await expect(sheet.getByTestId("provenance-silence")).toBeVisible();
  });
});

test.describe("steelman", () => {
  test("will not take one side on its own", async ({ page }) => {
    await openRun(page, { notation: interpretive, foundations: "mastered" });
    await openPhase(page, "notation", "steelman");
    const sheet = page.getByTestId("phase-steelman");

    await expect(sheet.getByTestId("steelman-question")).toBeVisible();
    // Submitting is blocked until BOTH cases are written — a learner who could
    // send their own side first would get a mark to write the other against.
    await expect(sheet.getByTestId("action-submit")).toBeDisabled();
    await sheet.getByTestId("field-case-0").fill("x".repeat(60));
    await expect(sheet.getByTestId("action-submit")).toBeDisabled();
    await sheet.getByTestId("field-case-1").fill("y".repeat(60));
    await expect(sheet.getByTestId("action-submit")).toBeEnabled();
  });

  test("rules the two sides separately", async ({ page }) => {
    await openRun(page, { notation: interpretive, foundations: "mastered" });
    await openPhase(page, "notation", "steelman");
    const sheet = page.getByTestId("phase-steelman");

    await sheet.getByTestId("field-case-0").fill("x".repeat(60));
    await sheet.getByTestId("field-case-1").fill("y".repeat(60));
    await sheet.getByTestId("action-hold-0").click();
    await sheet
      .getByTestId("field-disconfirmer")
      .fill("A contemporary account showing the princes ignored the absolution.");
    await sheet.getByTestId("action-submit").click();

    // The fixture rules one side strong and the other thin — the shape that
    // exercises the gate's own clause instead of a clean pass.
    await expect(sheet.getByTestId("steelman-verdict-0")).toBeVisible();
    await expect(sheet.getByTestId("steelman-verdict-1")).toBeVisible();
    await expect(sheet.getByTestId("steelman-response")).toBeVisible();
  });
});

test.describe("produce", () => {
  test("puts the microphone first and names avoidance as its own verdict", async ({
    page,
  }) => {
    await openRun(page, { notation: performative, foundations: "mastered" });
    await openPhase(page, "notation", "produce");
    const sheet = page.getByTestId("phase-produce");

    await expect(sheet.getByTestId("produce-scene")).toBeVisible();
    // The cue is in the learner's own language: reading a target-language
    // sentence aloud is not production.
    await expect(sheet.getByTestId("produce-cue")).toBeVisible();
    await expect(sheet.getByTestId("action-submit")).toBeDisabled();

    await sheet.getByTestId("field-said").fill("algo que eu disse");
    await sheet.getByTestId("action-submit").click();

    // `thin` — understood, but the target form was routed around. Every other
    // phase would score that as a pass.
    await expect(sheet.getByTestId("produce-verdict-thin")).toBeVisible();
    await expect(sheet.getByTestId("action-next")).toBeVisible();
  });
});
