// ---- the spine: one ranked inventory per concept-level --------------------
// The contract every phase builds on (docs/PLAN-FLOW.md §2). Generated once per
// concept-level by the server, cached like any kind, and read by Consume,
// Explain, Perform, Retain and the exam — which is what connects the phases and
// lets a miss anywhere name the item it missed. It is data, not an engine: each
// phase keeps its own reducer, shape, validator and grader.
//
// Types only until WS2 lands the `spine` generator; the ids are what the other
// workstreams key on.

/** A key idea: something that must be known. Ids `K1`…`K6`. */
export interface SpineIdea {
  id: string;
  text: string;
  /** Why it matters — what breaks without it. */
  why: string;
}

/** A most-used real situation, ranked by how often a practitioner meets it. Ids `C1`…. */
export interface SpineCase {
  id: string;
  situation: string;
  /** Jev's rank or the model's own order, 1 = most common. */
  frequency: number;
}

/** A boundary where the rule bends or fails. Ids `E1`…. */
export interface SpineEdge {
  id: string;
  condition: string;
  whatChanges: string;
}

/** A misconception, commonest first. Ids `M1`…. */
export interface SpineTrap {
  id: string;
  belief: string;
  /** Why it is tempting — what the right reply must go after. */
  tempting: string;
  fix: string;
}

export interface SpineTerm {
  term: string;
  meaning: string;
  /** The symbol or method name every phase must reuse verbatim. */
  notation?: string;
}

export interface Spine {
  nodeId: string;
  /** 1 for the concept itself, 2-3 for a deeper level. */
  level: 1 | 2 | 3;
  ideas: SpineIdea[];
  cases: SpineCase[];
  edges: SpineEdge[];
  traps: SpineTrap[];
  terms: SpineTerm[];
}

/** Every spine item id, in K / C / E / M order — what coverage is checked over. */
export function spineIds(
  s: Pick<Spine, "ideas" | "cases" | "edges" | "traps">,
): string[] {
  return [...s.ideas, ...s.cases, ...s.edges, ...s.traps].map((x) => x.id);
}

/** The card forms the deck writes (docs/PLAN-FLOW.md §5). */
export type CardFormat = "cloze" | "qa" | "reversed" | "figure" | "step" | "contrast";

/**
 * Where a card came from, so a miss can be traced back: the Consume section it
 * covers, the atoms of that section it carries, and their spine ids. Optional —
 * every card written before the pivot has none.
 */
export interface CardTrace {
  /** The Consume section id — the target of the "rever" link. */
  section?: string;
  /** The section's atom ids (`s2.a3`) this card covers. */
  atoms?: string[];
  /** The spine ids those atoms carry. */
  spine?: string[];
  format?: CardFormat;
  /** The other side of a reversed pair, or another card on the same atom —
   *  never dealt on the same day (sibling burying). */
  siblingOf?: string;
}

/** One learner signal, tagged by spine id — what the exam weights and the
 *  personal cards are drafted from. Lands in `phase_attempts.detail`. */
export interface SpineSignal {
  phase: "consume" | "explain" | "perform" | "retain" | "exam";
  spine: string[];
  passed: boolean;
}
