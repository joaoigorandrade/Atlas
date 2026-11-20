"use client";

// Lightweight i18n: no catalog file. Each component keeps its own
// `STRINGS = { en: {...}, "pt-BR": {...} }` object and reads it through
// `useT`. This context only tracks which language is active.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "pt-BR";

const STORAGE_KEY = "atlas.language";

/** How the active language was arrived at.
 *
 *  The distinction matters because callers act on it: a run carries the
 *  language its content was generated in, and that has to win over a *guess*
 *  made from `navigator.language` — otherwise the same map opened on a
 *  differently-configured device presents as the wrong language to everything
 *  downstream — while never overriding a language the learner actually chose.
 *
 *  "initial" is the pre-detection SSR value: detection needs `window`, so the
 *  first render is always the default and the real answer lands one effect
 *  later. Consumers that must not act on a placeholder wait for `settled`. */
type LanguageSource = "initial" | "stored" | "detected" | "chosen";

function detectLanguage(): { language: Language; source: LanguageSource } {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "pt-BR")
    return { language: stored, source: "stored" };
  return {
    language: navigator.language?.toLowerCase().startsWith("en") ? "en" : "pt-BR",
    source: "detected",
  };
}

interface LanguageContextValue {
  language: Language;
  /** Record a language the *learner* picked. Persists, and counts as explicit. */
  setLanguage: (lang: Language) => void;
  /** Adopt a language from context — today, the language a restored run's
   *  content is written in. Deliberately does not persist: it describes the
   *  material being read, not a preference, and writing it would silently
   *  turn one map's language into this browser's standing choice. */
  adoptLanguage: (lang: Language) => void;
  /** False until detection has run. Before that, `language` is a placeholder. */
  settled: boolean;
  /** Whether `language` is the learner's own choice rather than a guess. */
  explicit: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt-BR");
  const [source, setSource] = useState<LanguageSource>("initial");

  useEffect(() => {
    const detected = detectLanguage();
    setLanguageState(detected.language);
    setSource(detected.source);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Stable: consumers put this in dependency arrays (AtlasApp's `applyRun`,
  // which the hydrate effect depends on in turn), and a fresh identity every
  // render would make those callbacks churn — and the `useMemo` below a no-op.
  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    setSource("chosen");
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  const adoptLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      adoptLanguage,
      settled: source !== "initial",
      explicit: source === "stored" || source === "chosen",
    }),
    [language, setLanguage, adoptLanguage, source],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

/** Pick the active-language entry from a co-located `{ en, "pt-BR" }` dict. */
export function useT<S extends Record<Language, unknown>>(strings: S): S["en"] {
  const { language } = useLanguage();
  return strings[language] as S["en"];
}

/** What a language change means for a run in progress. */
export type LanguageAction =
  /** Detection hasn't run yet; `language` is still the SSR placeholder. */
  | "wait"
  /** Take the run's own language — it describes content that already exists. */
  | "adopt"
  /** The learner changed languages: drop the caches and regenerate. */
  | "switch"
  | "none";

/**
 * Decide what a (possibly changed) UI language means for the open run.
 *
 * Pure and exported for the test, because the ordering here is what the bug
 * was made of: the language detected from the device lands an effect *after*
 * the run has hydrated, so a naive "language changed → regenerate" read every
 * mismatched device as a deliberate switch — clearing caches mid-load, and
 * leaving read-aloud speaking the run's prose in the device's language.
 */
export function languageAction(opts: {
  settled: boolean;
  explicit: boolean;
  /** The language the run's content is written in, when known. */
  runLanguage: Language | undefined;
  /** The language the UI is currently showing. */
  language: Language;
  /** The language the in-memory content is in. */
  contentLanguage: Language;
}): LanguageAction {
  if (!opts.settled) return "wait";
  // A guess about the device never overrides what the run is actually written
  // in; a choice the learner made always does.
  if (!opts.explicit && opts.runLanguage && opts.runLanguage !== opts.language)
    return "adopt";
  if (opts.contentLanguage === opts.language) return "none";
  return "switch";
}
