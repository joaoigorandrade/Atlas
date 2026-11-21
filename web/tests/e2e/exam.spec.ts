// The mock exam, end to end: it is offered only on a finished map, it writes a
// paper of the size and difficulty chosen, it takes an own-words answer as
// well as a pick, and the key appears only on the result.
//
// The fixture paper's key walks the four slots (question i's answer is option
// i % 4) and the fixture choice judge reads every own-words answer as option 0,
// so the score below is fixed by the picks alone.

import { expect, test } from "@playwright/test";
import { openRun } from "./helpers";

const SHOTS = process.env.ATLAS_EXAM_SHOTS;

test.describe("mock exam", () => {
  test("offered only once every concept is mastered, scored at the end", async ({
    page,
  }) => {
    const run = await openRun(page);
    await expect(page.getByTestId("action-exam-open")).toHaveCount(0);

    const all = Object.fromEntries(run.graph.nodes.map((n) => [n.id, "mastered"]));
    await openRun(page, all);
    const invite = page.getByTestId("action-exam-open");
    await expect(invite).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-map-invite.png` });
    await invite.click();

    const sheet = page.getByTestId("screen-exam");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("app")).toHaveAttribute("data-sheet", "exam");
    await sheet.getByTestId("action-exam-size-5").click();
    await sheet.getByTestId("action-exam-difficulty-hard").click();
    await expect(sheet.getByTestId("action-exam-size-5")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-setup.png` });
    await sheet.getByTestId("action-exam-start").click();

    // Question 1 opens on the own-words box, and nothing marks it right.
    await expect(sheet.getByTestId("exam-question")).toContainText("Question 1");
    await expect(sheet.getByTestId("action-exam-next")).toBeDisabled();
    await sheet.getByTestId("field-answer").fill("The first statement is the one.");
    await sheet.getByTestId("action-submit").click();
    await expect(sheet.getByTestId("action-pick-0")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(sheet.getByTestId("exam-result")).toHaveCount(0);
    await sheet.getByTestId("action-exam-next").click();

    // The rest on the choices: 2 → A (key B), 3 → C (key C), 4 → A (key D),
    // 5 → A (key A). With question 1 right, that is 3 of 5.
    await sheet.getByTestId("action-mode-choices").click();
    for (const pick of [0, 2, 0, 0]) {
      await sheet.getByTestId(`action-pick-${pick}`).click();
      if (SHOTS && pick === 2) await page.screenshot({ path: `${SHOTS}/3-question.png` });
      await sheet.getByTestId("action-exam-next").click();
    }

    const result = sheet.getByTestId("exam-result");
    await expect(result).toContainText("60%");
    await expect(result).toContainText("3 of 5");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-result.png`, fullPage: true });

    // A retake is a new paper on the same settings, back at question 1.
    await sheet.getByTestId("action-exam-retake").click();
    await expect(sheet.getByTestId("exam-question")).toContainText("Question 1");
    await sheet.getByTestId("action-exit").click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-sheet", "none");
  });
});
