import { STATE_COLOR, type AltKey, type ConsumeProgress } from "@/lib/curriculum";

// Consume is a Learning-phase surface: its accents borrow the shared state
// colors (learning blue, plus mastered/shaky for right/wrong verdicts).
export const BLUE = STATE_COLOR.learning;
export const RIGHT = STATE_COLOR.mastered;
export const WRONG = STATE_COLOR.shaky;

export const STRINGS = {
  en: {
    back: "← Map",
    sessionLabel: "Session · Consume",
    iKnowThis: "I know this →",
    kicker: "Grounded, dual-coded reading",
    intro: (n: number) =>
      n > 0
        ? `This is the reading. ${n} sections, each with a worked example and a diagram — read them straight through.`
        : "This is the reading —",
    introTail:
      "Rewrite any section to fit how you think, tap a term for its meaning before it’s used, and ask about any passage that doesn’t land. The questioning starts in Socratic, after this.",
    writingFirst: "Writing your first section…",
    workedExample: "Worked example",
    takeaway: "Takeaway",
    furtherReading: "further reading",
    modelKicker: "Model view",
    modelOpening: "Opening this view…",
    modelWriting: "still writing…",
    modelBeat: (n: number, total: number) => `Beat ${n} of ${total}`,
    modelNext: "Next beat ↓",
    modelRevealAll: "Show all",
    modelClose: "Close",
    modelBack: "← Back to the section",
    modelEmpty: "This view came back empty — close it and try another lens.",
    diagramLabel: "diagram ·",
    finishBeginSocratic: "Finish · begin Socratic →",
    continueSection: (next: string) => `Continue · ${next} ↓`,
    writingNext: "Writing the next section…",
    simplifyingTitle: "Simplifying a lot?",
    simplifyingBody:
      "Repeatedly reaching for the simpler version usually means an earlier concept is shaky.",
    reviewPrereq: "Review prerequisite →",
    term: "term",
    readAloud: "Read this section aloud",
    pauseReading: "Pause the reading",
    resumeReading: "Resume the reading",
    startingReading: "Starting the reading…",
    bufferingReading: "Loading the next part…",
    readingFailed: "Reading failed — tap to try again",
    readingFailedNote: "Couldn't read this aloud",
    skipSection: "Skip — I know this",
    showFullSection: "Show full section →",
    minLeft: (n: number) => (n > 0 ? `~${n} min left` : ""),
    askFloating: "Ask about this →",
    jumpTo: (n: number, name: string) => `Jump to section ${n} · ${name}`,
    figureOf: (name: string) => `Diagram: ${name}`,
    yourDefault: "your default",
    // ---- ask about this
    askSection: "Ask about this section →",
    askAbout: "You asked about",
    askWholeSection: "About this section",
    askPlaceholder: "What didn’t land? Ask in your own words…",
    askSubmit: "Ask →",
    askExplain: "Explain this →",
    askSuggested: "Not sure what to ask?",
    askThinking: "Reading the passage…",
    askClose: "Close",
    readingIncomplete:
      "The rest of this reading pass didn’t arrive — what’s above is complete.",
    readingRetry: "Fetch the rest",
    askFailed: "Couldn’t answer that one.",
    askRetry: "Ask again",
    // ---- the closing beat
    recapKicker: "Session · Consume — complete",
    recapTitle: (t: string) => `That was ${t}.`,
    recapLead:
      "Everything below came out of the reading you just did. Socratic starts from here — it will ask you to rebuild it without looking.",
    recapSections: (n: number) => `${n} section${n === 1 ? "" : "s"} read`,
    recapMinutes: (n: number) => `~${n} min`,
    recapTerms: (n: number) => `${n} term${n === 1 ? "" : "s"} met`,
    recapTakeaways: "What you took away",
    recapSkipped: "skipped",
    recapTermsHeading: "Terms you opened",
    recapBegin: "Begin Socratic →",
    recapBackToMap: "Back to the map",
    recapReread: "↑ Re-read",
    checkKicker: "Before you continue",
    checkHint: "Answer from what you just read — this unlocks the next section.",
    checkAgain: "Not quite — read that part again, then pick another.",
    checkPassed: "Understood",
  },
  "pt-BR": {
    back: "← Mapa",
    sessionLabel: "Sessão · Consumir",
    iKnowThis: "Já sei isso →",
    kicker: "Leitura fundamentada, com dupla codificação",
    intro: (n: number) =>
      n > 0
        ? `Esta é a leitura. ${n} seções, cada uma com um exemplo resolvido e um diagrama — leia-as em sequência.`
        : "Esta é a leitura —",
    introTail:
      "Reescreva qualquer seção do jeito que funciona melhor para você, toque em um termo para ver o significado antes de ele ser usado, e pergunte sobre qualquer trecho que não fez sentido. As perguntas começam no Socrático, depois disso.",
    writingFirst: "Escrevendo sua primeira seção…",
    workedExample: "Exemplo resolvido",
    takeaway: "Ideia central",
    furtherReading: "para ler depois",
    modelKicker: "Visão do modelo",
    modelOpening: "Abrindo esta visão…",
    modelWriting: "ainda sendo escrito…",
    modelBeat: (n: number, total: number) => `Passo ${n} de ${total}`,
    modelNext: "Próximo passo ↓",
    modelRevealAll: "Mostrar tudo",
    modelClose: "Fechar",
    modelBack: "← Voltar à seção",
    modelEmpty: "Esta visão voltou vazia — feche e tente outra lente.",
    diagramLabel: "diagrama ·",
    finishBeginSocratic: "Concluir · começar o Socrático →",
    continueSection: (next: string) => `Continuar · ${next} ↓`,
    writingNext: "Escrevendo a próxima seção…",
    simplifyingTitle: "Simplificando bastante?",
    simplifyingBody:
      "Recorrer repetidamente à versão mais simples geralmente indica que um conceito anterior está instável.",
    reviewPrereq: "Revisar pré-requisito →",
    term: "termo",
    readAloud: "Ouvir esta seção",
    pauseReading: "Pausar a leitura",
    resumeReading: "Continuar a leitura",
    startingReading: "Iniciando a leitura…",
    bufferingReading: "Carregando a próxima parte…",
    readingFailed: "A leitura falhou — toque para tentar de novo",
    readingFailedNote: "Não deu para ler em voz alta",
    skipSection: "Pular — já sei isso",
    showFullSection: "Mostrar seção completa →",
    minLeft: (n: number) => (n > 0 ? `~${n} min restantes` : ""),
    askFloating: "Perguntar sobre isto →",
    jumpTo: (n: number, name: string) => `Ir para a seção ${n} · ${name}`,
    figureOf: (name: string) => `Diagrama: ${name}`,
    yourDefault: "seu padrão",
    // ---- ask about this
    askSection: "Perguntar sobre esta seção →",
    askAbout: "Você perguntou sobre",
    askWholeSection: "Sobre esta seção",
    askPlaceholder: "O que não ficou claro? Pergunte com suas palavras…",
    askSubmit: "Perguntar →",
    askExplain: "Explicar isto →",
    askSuggested: "Não sabe o que perguntar?",
    askThinking: "Lendo o trecho…",
    askClose: "Fechar",
    readingIncomplete:
      "O resto desta leitura não chegou — o que está acima está completo.",
    readingRetry: "Buscar o resto",
    askFailed: "Não consegui responder essa.",
    askRetry: "Perguntar de novo",
    // ---- the closing beat
    recapKicker: "Sessão · Consumir — concluída",
    recapTitle: (t: string) => `Isso foi ${t}.`,
    recapLead:
      "Tudo abaixo saiu da leitura que você acabou de fazer. O Socrático começa daqui — ele vai pedir que você reconstrua isso sem olhar.",
    recapSections: (n: number) => `${n} ${n === 1 ? "seção lida" : "seções lidas"}`,
    recapMinutes: (n: number) => `~${n} min`,
    recapTerms: (n: number) => `${n} ${n === 1 ? "termo visto" : "termos vistos"}`,
    recapTakeaways: "O que você leva daqui",
    recapSkipped: "pulada",
    recapTermsHeading: "Termos que você abriu",
    recapBegin: "Começar o Socrático →",
    recapBackToMap: "Voltar ao mapa",
    recapReread: "↑ Reler",
    checkKicker: "Antes de continuar",
    checkHint: "Responda com o que você acabou de ler — isso libera a próxima seção.",
    checkAgain: "Ainda não — releia esse trecho e escolha outra.",
    checkPassed: "Entendido",
  },
} as const;

/** An open "ask about this" — one per session, held by AtlasApp because the
 *  answer streams in from the server. The draft question stays local to the
 *  panel; only a submitted ask reaches here. */
export interface PassageAsk {
  chunkId: string;
  /** What the learner highlighted, or "" when they asked about the whole
   *  section (the keyboard path — selection is a pointer gesture). */
  selection: string;
  /** The submitted question, or "" for a bare "explain this". */
  question: string;
  /** Answer paragraphs as they stream in. */
  parts: string[];
  status: "composing" | "asking" | "done" | "error";
}

/**
 * The live state of one Consume session — held by AtlasApp, read here.
 *
 * It *is* the persisted `ConsumeProgress` plus the transient UI nobody needs
 * restored: which term pill is open, whether an ask panel is up, whether the
 * closing recap has taken over the screen. Keeping it one type is what makes
 * resuming a session and saving one the same operation minus a spread.
 */
export interface ConsumeSession extends ConsumeProgress {
  nodeId: string;
  /** The pre-taught term expanded inline, keyed `chunkId:term`. */
  term: string | null;
  /** The learned modality this learner reads best in — the lens marked as
   *  theirs on sections they haven't opened one over yet (§6's adaptive
   *  modality). It suggests; it never opens anything by itself. */
  preferred: AltKey | null;
  /** The model view currently open over a section, or null. The section it
   *  belongs to stays mounted underneath — a lens opens over the reading, it
   *  never replaces it. */
  model: { chunkId: string; lens: AltKey } | null;
  /** The open "ask about this", or null. */
  passage: PassageAsk | null;
  /** The reading is done and the closing recap is on screen. */
  recap: boolean;
}
