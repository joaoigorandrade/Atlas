// The Crucible's copy, lifted out of the view so the file stays under its size
// ceiling. Two entries render JSX (a bolded state name inside a sentence),
// which is why this is a .tsx.

export const STRINGS = {
  en: {
    map: "← Map",
    sessionCrucible: "Session · Crucible",
    kickerApplication: "Application · transfer under desirable difficulty",
    heading: "Prove it transfers.",
    intro:
      "Recognizing an idea when it’s handed to you is fluency, not mastery. The Crucible hands you the concept in a framing you’ve never seen — if it survives that, it’s yours.",
    kickerWorkspace: "Workspace · a wrong attempt is diagnostic",
    judgingAttempt: "Judging your attempt",
    submitAttempt: "Submit attempt",
    fillSample: "fill a sample attempt",
    kickerCalibration: "Calibration · before you see it",
    confidenceQuestion:
      "How sure are you that you can apply this in a situation you’ve never seen?",
    confidenceBody:
      "We record this now, then compare it to what actually happens. The gap between the two is the most useful thing here.",
    nudge: (hint: string) => `Nudge · ${hint}`,
    kickerTransferDiagnostic: "Transfer diagnostic · what carried over",
    kickerConfidenceVsResult: "Confidence vs. result",
    gapWrittenTitle: "A gap was written back to your map.",
    gapWrittenBody: (gapLabel: string) => (
      <>
        “{gapLabel}” is now a red gap under this node, and the node itself dropped to{" "}
        <b>Shaky</b>. Close it here and it lifts to Mastered.
      </>
    ),
    hideReExplain: "Hide re-explanation",
    reExplainSocratic: "Re-explain · 30-sec Socratic",
    retryRung: "Re-attempt · one rung down →",
    reExplainLead: "A 30-second Socratic re-explanation, aimed straight at the gap:",
    transferConfirmedTitle: "Transfer confirmed.",
    transferConfirmedBody: (
      <>
        You applied it in a framing you were never handed. The gap is closed and this node
        lifts to <b>Mastered</b> — it now feeds Review on a spaced schedule.
      </>
    ),
    markMastered: "Mark Mastered · back to map →",
    difficultyLadder: "Difficulty ladder",
    drawnFromMap: "Drawn from your map",
    interleaveNote:
      "The problem interleaves mastered nodes so retrieval isn’t blocked on one idea.",
    youSaid: "You said",
    heldAgainst: "held against the result below",
  },
  "pt-BR": {
    map: "← Mapa",
    sessionCrucible: "Sessão · Crucible",
    kickerApplication: "Aplicação · transferência sob dificuldade desejável",
    heading: "Prove que isso transfere.",
    intro:
      "Reconhecer uma ideia quando ela é entregue de bandeja é fluência, não domínio. O Crucible entrega o conceito numa moldura que você nunca viu — se sobreviver a isso, é seu.",
    kickerWorkspace: "Espaço de trabalho · uma tentativa errada é diagnóstica",
    judgingAttempt: "Julgando sua tentativa",
    submitAttempt: "Enviar tentativa",
    fillSample: "preencher uma tentativa de exemplo",
    kickerCalibration: "Calibração · antes de ver",
    confidenceQuestion:
      "Quão seguro você está de que consegue aplicar isso numa situação que nunca viu?",
    confidenceBody:
      "Registramos isso agora e depois comparamos com o que realmente acontece. A distância entre os dois é a coisa mais útil aqui.",
    nudge: (hint: string) => `Dica · ${hint}`,
    kickerTransferDiagnostic: "Diagnóstico de transferência · o que se transferiu",
    kickerConfidenceVsResult: "Confiança vs. resultado",
    gapWrittenTitle: "Uma lacuna foi registrada no seu mapa.",
    gapWrittenBody: (gapLabel: string) => (
      <>
        “{gapLabel}” agora é uma lacuna vermelha sob este nó, e o próprio nó caiu para{" "}
        <b>Instável</b>. Feche-a aqui e ele sobe para Dominado.
      </>
    ),
    hideReExplain: "Ocultar reexplicação",
    reExplainSocratic: "Reexplicar · Socrático de 30s",
    retryRung: "Tentar de novo · um degrau abaixo →",
    reExplainLead: "Uma reexplicação Socrática de 30 segundos, direto na lacuna:",
    transferConfirmedTitle: "Transferência confirmada.",
    transferConfirmedBody: (
      <>
        Você aplicou isso numa moldura que nunca tinha recebido. A lacuna está fechada e
        este nó sobe para <b>Dominado</b> — agora ele entra na Revisão em um cronograma
        espaçado.
      </>
    ),
    markMastered: "Marcar como Dominado · voltar ao mapa →",
    difficultyLadder: "Escada de dificuldade",
    drawnFromMap: "Puxado do seu mapa",
    interleaveNote:
      "O problema intercala nós dominados para que a recuperação não fique presa a uma única ideia.",
    youSaid: "Você disse",
    heldAgainst: "comparado ao resultado abaixo",
  },
} as const;
