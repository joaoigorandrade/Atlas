import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOAST_STRINGS } from "@/lib/toastCopy";

// The bug this file exists to catch: a lang-aware helper (`confidenceLevels`,
// `reviewAside`, `goals`, …) exists and is *ignored* at the call site, which
// renders the English constant it wraps to a pt-BR learner. TypeScript can't
// see it — both are strings — and it only shows up on screen.

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** The English half of every `X` / `X_PT` pair, and where it's declared. */
function englishConstants(files: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(
      /(?:export )?const ([A-Z][A-Z0-9_]*)_PT\b/g,
    ))
      out.set(m[1], file);
  }
  return out;
}

describe("i18n coverage", () => {
  it("never reads an English-only constant from a component", () => {
    const lib = sources("lib");
    const ui = [...sources("components"), ...sources("app")];
    const offenders: string[] = [];
    for (const [name, declaredIn] of englishConstants(lib)) {
      const re = new RegExp(`\\b${name}\\b(?!_PT)`);
      for (const file of ui)
        if (re.test(readFileSync(file, "utf8")))
          offenders.push(`${file} reads ${name} (${declaredIn}) instead of its helper`);
    }
    expect(offenders).toEqual([]);
  });

  it("translates every hook-side string", () => {
    const en = TOAST_STRINGS.en as Record<string, unknown>;
    const pt = TOAST_STRINGS["pt-BR"] as Record<string, unknown>;
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    // Phase names are product vocabulary and stay English; everything else
    // that came out identical is a line someone forgot to translate.
    const same = Object.keys(en).filter(
      (k) => typeof en[k] === "string" && en[k] === pt[k],
    );
    expect(same).toEqual([]);
  });
});
