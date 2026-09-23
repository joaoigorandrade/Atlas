// The dashboard screen's copy, lifted out of the view so the file stays under
// its size ceiling — the same move `retainCopy.ts`, `crucibleCopy.tsx` and
// `socraticCopy.ts` already make. `tests/i18nCoverage.test.ts` builds every
// line here in both languages.

export const STRINGS = {
  en: {
    dayStreak: (n: number) => (n === 1 ? "day streak" : "day streak"),
    profile: "Profile",
    frontierIntro: (n: number) =>
      `You're on the frontier of ${n} concept${n === 1 ? "" : "s"}. Pick up where you left off.`,
    fullyMastered: "Your map is fully mastered. Keep the memories fresh with review.",
    todaysReview: "Today’s review",
    queueClear: "Queue clear ✓",
    cardsDue: (n: number) => `${n} card${n === 1 ? "" : "s"} due`,
    nothingDueYet: "Nothing due yet",
    metTodayBody:
      "You've met today's target. New cards surface as memories start to fade.",
    metTodayWaiting: (n: number) =>
      `Today's budget is spent — ${n} card${n === 1 ? "" : "s"} still waiting. They keep until tomorrow, or raise your daily target to take them now.`,
    cardsDueBody: (min: number) =>
      `~${min} min · timed to the moment these memories are about to fade.`,
    nothingDueBody: "Learn a concept to the end and it starts feeding the review queue.",
    startReview: "Start review →",
    yourFrontier: "Your frontier",
    allCaughtUp: "All caught up",
    frontierBody: (subject: string) =>
      `The next concept you're ready to learn in ${subject}.`,
    frontierDoneBody: (subject: string) => `Every concept in ${subject} is under way.`,
    openMap: "Open the map →",
    yourMaps: "Your maps",
    newMap: "+ New map",
    mapsFailed: "Couldn’t load your maps — they’re safe, this is just the list.",
    mapsRetry: "Try again",
    complete: "Complete",
    inProgress: "In progress",
    justStarted: "Just started",
    masteredPct: (pct: number) => `${pct}% mastered`,
    onFrontier: (n: number) => `${n} on frontier`,
    exclude: "Exclude this topic",
    excludeKicker: "Exclude topic",
    excludeAsk: (subject: string) => `Exclude “${subject}”?`,
    excludeBody:
      "The map, its mastery states, its cards and everything generated for it are deleted. Your streak stays. This can't be undone.",
    excludeConfirm: "Exclude",
    excludeCancel: "Keep it",
  },
  "pt-BR": {
    dayStreak: (n: number) => (n === 1 ? "dia de sequência" : "dias de sequência"),
    profile: "Perfil",
    frontierIntro: (n: number) =>
      `Você está na fronteira de ${n} conceito${n === 1 ? "" : "s"}. Continue de onde parou.`,
    fullyMastered:
      "Seu mapa está totalmente dominado. Mantenha as memórias frescas com revisão.",
    todaysReview: "Revisão de hoje",
    queueClear: "Fila limpa ✓",
    cardsDue: (n: number) => (n === 1 ? "1 cartão pendente" : `${n} cartões pendentes`),
    nothingDueYet: "Nada pendente ainda",
    metTodayBody:
      "Você cumpriu a meta de hoje. Novos cartões surgem à medida que as memórias começam a desvanecer.",
    metTodayWaiting: (n: number) =>
      `A meta de hoje foi cumprida — ${n === 1 ? "1 cartão ainda espera" : `${n} cartões ainda esperam`}. Eles ficam para amanhã, ou aumente sua meta diária para pegá-los agora.`,
    cardsDueBody: (min: number) =>
      `~${min} min · no momento exato em que essas memórias estão prestes a desvanecer.`,
    nothingDueBody:
      "Aprenda um conceito até o fim e ele passa a alimentar a fila de revisão.",
    startReview: "Iniciar revisão →",
    yourFrontier: "Sua fronteira",
    allCaughtUp: "Tudo em dia",
    frontierBody: (subject: string) =>
      `O próximo conceito que você está pronto para aprender em ${subject}.`,
    frontierDoneBody: (subject: string) =>
      `Todo conceito em ${subject} está em andamento.`,
    openMap: "Abrir o mapa →",
    yourMaps: "Seus mapas",
    newMap: "+ Novo mapa",
    mapsFailed:
      "Não deu para carregar seus mapas — eles estão seguros, isto é só a lista.",
    mapsRetry: "Tentar de novo",
    complete: "Completo",
    inProgress: "Em andamento",
    justStarted: "Novo",
    masteredPct: (pct: number) => `${pct}% dominado`,
    onFrontier: (n: number) => `${n} na fronteira`,
    exclude: "Excluir este tópico",
    excludeKicker: "Excluir tópico",
    excludeAsk: (subject: string) => `Excluir “${subject}”?`,
    excludeBody:
      "O mapa, seus estados de domínio, seus cartões e tudo que foi gerado para ele são apagados. Sua sequência permanece. Não dá para desfazer.",
    excludeConfirm: "Excluir",
    excludeCancel: "Manter",
  },
} as const;
