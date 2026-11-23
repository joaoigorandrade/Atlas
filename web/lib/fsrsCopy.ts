// The words the scheduler's numbers are read in: the forecast rows and the
// interval under every grade button. A leaf module, so both the scheduler
// (`lib/fsrs.ts`) and the queue (`lib/fsrsQueue.ts`) can read it without
// importing each other.

import type { Language } from "@/lib/i18n";

/** The forecast's own copy — three fixed rows, so it lives here rather than in
 *  a component: `retainContentFromStore` builds them before any render. */
const FORECAST_STRINGS = {
  en: {
    dueNow: "Due in all — today’s deck included",
    thisWeek: "Coming up this week",
    rockSolid: "Rock-solid",
    cards: (n: number) => `${n} card${n === 1 ? "" : "s"}`,
    minutes: (n: number) => `~${n} min`,
    onSchedule: "recall lifting as scheduled",
    farOut: "next lift 30 d+ out",
    hours: (n: number) => `${n} h`,
    months: (n: number) => `${n} mo`,
    years: (n: number) => `${n} y`,
  },
  "pt-BR": {
    dueNow: "Vencidos ao todo — a fila de hoje inclusa",
    thisWeek: "Chegando esta semana",
    rockSolid: "Consolidado",
    cards: (n: number) => `${n} ${n === 1 ? "cartão" : "cartões"}`,
    minutes: (n: number) => `~${n} min`,
    onSchedule: "a lembrança sobe conforme o previsto",
    farOut: "próxima revisão em 30 d+",
    hours: (n: number) => `${n} h`,
    months: (n: number) => (n === 1 ? "1 mês" : `${n} meses`),
    years: (n: number) => (n === 1 ? "1 ano" : `${n} anos`),
  },
} as const;

/** The copy for a language — falling back to English for anything else, so a
 *  client sending an unknown `lang` gets English rather than a 500. */
export function stringsFor(lang: Language | string | null | undefined) {
  return FORECAST_STRINGS[lang as Language] ?? FORECAST_STRINGS.en;
}

/** The interval on a grade button, in the learner's language.
 *
 *  Localized because it is the one number the phone no longer computes: the
 *  scheduler runs on the server, so these words are written there too, and an
 *  app whose source language is pt-BR would otherwise show "2 mo" under "Fácil". */
export function fmtInterval(ms: number, lang: Language = "en"): string {
  const t = stringsFor(lang);
  const min = ms / 60_000;
  // Anki's own reading of a learning step: "<10m" means "within ten minutes".
  if (min < 60) return `<${Math.max(1, Math.ceil(min))} min`;
  const hours = ms / 3_600_000;
  if (hours < 22) return t.hours(Math.round(hours));
  const days = ms / 86_400_000;
  if (days < 30) return `${Math.max(1, Math.round(days))} d`;
  if (days < 365) return t.months(Math.round(days / 30));
  return t.years(Math.round(days / 365));
}
