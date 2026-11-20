// W1.1 / W2.6: the map shows the language a language map teaches, with a
// one-tap change of variant, and the lens a contested subject is read through.
// Both are written to the topic row; every generation after is stamped from it.

import { expect, test } from "@playwright/test";
import { openRun, readRun } from "./helpers";

test("the target language's variant and the lens are the learner's to set", async ({
  page,
}) => {
  await openRun(
    page,
    {},
    {
      target_language: "es-ES",
      lenses: ["Academic historiography", "The Church's own reading"],
    },
  );
  const variant = page.getByTestId("field-target-language");
  await expect(variant).toHaveValue("es-ES");
  await variant.selectOption("es-MX");
  const lens = page.getByTestId("topic-lens");
  await expect(lens).toContainText(/Pick the reading|Escolha a leitura/);
  await lens.getByText("The Church's own reading").click();

  await expect(async () => {
    const run = (await readRun(page.request)) as unknown as {
      axes: { targetLanguage: string; lens: string };
    };
    expect(run.axes.targetLanguage).toBe("es-MX");
    expect(run.axes.lens).toBe("The Church's own reading");
  }).toPass({ timeout: 15_000 });
});
