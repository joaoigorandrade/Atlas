#!/usr/bin/env node
// The i18n gate: the String Catalogue must hold exactly the keys the compiler
// sees, and every one of them must have an English value.
//
// The key set is not guessed from a regex — `SWIFT_EMIT_LOC_STRINGS=YES` makes
// swiftc write one `.stringsdata` per file listing every `Text("…")`,
// `String(localized:)` and `LocalizedStringKey` literal it compiled. That is
// the same extraction Xcode uses, so a new line of copy cannot hide from it.
//
// `--update` folds new keys into the catalogue with an empty, `new` English
// unit and drops keys no longer in the code; the run still fails, because an
// empty English unit is the thing this exists to catch.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ios = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ios, "App/Resources/Localizable.xcstrings");
const DERIVED = join(ios, ".build/strings");
const update = process.argv.includes("--update");

execFileSync(
  "xcodebuild",
  ["-scheme", "AtlasKit", "-destination", "generic/platform=iOS Simulator",
   "-derivedDataPath", DERIVED, "SWIFT_EMIT_LOC_STRINGS=YES", "build"],
  { cwd: join(ios, "AtlasKit"), stdio: ["ignore", "ignore", "inherit"] },
);

function stringsdata(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) stringsdata(path, out);
    else if (name.endsWith(".stringsdata")) out.push(path);
  }
  return out;
}

const inCode = new Map(); // key -> source file that uses it
for (const path of stringsdata(join(DERIVED, "Build/Intermediates.noindex/AtlasKit.build"))) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const source = (data.source ?? "").split("Sources/AtlasKit/").pop();
  for (const table of Object.values(data.tables ?? {}))
    for (const entry of table) if (!inCode.has(entry.key)) inCode.set(entry.key, source);
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const strings = catalog.strings ?? {};

/** Every English string a key resolves to — one, or one per plural category. */
function english(entry) {
  const en = entry?.localizations?.en;
  if (!en) return [];
  if (en.stringUnit) return [en.stringUnit.value];
  return Object.values(en.variations?.plural ?? {}).map((v) => v.stringUnit?.value);
}

const untranslated = [...inCode.keys()].filter((key) => {
  const values = english(strings[key]);
  return values.length === 0 || values.some((v) => !v);
});
const stale = Object.keys(strings).filter((key) => !inCode.has(key));

if (update) {
  for (const key of untranslated)
    strings[key] ??= { localizations: { en: { stringUnit: { state: "new", value: "" } } } };
  for (const key of stale) delete strings[key];
  const ordered = Object.fromEntries(Object.keys(strings).sort().map((k) => [k, strings[k]]));
  writeFileSync(CATALOG, `${JSON.stringify({ ...catalog, strings: ordered }, null, 2)}\n`);
}

for (const key of untranslated) console.error(`no English: ${JSON.stringify(key)} (${inCode.get(key)})`);
for (const key of stale) console.error(`not in the code any more: ${JSON.stringify(key)}`);

if (untranslated.length || stale.length) {
  console.error(
    `\n${inCode.size} keys in the code, ${untranslated.length} without English, ${stale.length} stale.` +
    (update ? "\nCatalogue updated — write the English for the new keys." : "\nRun `make strings-update`, then write the English."),
  );
  process.exit(1);
}
console.log(`${inCode.size} keys, all with English.`);
