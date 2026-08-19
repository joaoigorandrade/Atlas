// The dashboard and profile copy, lifted out of `useDerived` so the view model
// stays under its size ceiling. Same `{ en, "pt-BR" }` shape as every surface;
// the hook reads it with `useT`.

export const STRINGS = {
  en: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    there: "there",
    yourMap: "Your map",
    generalMastery: "General mastery",
    dayStreak: "Day streak",
    conceptsMastered: "Concepts mastered",
    onTheFrontier: "On the frontier",
    mapMastered: "Map mastered",
    queueClear: "Today's queue is clear — new cards surface as memories fade",
    queueDue: (cards: number, minutes: number) =>
      `${cards} card${cards === 1 ? "" : "s"} due today · ~${minutes} min budget`,
  },
  "pt-BR": {
    morning: "Bom dia",
    afternoon: "Boa tarde",
    evening: "Boa noite",
    there: "por aí",
    yourMap: "Seu mapa",
    generalMastery: "Domínio geral",
    dayStreak: "Dias seguidos",
    conceptsMastered: "Conceitos dominados",
    onTheFrontier: "Na fronteira",
    mapMastered: "Do mapa dominado",
    queueClear:
      "A fila de hoje está zerada — novos cards aparecem conforme a memória enfraquece",
    queueDue: (cards: number, minutes: number) =>
      `${cards} card${cards === 1 ? "" : "s"} para hoje · ~${minutes} min de orçamento`,
  },
} as const;
