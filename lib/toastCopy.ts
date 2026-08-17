// What the *hooks* say, in the learner's language.
//
// Components co-locate their own `STRINGS = { en, "pt-BR" }` and read it with
// `useT`. The hooks under `components/atlas/` can't: they fire copy from
// callbacks (`showToast`, the generating overlay's kicker/message, a
// `confirm()`), long after render. Same shape as `lib/errorCopy.ts`, read the
// same way — `TOAST_STRINGS[languageRef.current]`.
//
// Phase names (Consume, Socratic, Feynman, Connect, Crucible, Retain) stay in
// English in both languages: they're the product's own vocabulary, and the map
// labels them that way everywhere.

import type { Language } from "@/lib/i18n";

const EN = {
  mapUpdated: "Map updated",
  locked: "Locked — learn the highlighted path first",
  clearPrereqs: "Clear its prerequisites first",
  sessionHint: "Session · double-click a glowing frontier node to begin",

  // Onboarding / maps
  nameTopicFirst: "Name a topic first — the map is generated from it",
  nameTopicNext: "Name a topic to build your next map.",
  excluded: (subject: string) => `“${subject}” excluded`,
  readingFile: (name: string) => `Reading ${name}…`,
  groundedIn: (name: string) => `Grounded in ${name} ✓ — the map will follow its outline`,
  unreadableFile: "Couldn't read that file",
  gapAdded: (label: string, parent: string, reason: string) =>
    `Added ${label} under ${parent} — ${reason}`,
  deleteAccount:
    "Delete your account and all data — map, cards, streak? This cannot be undone.",

  // Spiral
  nothingToWire: (label: string) =>
    `Nothing on your map to wire ${label} into yet — straight to the Crucible.`,
  gapsAttached: (n: number, label: string) =>
    `Attached ${n} gap${n === 1 ? "" : "s"} under ${label} — now wire it into what you already know.`,
  cardsDrafted: (n: number) =>
    `${n} card${n === 1 ? "" : "s"} drafted for Review · now prove it transfers — the Crucible.`,
  workspaceEmpty: "Put something in the workspace — even a wrong attempt is diagnostic",
  transferBroke: (gap: string, label: string) =>
    `Transfer broke on “${gap}” — written back as a red gap under ${label}`,
  transferConfirmed: (label: string) =>
    `Transfer confirmed · ${label} is Mastered — it now feeds Review`,
  queueClear: "Queue clear — nothing due right now. Cards resurface as memories fade.",
  nothingToReview:
    "Nothing to review yet — learn your first concept and cards draft themselves",
  thisNode: "This node",
  cardFlaggedShaky: (label: string) =>
    `“${label}” flagged Shaky — retention failure re-enters the loop`,
  reEnteringLoop: (label: string) =>
    `Re-entering the loop · ${label} — retention failure routes back to Consume`,
  gapClosed: (label: string) => `Gap closed · ${label} resolved and off the map`,
  gapNotClosed: "Gap not closed",
  stillLeaning: (label: string) =>
    `Still leaning on being told — ${label} stays flagged until it's reconstructed unaided.`,
  reReadFirst: "Re-read this first",
  leaningOnTold: (label: string) =>
    `Leaning on "Just tell me" — back through the reading on ${label} before the questions come again.`,
  pruned: (label: string) =>
    `${label} pruned — diagnosed known. The frontier moved past it.`,
  redoing: (phase: string, label: string) =>
    `Re-doing ${phase} · ${label} — the spiral stays open`,
  jumpingAhead: (phase: string, label: string) => `Jumping ahead · ${label} → ${phase}`,

  // Generating overlay — kicker · message
  kickerConsume: "Session · Consume",
  kickerSocratic: "Session · Socratic",
  kickerFeynman: "Session · Feynman",
  kickerConnect: "Session · Connect",
  kickerCrucible: "Session · Crucible",
  kickerRetain: "Retain · Review",
  writingReading: (label: string) => `Writing your reading pass on ${label}…`,
  preparingQuestions: (label: string) => `Preparing the questions that build ${label}…`,
  wakingStudent: (label: string) => `Waking the naive student for ${label}…`,
  findingWires: (label: string) => `Finding what ${label} wires into…`,
  forgingProblem: (label: string) => `Forging a problem ${label} was never taught in…`,
  draftingCards: "Drafting cards from what you've learned…",

  // The synthetic Socratic gap written onto the map — no model wrote this one.
  socraticGapLabel: (label: string) => `${label} — foundations`,
  socraticGapReason: "Leaned on being told outright more than once in the Socratic pass",
};

export const TOAST_STRINGS: Record<Language, typeof EN> = {
  en: EN,
  "pt-BR": {
    mapUpdated: "Mapa atualizado",
    locked: "Bloqueado — percorra primeiro o caminho destacado",
    clearPrereqs: "Conclua os pré-requisitos primeiro",
    sessionHint: "Sessão · dê dois cliques num nó brilhante da fronteira para começar",

    nameTopicFirst: "Dê um nome ao tema primeiro — o mapa é gerado a partir dele",
    nameTopicNext: "Dê um nome ao tema para construir seu próximo mapa.",
    excluded: (subject: string) => `“${subject}” excluído`,
    readingFile: (name: string) => `Lendo ${name}…`,
    groundedIn: (name: string) => `Baseado em ${name} ✓ — o mapa vai seguir esse roteiro`,
    unreadableFile: "Não consegui ler esse arquivo",
    gapAdded: (label: string, parent: string, reason: string) =>
      `${label} adicionado sob ${parent} — ${reason}`,
    deleteAccount:
      "Apagar sua conta e todos os dados — mapa, cards, sequência? Isso não pode ser desfeito.",

    nothingToWire: (label: string) =>
      `Ainda não há nada no seu mapa para conectar a ${label} — direto para o Crucible.`,
    gapsAttached: (n: number, label: string) =>
      `${n} lacuna${n === 1 ? "" : "s"} anexada${n === 1 ? "" : "s"} sob ${label} — agora conecte isso ao que você já sabe.`,
    cardsDrafted: (n: number) =>
      `${n} card${n === 1 ? "" : "s"} criado${n === 1 ? "" : "s"} para a Revisão · agora prove que transfere — o Crucible.`,
    workspaceEmpty:
      "Escreva algo na área de trabalho — até uma tentativa errada é diagnóstica",
    transferBroke: (gap: string, label: string) =>
      `A transferência falhou em “${gap}” — registrada como lacuna vermelha sob ${label}`,
    transferConfirmed: (label: string) =>
      `Transferência confirmada · ${label} está Dominado — agora alimenta a Revisão`,
    queueClear:
      "Fila zerada — nada pendente agora. Os cards voltam conforme a memória enfraquece.",
    nothingToReview:
      "Nada para revisar ainda — aprenda seu primeiro conceito e os cards se escrevem sozinhos",
    thisNode: "Este nó",
    cardFlaggedShaky: (label: string) =>
      `“${label}” marcado como Instável — a falha de retenção reentra no ciclo`,
    reEnteringLoop: (label: string) =>
      `Reentrando no ciclo · ${label} — a falha de retenção volta para o Consume`,
    gapClosed: (label: string) => `Lacuna fechada · ${label} resolvido e fora do mapa`,
    gapNotClosed: "Lacuna não fechada",
    stillLeaning: (label: string) =>
      `Ainda apoiado na resposta pronta — ${label} continua marcado até ser reconstruído sozinho.`,
    reReadFirst: "Releia isto primeiro",
    leaningOnTold: (label: string) =>
      `Apoiando-se no “Só me diga” — volte à leitura de ${label} antes que as perguntas voltem.`,
    pruned: (label: string) =>
      `${label} podado — diagnosticado como conhecido. A fronteira avançou.`,
    redoing: (phase: string, label: string) =>
      `Refazendo ${phase} · ${label} — a espiral continua aberta`,
    jumpingAhead: (phase: string, label: string) =>
      `Pulando à frente · ${label} → ${phase}`,

    kickerConsume: "Sessão · Consume",
    kickerSocratic: "Sessão · Socratic",
    kickerFeynman: "Sessão · Feynman",
    kickerConnect: "Sessão · Connect",
    kickerCrucible: "Sessão · Crucible",
    kickerRetain: "Retain · Revisão",
    writingReading: (label: string) => `Escrevendo sua leitura sobre ${label}…`,
    preparingQuestions: (label: string) =>
      `Preparando as perguntas que constroem ${label}…`,
    wakingStudent: (label: string) => `Acordando o aluno ingênuo para ${label}…`,
    findingWires: (label: string) => `Procurando com o que ${label} se conecta…`,
    forgingProblem: (label: string) =>
      `Forjando um problema em que ${label} nunca foi ensinado…`,
    draftingCards: "Escrevendo cards a partir do que você aprendeu…",

    socraticGapLabel: (label: string) => `${label} — fundamentos`,
    socraticGapReason:
      "Apoiou-se na resposta pronta mais de uma vez na passagem Socrática",
  },
};

/** The hook-side copy table for a language. */
export function toastStrings(lang: Language = "en") {
  return TOAST_STRINGS[lang];
}
