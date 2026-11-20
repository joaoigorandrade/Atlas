// Phase 0.2 — the ratchet. Every file under app/, components/ and lib/ has a
// line ceiling: `default` for anything unlisted, an explicit entry for the ones
// already over it. Ceilings only ever go down — when a file shrinks below its
// entry, lower the entry in the same PR. That is the whole mechanism that turns
// "we should keep it small" into a build failure.
//
// Run: node scripts/size-budget.mjs [--update]
//   --update rewrites the ceilings to today's sizes (never upward).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET = "size-budget.json";
const budget = JSON.parse(readFileSync(BUDGET, "utf8"));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(path) ? [path] : [];
  });

const files = ["app", "components", "lib"].flatMap(walk).sort();
const lines = (f) => readFileSync(f, "utf8").split("\n").length;

if (process.argv.includes("--update")) {
  const next = { default: budget.default, files: {} };
  for (const f of files) {
    const n = lines(f);
    // A ceiling never rises: an entry stays put unless the file got smaller.
    const ceiling = Math.min(budget.files[f] ?? Infinity, Math.max(n, budget.default));
    if (ceiling > budget.default || n > budget.default) next.files[f] = ceiling;
  }
  writeFileSync(BUDGET, JSON.stringify(next, null, 2) + "\n");
  console.log(
    `size-budget: ceilings written for ${Object.keys(next.files).length} files`,
  );
  process.exit(0);
}

const over = files
  .map((f) => [f, lines(f), budget.files[f] ?? budget.default])
  .filter(([, n, ceiling]) => n > ceiling);

for (const [f, n, ceiling] of over)
  console.error(`${f}: ${n} lines exceeds ceiling ${ceiling}`);

const slack = files
  .filter((f) => budget.files[f] && lines(f) < budget.files[f])
  .map((f) => `  ${f}: ${lines(f)} < ${budget.files[f]}`);
if (slack.length)
  console.log(
    `size-budget: ${slack.length} file(s) now under their ceiling — run ` +
      `\`node scripts/size-budget.mjs --update\` to ratchet:\n${slack.join("\n")}`,
  );

if (over.length) {
  console.error(`\nsize-budget: ${over.length} file(s) over budget.`);
  process.exit(1);
}
console.log(`size-budget: ${files.length} files within budget.`);
