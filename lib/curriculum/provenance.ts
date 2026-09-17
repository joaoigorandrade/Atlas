// ---- Phase · Provenance (evidence quality) ---------------------------------
// One real source, and the question a historian asks before "is this true?":
// what is this document FOR? A learner is handed an excerpt and rules each
// claim three ways — the source ASSERTS it, the source's existence PROVES it,
// or neither.
//
// The signal no other phase extracts. Discriminate rules instances of a class;
// Trace follows a mechanism; Socratic reasons under questioning. None of them
// asks whether the evidence in front of you supports what is being hung on it,
// which in an interpretive domain is the whole craft.
//
// Graded locally. Every claim carries its answer, so this phase costs one
// generation and no judge call.

import { Language } from "@/lib/i18n";

/** Provenance's accent: an archival sepia. */
export const PROVENANCE_COLOR = {
  accent: "#8a6f4e",
  soft: "rgba(138,111,78,0.08)",
  border: "rgba(138,111,78,0.32)",
} as const;

/**
 * The three rulings, and the distinction the phase exists to teach.
 *
 * `asserts` and `proves` are the pair learners collapse: a papal bull claiming
 * universal authority is strong evidence that the claim was MADE, and no
 * evidence at all that it was accepted. A learner who marks everything the
 * source says as proved has read it as a transcript of reality.
 */
export const PROVENANCE_RULINGS = ["asserts", "proves", "neither"] as const;
export type ProvenanceRuling = (typeof PROVENANCE_RULINGS)[number];

/** The excerpt itself, with everything needed to read it as a document rather
 *  than as a fact: who wrote it, to whom, and when. */
export interface ProvenanceSource {
  title: string;
  /** Who produced it, and for what audience — the load-bearing context. */
  attribution: string;
  date: string;
  excerpt: string;
}

export interface ProvenanceClaim {
  id: string;
  /** A statement about the world, to be ruled against the source. */
  claim: string;
  ruling: ProvenanceRuling;
  /** Why it is that ruling — revealed only after the learner commits. */
  because: string;
}

export interface ProvenanceContent {
  nodeId: string;
  nodeLabel: string;
  source: ProvenanceSource;
  claims: ProvenanceClaim[];
  /** What the source is silent about — shown at the end, because "whose voice
   *  is missing" is not a claim that can be ruled, and is half the lesson. */
  silence: string;
}

export interface ProvenanceSession {
  nodeId: string;
  /** Which claim is open; equal to `claims.length` when the run is finished. */
  index: number;
  /** Committed ruling per claim id. A claim with one is answered. */
  rulings: Record<string, ProvenanceRuling>;
  done: boolean;
}

export function provenanceStart(nodeId: string): ProvenanceSession {
  return { nodeId, index: 0, rulings: {}, done: false };
}

export type ProvenanceAction =
  { type: "rule"; ruling: ProvenanceRuling } | { type: "next" };

export function provenanceReducer(
  session: ProvenanceSession,
  action: ProvenanceAction,
  content: ProvenanceContent,
): ProvenanceSession {
  const item = content.claims[session.index];
  switch (action.type) {
    case "rule": {
      // One ruling per claim, for the same reason Discriminate allows one
      // call: cycling the options until the reveal turns green is recognition,
      // not judgement.
      if (!item || session.rulings[item.id] !== undefined) return session;
      return { ...session, rulings: { ...session.rulings, [item.id]: action.ruling } };
    }
    case "next": {
      if (!item || session.rulings[item.id] === undefined) return session;
      const index = session.index + 1;
      return { ...session, index, done: index >= content.claims.length };
    }
    default:
      return session;
  }
}

export function provenanceScore(
  session: ProvenanceSession,
  content: ProvenanceContent,
): number {
  return content.claims.filter((c) => session.rulings[c.id] === c.ruling).length;
}

/** Claims the learner took the source's word for — ruled `proves` where it only
 *  `asserts`. The specific error this phase exists to catch, counted on its own
 *  because a learner can score two thirds while making it every time. */
export function provenanceOvertrusted(
  session: ProvenanceSession,
  content: ProvenanceContent,
): ProvenanceClaim[] {
  return content.claims.filter(
    (c) => c.ruling === "asserts" && session.rulings[c.id] === "proves",
  );
}

/**
 * Provenance's gate: two thirds of the claims, and at most one claim where the
 * source was taken at its word.
 *
 * The second clause is the phase's own standard, the way the over-inclusion cap
 * is Discriminate's. Reading a document as a record of what happened rather
 * than as an act by an interested party is the failure, and it survives a
 * two-thirds score untouched.
 */
export function provenancePassed(
  session: ProvenanceSession,
  content: ProvenanceContent,
): boolean {
  if (!content.claims.length) return session.done;
  const enough =
    provenanceScore(session, content) >= Math.ceil(content.claims.length * (2 / 3));
  return enough && provenanceOvertrusted(session, content).length <= 1;
}

/** Exported so `tests/i18nCoverage.test.ts` can hold both halves against
 *  each other — a table outside its component is one this suite covers. */
export const PROVENANCE_COPY = {
  en: {
    kicker: "Provenance",
    lead: "What is this source for, and what will it actually carry?",
    theSource: "The source",
    theClaim: "The claim",
    because: "Why",
    silence: "What it does not say",
    asserts: "The source claims it",
    proves: "The source proves it",
    neither: "Neither",
    passed: "You read it as a document, not as a record. That is the craft.",
    missed: "Some of these the source only claims. The reasons above say which.",
    overtrusted:
      "You took the source at its word — that it was said is not that it was so.",
    next: "Next claim →",
  },
  "pt-BR": {
    kicker: "Provenance",
    lead: "Para que serve esta fonte, e o que ela realmente sustenta?",
    theSource: "A fonte",
    theClaim: "A afirmação",
    because: "Por quê",
    silence: "O que ela não diz",
    asserts: "A fonte afirma",
    proves: "A fonte prova",
    neither: "Nenhum dos dois",
    passed: "Você a leu como documento, não como registro. É esse o ofício.",
    missed: "Algumas coisas a fonte apenas afirma. Os motivos acima dizem quais.",
    overtrusted: "Você acreditou na fonte — ter sido dito não é ter sido assim.",
    next: "Próxima afirmação →",
  },
} as const;

export function provenanceCopy(lang: Language = "en") {
  return PROVENANCE_COPY[lang];
}
