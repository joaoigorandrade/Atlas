// Socratic's copy, lifted out of the view so the file stays under its size
// ceiling — the same move `retainCopy.ts` and `crucibleCopy.tsx` already make.
// `move` names the classic Socratic move each probe is making: unlike the phase
// names, it is not product vocabulary, so it translates.

export const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session · Socratic",
    scaffolding: "Scaffolding",
    breadcrumbLead: "Construct the idea · I catch wrong turns, I don’t smooth them over",
    judgeFailed: "That answer didn’t get graded — nothing was lost.",
    judgeRetry: "Grade it again",
    doneGap: "Sub-point rebuilt — this gap can close.",
    doneUnderstood: "Understanding established — you reconstructed it unaided.",
    doneAssisted: "Understanding built — with a nudge along the way.",
    doneFlagged: "Leaning on being told — let's shore up the basics first.",
    advanceGap: "Close the gap · back to the map →",
    advanceTeach: (phase: string) => `Continue · ${phase} →`,
    advanceBack: "Back to the map →",
    advanceReread: "Re-read this first · Consume →",
    yourAnswer: "Your answer — in your own words",
    placeholderJudging: "Reading your answer…",
    placeholderWriting: "Writing the next probe…",
    placeholderAnswer: "Type what you think — wrong turns get caught, not judged",
    send: "Send",
    stuck: "I’m stuck · more help",
    // Not "Just tell me": under the ladder this is the bottom rung reached by
    // hand rather than a confession, and it costs exactly what stalling into
    // that rung costs. The old wording made the only exit from a hard step
    // read as giving up.
    tellMe: "Show me this one",
    probeCount: (at: number, of: number) => `Probe ${at} of ${of}`,
    banked: "What you’ve established",
    stillOpen: "Still open",
    move: {
      Clarify: "Clarify",
      "Challenge the assumption": "Challenge the assumption",
      "Probe the reasoning": "Probe the reasoning",
      "Probe the implications": "Probe the implications",
    },
  },
  "pt-BR": {
    back: "← Mapa",
    judgeFailed: "Essa resposta não foi avaliada — nada foi perdido.",
    judgeRetry: "Avaliar de novo",
    sessionLabel: "Sessão · Socratic",
    scaffolding: "Apoio",
    breadcrumbLead: "Construa a ideia · eu flagro raciocínios errados, não deixo passar",
    doneGap: "Subponto reconstruído — essa lacuna pode se fechar.",
    doneUnderstood: "Compreensão estabelecida — você reconstruiu isso sozinho.",
    doneAssisted: "Compreensão construída — com uma ajuda pelo caminho.",
    doneFlagged: "Dependendo de respostas prontas — vamos reforçar a base primeiro.",
    advanceGap: "Fechar a lacuna · voltar ao mapa →",
    advanceTeach: (phase: string) => `Continuar · ${phase} →`,
    advanceBack: "Voltar ao mapa →",
    advanceReread: "Reler primeiro · Consumir →",
    yourAnswer: "Sua resposta — com suas próprias palavras",
    placeholderJudging: "Lendo sua resposta…",
    placeholderWriting: "Escrevendo a próxima pergunta…",
    placeholderAnswer:
      "Digite o que você pensa — raciocínios errados são flagrados, não julgados",
    send: "Enviar",
    move: {
      Clarify: "Esclarecer",
      "Challenge the assumption": "Questionar a premissa",
      "Probe the reasoning": "Sondar o raciocínio",
      "Probe the implications": "Sondar as implicações",
    },
    stuck: "Estou travado · mais ajuda",
    tellMe: "Mostre-me esta",
    probeCount: (at: number, of: number) => `Pergunta ${at} de ${of}`,
    banked: "O que você já estabeleceu",
    stillOpen: "Ainda em aberto",
  },
} as const;
