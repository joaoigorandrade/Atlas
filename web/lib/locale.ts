// Locale facts that both sides of the app need.
//
// Split out of `lib/speech.ts` when read-aloud moved to a hosted engine: that
// file is `"use client"`, and the server route that calls the speech provider
// has to name the same voice locale the browser's dictation does. One
// definition, importable from either side — the `Language` import is a type,
// which erases, so this stays free of the client boundary.

import type { Language } from "@/lib/i18n";

/** BCP-47 tag for a speech engine. The voice follows the language setting; it
 *  is never a second choice the learner has to make. */
export function speechLang(language: Language): string {
  return language === "en" ? "en-US" : "pt-BR";
}
