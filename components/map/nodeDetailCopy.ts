// NodeDetail's copy.
//
// Its own file on the `crucibleCopy` / `retainCopy` precedent: a table outside
// its component is one `tests/i18nCoverage.test.ts` covers, which is what
// catches a line that came out identical in both languages.

import type { NodeState } from "@/lib/curriculum";

export const STRINGS = {
  en: {
    // The phase half comes from the node's own plan (`primaryPhase`) — a fixed
    // "Continue · Feynman" named a phase the button no longer opens.
    cta: {
      frontier: (phase: string) => `Begin · ${phase}`,
      learning: (phase: string) => `Continue · ${phase}`,
      shaky: (phase: string) => `Re-attempt · ${phase}`,
      mastered: () => "Review now",
      gap: () => "Fix this gap",
      unknown: () => "Locked",
    } as Record<NodeState, (phase: string) => string>,
    phaseSpiral: "Phase spiral",
    next: "next",
    redo: "redo",
    readingProgress: (read: number, total: number) => `${read} of ${total} read`,
    resumeReading: "Resume reading",
    doFirst: (phase: string) => `Do ${phase} first`,
    skipTo: (phase: string) => `Skip to ${phase} →`,
    skipKnown: "I already know this — skip it",
    openGaps: "Open gaps · spawned from failures",
    repair: "Targeted repair",
    repairStep: "Socratic pass",
    repairNote: "one pass · closes this gap",
    spawnedFrom: "Spawned from",
    learnFirst: "Learn these first",
    prerequisites: "Prerequisites",
    unlocks: "Unlocks",
    ledHere: "What led here",
    ledTo: "What it led to",
    finishFirst: "Finish first",
    thenComes: "Then comes",
  },
  "pt-BR": {
    cta: {
      frontier: (phase: string) => `Começar · ${phase}`,
      learning: (phase: string) => `Continuar · ${phase}`,
      shaky: (phase: string) => `Tentar de novo · ${phase}`,
      mastered: () => "Revisar agora",
      gap: () => "Corrigir esta lacuna",
      unknown: () => "Bloqueado",
    } as Record<NodeState, (phase: string) => string>,
    phaseSpiral: "Espiral de fases",
    next: "próximo",
    redo: "refazer",
    readingProgress: (read: number, total: number) => `${read} de ${total} lidas`,
    resumeReading: "Retomar a leitura",
    doFirst: (phase: string) => `Fazer ${phase} primeiro`,
    skipTo: (phase: string) => `Pular para ${phase} →`,
    skipKnown: "Eu já sei isso — pular",
    openGaps: "Lacunas abertas · geradas por falhas",
    repair: "Reparo direcionado",
    repairStep: "Passagem socrática",
    repairNote: "uma passagem · fecha esta lacuna",
    spawnedFrom: "Originado de",
    learnFirst: "Aprenda isso primeiro",
    prerequisites: "Pré-requisitos",
    unlocks: "Desbloqueia",
    ledHere: "O que levou até aqui",
    ledTo: "No que isso deu",
    finishFirst: "Termine isso antes",
    thenComes: "Depois vem",
  },
} as const;
