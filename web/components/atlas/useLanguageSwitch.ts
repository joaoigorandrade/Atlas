"use client";

// Which language wins, and whether a change is a *switch* (regenerate) or
// merely the app working out where it is (leave everything alone).
//
// Generated content carries the language of the prompt that wrote it and
// nothing else, so switching language mid-run must drop every cached surface —
// otherwise the learner keeps reading the old language back out of memory (and
// out of the saved snapshot) forever.
//
// `settled` is what makes this correct: detection needs `window`, so the first
// render is always the "pt-BR" placeholder and the real language lands an
// effect later — after the app has already hydrated the run. Acting on that
// transition treated every device whose locale disagreed with the run as a
// deliberate language switch, and dropped the caches mid-load.

import { useEffect, useRef } from "react";
import { type Language, languageAction, useLanguage } from "@/lib/i18n";
import type { WarmQueue } from "@/lib/warm";

export function useLanguageSwitch(
  run: {
    runLanguage: Language | undefined;
    setRunLanguage: (language: Language) => void;
    clearCaches: () => void;
  },
  warm: WarmQueue,
) {
  const { language, adoptLanguage, settled, explicit } = useLanguage();
  const { runLanguage, setRunLanguage, clearCaches } = run;
  const contentLanguageRef = useRef(language);

  useEffect(() => {
    const action = languageAction({
      settled,
      explicit,
      runLanguage,
      language,
      contentLanguage: contentLanguageRef.current,
    });
    if (action === "wait" || action === "none") return;
    if (action === "adopt") {
      // `runLanguage` is defined whenever the decision is "adopt".
      contentLanguageRef.current = runLanguage as Language;
      adoptLanguage(runLanguage as Language);
      return;
    }
    contentLanguageRef.current = language;
    // Everything is about to be regenerated in the new language, so from here
    // the run's language is known — whatever it was before.
    setRunLanguage(language);
    warm.clear();
    clearCaches();
  }, [
    language,
    settled,
    explicit,
    runLanguage,
    adoptLanguage,
    warm,
    clearCaches,
    setRunLanguage,
  ]);
}
