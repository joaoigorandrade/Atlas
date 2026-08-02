"use client";

// Lightweight i18n: no catalog file. Each component keeps its own
// `STRINGS = { en: {...}, "pt-BR": {...} }` object and reads it through
// `useT`. This context only tracks which language is active.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "pt-BR";

const STORAGE_KEY = "atlas.language";

function detectLanguage(): Language {
  if (typeof window === "undefined") return "pt-BR";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "pt-BR") return stored;
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "pt-BR";
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt-BR");

  useEffect(() => {
    setLanguageState(detectLanguage());
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    window.localStorage.setItem(STORAGE_KEY, lang);
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
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
